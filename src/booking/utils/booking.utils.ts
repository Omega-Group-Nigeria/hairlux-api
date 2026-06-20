import { BadRequestException } from '@nestjs/common';
import { BookingType, Prisma } from '@prisma/client';
import { ServiceBookingItemDto } from '../dto/create-booking.dto';

export interface BookingServiceRecord {
  serviceId: string;
  name: string;
  price: number;
  quantity: number;
  duration: number;
  notes?: string;
  serviceMode?: BookingType;
}

export interface BookingPricedService {
  name: string;
  walkInPrice: { toNumber: () => number } | number;
  homeServicePrice: { toNumber: () => number } | number;
  isWalkInAvailable: boolean;
  isHomeServiceAvailable: boolean;
}

export function resolvePriceForBookingType(
  service: BookingPricedService,
  bookingType: BookingType,
): number {
  if (bookingType === BookingType.WALK_IN) {
    if (!service.isWalkInAvailable) {
      throw new BadRequestException(
        `Service "${service.name}" is not available for WALK_IN bookings`,
      );
    }

    return typeof service.walkInPrice === 'number'
      ? service.walkInPrice
      : service.walkInPrice.toNumber();
  }

  if (!service.isHomeServiceAvailable) {
    throw new BadRequestException(
      `Service "${service.name}" is not available for HOME_SERVICE bookings`,
    );
  }

  return typeof service.homeServicePrice === 'number'
    ? service.homeServicePrice
    : service.homeServicePrice.toNumber();
}

export function resolveServiceQuantity(quantity?: number): number {
  if (quantity === undefined || quantity === null) {
    return 1;
  }
  return quantity;
}

export function calculateServiceLineTotal(
  record: Pick<BookingServiceRecord, 'price' | 'quantity'>,
): number {
  return record.price * record.quantity;
}

export function calculateBookingServicesTotal(
  records: Pick<BookingServiceRecord, 'price' | 'quantity'>[],
): number {
  return records.reduce((sum, record) => sum + calculateServiceLineTotal(record), 0);
}

export function buildBookingServiceRecord(params: {
  service: { id: string; name: string; duration: number | null };
  unitPrice: number;
  item: Pick<ServiceBookingItemDto, 'notes' | 'quantity'>;
  serviceMode?: BookingType;
}): BookingServiceRecord {
  const quantity = resolveServiceQuantity(params.item.quantity);

  return {
    serviceId: params.service.id,
    name: params.service.name,
    price: params.unitPrice,
    quantity,
    duration: params.service.duration ?? 0,
    ...(params.item.notes ? { notes: params.item.notes } : {}),
    ...(params.serviceMode ? { serviceMode: params.serviceMode } : {}),
  };
}

export function normalizeBookingServices(services: unknown): BookingServiceRecord[] {
  if (!Array.isArray(services)) {
    return [];
  }

  return services.map((svc) => {
    const raw = svc as Record<string, unknown>;
    const quantity = resolveServiceQuantity(
      typeof raw.quantity === 'number' ? raw.quantity : undefined,
    );

    return {
      serviceId: String(raw.serviceId ?? ''),
      name: String(raw.name ?? ''),
      price: Number(raw.price ?? 0),
      quantity,
      duration: Number(raw.duration ?? 0),
      ...(raw.notes ? { notes: String(raw.notes) } : {}),
      ...(raw.serviceMode ? { serviceMode: raw.serviceMode as BookingType } : {}),
    };
  });
}

export const bookingBranchSelect = {
  id: true,
  name: true,
  address: true,
} as const;

export const bookingUserReadInclude = {
  address: true,
  branch: { select: bookingBranchSelect },
} as const;

export const bookingAdminUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
} as const;

export const bookingAdminReadInclude = {
  ...bookingUserReadInclude,
  user: { select: bookingAdminUserSelect },
} as const;

export type BookingBranchSummary = {
  id: string;
  name: string;
  address: string;
};

type BookingBranchLike = BookingBranchSummary | null | undefined;

export function formatBookingBranch(
  branch: BookingBranchLike,
): BookingBranchSummary | null {
  if (!branch) {
    return null;
  }

  return {
    id: branch.id,
    name: branch.name,
    address: branch.address,
  };
}

export function formatBookingResponse(
  booking: {
    services: unknown;
    totalAmount?: unknown;
    branch?: BookingBranchLike;
    [key: string]: unknown;
  },
) {
  const hasBranchRelation = 'branch' in booking;
  const { branch, services, totalAmount, ...rest } = booking;

  const formatted = {
    ...rest,
    services: normalizeBookingServices(services),
    totalAmount: Number(totalAmount ?? 0),
  };

  if (!hasBranchRelation) {
    return formatted;
  }

  return {
    ...formatted,
    branch: formatBookingBranch(branch),
  };
}

export function toBookingServicesJson(
  records: BookingServiceRecord[],
): Prisma.InputJsonValue {
  return records as unknown as Prisma.InputJsonValue;
}

export function toEmailServiceLines(
  records: BookingServiceRecord[],
): { name: string; price: number; duration: number }[] {
  return records.map((record) => ({
    name: record.quantity > 1 ? `${record.name} (x${record.quantity})` : record.name,
    price: calculateServiceLineTotal(record),
    duration: record.duration * record.quantity,
  }));
}

export { formatAddress as formatBookingAddress } from '../../common/utils/address.utils';
