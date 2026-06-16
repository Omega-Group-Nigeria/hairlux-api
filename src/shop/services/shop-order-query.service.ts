import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  ShopOrderStatus,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { AdminQueryShopOrdersDto } from '../dto/admin-query-shop-orders.dto';
import { QueryShopOrdersDto } from '../dto/query-shop-orders.dto';
import { UpdateShopOrderStatusDto } from '../dto/update-shop-order-status.dto';
import {
  formatAdminShopOrderResponse,
  formatShopOrderResponse,
  normalizeShopOrderItems,
} from '../utils/shop.utils';

@Injectable()
export class ShopOrderQueryService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  private buildDateFilter(startDate?: string, endDate?: string) {
    if (!startDate && !endDate) return undefined;

    const createdAt: { gte?: Date; lte?: Date } = {};
    if (startDate) {
      createdAt.gte = new Date(startDate);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      createdAt.lte = end;
    }
    return createdAt;
  }

  async findUserOrders(userId: string, queryDto: QueryShopOrdersDto) {
    const { status, startDate, endDate } = queryDto;

    const where: {
      userId: string;
      status?: ShopOrderStatus;
      createdAt?: { gte?: Date; lte?: Date };
    } = { userId };

    if (status) {
      where.status = status;
    }

    const createdAt = this.buildDateFilter(startDate, endDate);
    if (createdAt) {
      where.createdAt = createdAt;
    }

    const orders = await this.prisma.shopOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return orders.map((order) => formatShopOrderResponse(order));
  }

  async findUserOrderById(id: string, userId: string) {
    const order = await this.prisma.shopOrder.findUnique({
      where: { id },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.userId !== userId) {
      throw new ForbiddenException('You do not have access to this order');
    }

    return formatShopOrderResponse(order);
  }

  async findAdminOrders(queryDto: AdminQueryShopOrdersDto) {
    const { status, startDate, endDate, userId, search, page = 1, limit = 20 } =
      queryDto;
    const skip = (page - 1) * limit;

    const where: Prisma.ShopOrderWhereInput = {};

    if (status) {
      where.status = status;
    }

    if (userId) {
      where.userId = userId;
    }

    const createdAt = this.buildDateFilter(startDate, endDate);
    if (createdAt) {
      where.createdAt = createdAt;
    }

    if (search?.trim()) {
      const term = search.trim();
      where.OR = [
        { id: { contains: term, mode: 'insensitive' } },
        {
          user: {
            OR: [
              { firstName: { contains: term, mode: 'insensitive' } },
              { lastName: { contains: term, mode: 'insensitive' } },
              { email: { contains: term, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

    const [orders, total] = await Promise.all([
      this.prisma.shopOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
        },
      }),
      this.prisma.shopOrder.count({ where }),
    ]);

    return {
      data: orders.map((order) =>
        formatAdminShopOrderResponse(order, order.user),
      ),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findAdminOrderById(id: string) {
    const order = await this.prisma.shopOrder.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return formatAdminShopOrderResponse(order, order.user);
  }

  async updateOrderStatus(id: string, dto: UpdateShopOrderStatusDto) {
    const order = await this.prisma.shopOrder.findUnique({
      where: { id },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status === ShopOrderStatus.DELIVERED) {
      throw new BadRequestException('Cannot modify a delivered order');
    }

    if (order.status === ShopOrderStatus.CANCELLED) {
      throw new BadRequestException('Cannot modify a cancelled order');
    }

    if (dto.status === order.status) {
      throw new BadRequestException(`Order is already ${order.status}`);
    }

    const isCancelling = dto.status === ShopOrderStatus.CANCELLED;
    const refundAmount = Number(order.totalAmount);
    const orderItems = normalizeShopOrderItems(order.items);

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.shopOrder.update({
        where: { id },
        data: {
          status: dto.status,
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
        },
      });

      if (isCancelling) {
        for (const item of orderItems) {
          await tx.product.updateMany({
            where: { id: item.productId },
            data: {
              stock: { increment: item.quantity },
            },
          });
        }

        const wallet = await tx.wallet.findUnique({
          where: { userId: order.userId },
        });

        if (wallet) {
          await tx.wallet.update({
            where: { userId: order.userId },
            data: {
              balance: { increment: refundAmount },
            },
          });

          await tx.transaction.create({
            data: {
              walletId: wallet.id,
              amount: refundAmount,
              type: TransactionType.CREDIT,
              paymentMethod: 'WALLET',
              description: `Refund for cancelled shop order #${order.id.slice(0, 8)}`,
              reference: `REFUND-SHOP-${order.id}`,
              status: TransactionStatus.COMPLETED,
              metadata: {
                purpose: 'SHOP_REFUND',
                shopOrderId: order.id,
              },
            },
          });
        }
      }

      return updatedOrder;
    });

    if (isCancelling) {
      void this.redis.del(`wallet:balance:${order.userId}`);
    }

    return formatAdminShopOrderResponse(updated, updated.user);
  }
}