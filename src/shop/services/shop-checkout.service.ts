import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Product, ShopOrderStatus, TransactionType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { assertUserOwnsAddress, formatAddress } from '../../common/utils/address.utils';
import { MailService } from '../../mail/mail.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { WalletDebitService } from '../../wallet/wallet-debit.service';
import { CreateShopOrderDto } from '../dto/create-shop-order.dto';
import { QuoteShopOrderDto } from '../dto/quote-shop-order.dto';
import { ShopOrderLineItemDto } from '../dto/shop-order-line-item.dto';
import {
  buildDeliveryAddressSnapshot,
  buildShopOrderItems,
  calculateSubtotal,
  formatShopOrderResponse,
  toDeliveryAddressSnapshotJson,
  toQuoteLineItems,
  toShopOrderItemsJson,
} from '../utils/shop.utils';
import { invalidateShopCatalogCache } from '../utils/shop-cache.utils';
import { DeliveryPricingService } from './delivery-pricing.service';
import { ProductCatalogService } from './product-catalog.service';
import { ShopOrderCodeService } from './shop-order-code.service';
import { ShopPushNotifier } from '../../notifications/shop/shop-push.notifier';

@Injectable()
export class ShopCheckoutService {
  constructor(
    private prisma: PrismaService,
    private productCatalogService: ProductCatalogService,
    private deliveryPricingService: DeliveryPricingService,
    private walletDebitService: WalletDebitService,
    private mailService: MailService,
    private redis: RedisService,
    private shopOrderCodeService: ShopOrderCodeService,
    private shopPushNotifier: ShopPushNotifier,
  ) {}

  private normalizeIdempotencyKey(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private isUniqueConstraintError(err: unknown, field: string): boolean {
    if (typeof err !== 'object' || err === null) return false;
    if (!('code' in err) || (err as { code?: string }).code !== 'P2002') {
      return false;
    }

    const fieldSnake = field.replace(
      /[A-Z]/g,
      (match) => `_${match.toLowerCase()}`,
    );
    const target = (err as { meta?: { target?: string[] | string } }).meta
      ?.target;
    if (Array.isArray(target)) {
      return target.includes(field) || target.includes(fieldSnake);
    }
    if (typeof target === 'string') {
      return target.includes(field) || target.includes(fieldSnake);
    }
    return false;
  }

  private buildQuantityMap(items: ShopOrderLineItemDto[]) {
    const quantities = new Map<string, number>();
    for (const item of items) {
      quantities.set(item.productId, item.quantity);
    }
    return quantities;
  }

  private validateStockAvailability(
    products: Product[],
    quantities: Map<string, number>,
  ) {
    for (const product of products) {
      const quantity = quantities.get(product.id) ?? 0;
      if (product.stock < quantity) {
        throw new BadRequestException(
          `Insufficient stock for "${product.name}". Available: ${product.stock}, requested: ${quantity}`,
        );
      }
    }
  }

  private async buildCheckoutContext(userId: string, dto: QuoteShopOrderDto) {
    const address = await assertUserOwnsAddress(
      this.prisma,
      userId,
      dto.addressId,
    );
    const { deliveryFee, deliveryRegion } =
      await this.deliveryPricingService.resolveDeliveryFeeForAddress(address);

    const quantities = this.buildQuantityMap(dto.items);
    const products = await this.productCatalogService.loadActiveProductsForCheckout(
      dto.items.map((item) => item.productId),
    );
    this.validateStockAvailability(products, quantities);

    const orderItems = buildShopOrderItems(products, quantities);
    const subtotal = calculateSubtotal(orderItems);
    const totalAmount = Math.round((subtotal + deliveryFee) * 100) / 100;
    const addressSnapshot = buildDeliveryAddressSnapshot(address);

    return {
      address,
      addressSnapshot,
      deliveryFee,
      deliveryRegion,
      orderItems,
      subtotal,
      totalAmount,
    };
  }

  async quote(userId: string, dto: QuoteShopOrderDto) {
    const context = await this.buildCheckoutContext(userId, dto);

    return {
      items: toQuoteLineItems(context.orderItems),
      subtotal: context.subtotal,
      deliveryFee: context.deliveryFee,
      totalAmount: context.totalAmount,
      deliveryRegion: context.deliveryRegion,
      address: formatAddress(context.address),
    };
  }

  async purchase(userId: string, dto: CreateShopOrderDto) {
    const idempotencyKey =
      this.normalizeIdempotencyKey(dto.idempotencyKey) ?? dto.idempotencyKey;

    const existing = await this.prisma.shopOrder.findFirst({
      where: { userId, idempotencyKey },
    });
    if (existing) {
      return {
        order: formatShopOrderResponse(existing),
        message: 'Shop order already placed',
      };
    }

    const context = await this.buildCheckoutContext(userId, dto);
    const orderId = randomUUID();
    const orderCode = await this.shopOrderCodeService.generateOrderCode();

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    try {
      const order = await this.prisma.$transaction(async (tx) => {
        for (const item of context.orderItems) {
          const updated = await tx.product.updateMany({
            where: {
              id: item.productId,
              stock: { gte: item.quantity },
            },
            data: {
              stock: { decrement: item.quantity },
            },
          });

          if (updated.count === 0) {
            throw new BadRequestException(
              `Insufficient stock for "${item.name}"`,
            );
          }
        }

        await this.walletDebitService.debitWalletAndRecordTx(tx, {
          userId,
          amount: context.totalAmount,
          reference: `SHOP-${orderId}`,
          description: `Shop order ${orderCode} — ${context.orderItems.length} item(s)`,
          type: TransactionType.SHOP_PURCHASE,
          metadata: {
            purpose: 'SHOP_PURCHASE',
            shopOrderId: orderId,
            itemCount: context.orderItems.length,
            deliveryFee: context.deliveryFee,
            subtotal: context.subtotal,
          },
          insufficientBalanceMessage:
            'Insufficient wallet balance to complete this shop order',
        });

        return tx.shopOrder.create({
          data: {
            id: orderId,
            orderCode,
            userId,
            addressId: dto.addressId,
            items: toShopOrderItemsJson(context.orderItems),
            deliveryAddressSnapshot: toDeliveryAddressSnapshotJson(
              context.addressSnapshot,
            ),
            subtotal: context.subtotal,
            deliveryFee: context.deliveryFee,
            totalAmount: context.totalAmount,
            status: ShopOrderStatus.CONFIRMED,
            idempotencyKey,
          },
        });
      });

      void this.redis.del(`wallet:balance:${userId}`);
      void invalidateShopCatalogCache(this.redis);

      void this.mailService.sendShopOrderConfirmationEmail(
        user.email,
        user.firstName,
        {
          orderId: order.id,
          orderCode: order.orderCode,
          items: toQuoteLineItems(context.orderItems),
          deliveryAddress: context.addressSnapshot.fullAddress,
          subtotal: context.subtotal,
          deliveryFee: context.deliveryFee,
          totalAmount: context.totalAmount,
        },
      );

      this.shopPushNotifier.notifyPlaced({
        userId,
        orderId: order.id,
        orderCode: order.orderCode,
      });

      return {
        order: formatShopOrderResponse(order),
        message: 'Shop order placed successfully',
      };
    } catch (err) {
      if (
        this.isUniqueConstraintError(err, 'idempotencyKey') ||
        this.isUniqueConstraintError(err, 'orderCode')
      ) {
        const duplicate = await this.prisma.shopOrder.findFirst({
          where: { userId, idempotencyKey },
        });
        if (duplicate) {
          return {
            order: formatShopOrderResponse(duplicate),
            message: 'Shop order already placed',
          };
        }
      }
      throw err;
    }
  }
}