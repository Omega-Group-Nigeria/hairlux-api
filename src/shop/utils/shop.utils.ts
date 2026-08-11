import { Address, Prisma, ShopOrder } from '@prisma/client';
import { resolveAddressFields } from '../../common/utils/address.utils';
import {
  DeliveryAddressSnapshot,
  ShopOrderItem,
  ShopQuoteLineItem,
} from '../types/shop-order-item.interface';

export function resolveItemQuantity(quantity?: number): number {
  if (quantity === undefined || quantity === null) {
    return 1;
  }
  return quantity;
}

export function calculateLineTotal(
  item: Pick<ShopOrderItem, 'price' | 'quantity'>,
): number {
  return item.price * item.quantity;
}

export function calculateSubtotal(items: ShopOrderItem[]): number {
  return items.reduce((sum, item) => sum + calculateLineTotal(item), 0);
}

export function buildShopOrderItems(
  products: Array<{
    id: string;
    name: string;
    price: { toNumber: () => number } | number;
  }>,
  quantities: Map<string, number>,
): ShopOrderItem[] {
  return products.map((product) => {
    const quantity = quantities.get(product.id) ?? 1;
    const price =
      typeof product.price === 'number'
        ? product.price
        : product.price.toNumber();

    return {
      productId: product.id,
      name: product.name,
      price,
      quantity,
    };
  });
}

export function toQuoteLineItems(items: ShopOrderItem[]): ShopQuoteLineItem[] {
  return items.map((item) => ({
    ...item,
    lineTotal: calculateLineTotal(item),
  }));
}

export function normalizeShopOrderItems(json: unknown): ShopOrderItem[] {
  if (!Array.isArray(json)) {
    return [];
  }

  return json.map((entry) => {
    const raw = entry as Record<string, unknown>;
    return {
      productId: String(raw.productId ?? ''),
      name: String(raw.name ?? ''),
      price: Number(raw.price ?? 0),
      quantity: resolveItemQuantity(
        typeof raw.quantity === 'number' ? raw.quantity : undefined,
      ),
    };
  });
}

export function buildDeliveryAddressSnapshot(
  address: Address,
): DeliveryAddressSnapshot {
  const resolved = resolveAddressFields(address);

  return {
    fullAddress: resolved.fullAddress,
    streetAddress: resolved.streetAddress,
    city: resolved.city,
    state: resolved.state,
    country: resolved.country,
    label: address.label,
  };
}

export function buildTemporaryDeliverySnapshot(input: {
  tempFullAddress?: string;
  tempState?: string;
}): DeliveryAddressSnapshot {
  return {
    fullAddress: String(input.tempFullAddress ?? '').trim(),
    streetAddress: null,
    city: null,
    state: input.tempState?.trim() || null,
    country: 'Nigeria',
    label: null,
  };
}

export function normalizeDeliveryAddressSnapshot(
  json: unknown,
): DeliveryAddressSnapshot | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return null;
  }

  const raw = json as Record<string, unknown>;
  return {
    fullAddress: String(raw.fullAddress ?? ''),
    streetAddress:
      raw.streetAddress === null || raw.streetAddress === undefined
        ? null
        : String(raw.streetAddress),
    city:
      raw.city === null || raw.city === undefined ? null : String(raw.city),
    state:
      raw.state === null || raw.state === undefined ? null : String(raw.state),
    country: String(raw.country ?? 'Nigeria'),
    label:
      raw.label === null || raw.label === undefined ? null : String(raw.label),
  };
}

export function toShopOrderItemsJson(
  items: ShopOrderItem[],
): Prisma.InputJsonValue {
  return items as unknown as Prisma.InputJsonValue;
}

export function toDeliveryAddressSnapshotJson(
  snapshot: DeliveryAddressSnapshot,
): Prisma.InputJsonValue {
  return snapshot as unknown as Prisma.InputJsonValue;
}

export function formatShopOrderResponse(order: ShopOrder) {
  return {
    id: order.id,
    orderCode: order.orderCode,
    userId: order.userId,
    addressId: order.addressId,
    items: normalizeShopOrderItems(order.items),
    subtotal: Number(order.subtotal),
    deliveryFee: Number(order.deliveryFee),
    totalAmount: Number(order.totalAmount),
    status: order.status,
    notes: order.notes,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    deliveryAddress: normalizeDeliveryAddressSnapshot(
      order.deliveryAddressSnapshot,
    ),
    temporaryLocation:
      order.tempLatitude !== null &&
      order.tempLatitude !== undefined &&
      order.tempLongitude !== null &&
      order.tempLongitude !== undefined
        ? {
            latitude: Number(order.tempLatitude),
            longitude: Number(order.tempLongitude),
            fullAddress: order.tempFullAddress,
            state: order.tempState,
          }
        : null,
  };
}

export function formatAdminShopOrderResponse(
  order: ShopOrder,
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
  } | null,
) {
  return {
    ...formatShopOrderResponse(order),
    ...(user
      ? {
          user: {
            id: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phone: user.phone,
          },
        }
      : {}),
  };
}