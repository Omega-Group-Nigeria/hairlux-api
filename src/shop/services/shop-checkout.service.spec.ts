import { Test, TestingModule } from '@nestjs/testing';
import { Address, Product, ShopOrderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { MailService } from '../../mail/mail.service';
import { WalletDebitService } from '../../wallet/wallet-debit.service';
import { ShopCheckoutService } from './shop-checkout.service';
import { ProductCatalogService } from './product-catalog.service';
import { DeliveryPricingService } from './delivery-pricing.service';
import { ShopOrderCodeService } from './shop-order-code.service';
import { ShopPushNotifier } from '../../notifications/shop/shop-push.notifier';

describe('ShopCheckoutService', () => {
  let service: ShopCheckoutService;

  const savedAddress = {
    id: 'addr-1',
    userId: 'user-1',
    label: 'Home',
    fullAddress: '12 Admiralty Way, Lagos',
    streetAddress: '12 Admiralty Way',
    city: 'Lekki',
    state: 'Lagos',
    country: 'Nigeria',
    placeId: null,
    addressComponents: null,
    latitude: 6.4474,
    longitude: 3.47,
    isDefault: true,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Address;

  const product = {
    id: 'product-1',
    name: 'Shampoo',
    price: 1000,
    stock: 10,
    status: 'ACTIVE',
  } as unknown as Product;

  const baseItem = { productId: 'product-1', quantity: 2 };

  const mockPrisma = {
    shopOrder: {
      findFirst: jest.fn(async () => null),
      findUnique: jest.fn(async () => null),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...data,
        status: ShopOrderStatus.CONFIRMED,
        items: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    },
    product: {
      findMany: jest.fn(async () => [product]),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    address: {
      findFirst: jest.fn(async () => savedAddress),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockPrisma)),
    wallet: { findUnique: jest.fn(async () => ({ id: 'wallet-1' })) },
    transaction: { create: jest.fn() },
    user: {
      findUnique: jest.fn(async () => ({
        email: 'customer@example.com',
        firstName: 'Jane',
      })),
    },
  };

  const mockProductCatalog = {
    loadActiveProductsForCheckout: jest.fn(async () => [product]),
  };

  const mockDeliveryPricing = {
    resolveDeliveryFeeForAddress: jest.fn(async () => ({
      deliveryFee: 1500,
      deliveryRegion: { name: 'Lagos', state: 'Lagos' },
    })),
    resolveDeliveryFeeForState: jest.fn(async () => ({
      deliveryFee: 1500,
      deliveryRegion: { name: 'Lagos', state: 'Lagos' },
    })),
  };

  const mockWalletDebit = {
    debitWalletAndRecordTx: jest.fn(async () => undefined),
  };

  const mockMail = {
    sendShopOrderConfirmationEmail: jest.fn(),
  };

  const mockRedis = {
    del: jest.fn(),
    delByPattern: jest.fn(),
  };

  const mockOrderCode = {
    generateOrderCode: jest.fn(async () => 'HLORDER-ABC12'),
  };

  const mockShopPush = {
    notifyPlaced: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.shopOrder.findFirst.mockResolvedValue(null);
    mockPrisma.shopOrder.findUnique.mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(mockPrisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShopCheckoutService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ProductCatalogService, useValue: mockProductCatalog },
        { provide: DeliveryPricingService, useValue: mockDeliveryPricing },
        { provide: WalletDebitService, useValue: mockWalletDebit },
        { provide: MailService, useValue: mockMail },
        { provide: RedisService, useValue: mockRedis },
        { provide: ShopOrderCodeService, useValue: mockOrderCode },
        { provide: ShopPushNotifier, useValue: mockShopPush },
      ],
    }).compile();

    service = module.get<ShopCheckoutService>(ShopCheckoutService);
  });

  it('quotes a temp/current-location delivery using tempState for pricing', async () => {
    const result = await service.quote('user-1', {
      items: [baseItem],
      tempLatitude: 6.524379,
      tempLongitude: 3.379206,
      tempFullAddress: '14 Admiralty Way, Lagos',
      tempState: 'Lagos',
    });

    expect(mockDeliveryPricing.resolveDeliveryFeeForState).toHaveBeenCalledWith(
      'Lagos',
    );
    expect(mockPrisma.address.findFirst).not.toHaveBeenCalled();
    expect(result.deliveryFee).toBe(1500);
    expect(result.address).toBeNull();
  });

  it('quotes a saved-address delivery through the existing path', async () => {
    const result = await service.quote('user-1', {
      addressId: 'addr-1',
      items: [baseItem],
    });

    expect(mockDeliveryPricing.resolveDeliveryFeeForAddress).toHaveBeenCalledWith(
      savedAddress,
    );
    expect(result.address).not.toBeNull();
  });

  it('creates a temp-location order with addressId null and temp fields persisted', async () => {
    const result = await service.purchase('user-1', {
      idempotencyKey: 'shop-idem-1',
      items: [baseItem],
      tempLatitude: 6.524379,
      tempLongitude: 3.379206,
      tempFullAddress: ' 14 Admiralty Way, Lagos ',
      tempState: ' Lagos ',
    });

    expect(mockPrisma.$transaction).toHaveBeenCalled();
    const createCall = mockPrisma.shopOrder.create.mock.calls[0][0].data;
    expect(createCall.addressId).toBeNull();
    expect(createCall.tempLatitude).toBe(6.524379);
    expect(createCall.tempLongitude).toBe(3.379206);
    expect(createCall.tempFullAddress).toBe('14 Admiralty Way, Lagos');
    expect(createCall.tempState).toBe('Lagos');
    expect(createCall.deliveryAddressSnapshot).toMatchObject({
      fullAddress: '14 Admiralty Way, Lagos',
      state: 'Lagos',
    });
    expect(result.message).toBe('Shop order placed successfully');
  });

  it('persists a saved addressId for saved-address orders', async () => {
    const result = await service.purchase('user-1', {
      idempotencyKey: 'shop-idem-2',
      addressId: 'addr-1',
      items: [baseItem],
    });

    const createCall = mockPrisma.shopOrder.create.mock.calls[0][0].data;
    expect(createCall.addressId).toBe('addr-1');
    expect(createCall.tempState).toBeUndefined();
    expect(result.message).toBe('Shop order placed successfully');
  });
});
