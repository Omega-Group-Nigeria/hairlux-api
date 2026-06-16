import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export function formatAddress(address: unknown) {
  if (!address || typeof address !== 'object' || Array.isArray(address)) {
    return null;
  }

  const raw = address as Record<string, unknown>;
  return {
    id: raw.id,
    fullAddress: raw.fullAddress ?? null,
    streetAddress: raw.streetAddress ?? null,
    city: raw.city ?? null,
    state: raw.state ?? null,
    country: raw.country ?? null,
    placeId: raw.placeId ?? null,
    addressComponents: raw.addressComponents ?? null,
    isDefault: raw.isDefault ?? false,
  };
}

export async function assertUserOwnsAddress(
  prisma: Prisma.TransactionClient | { address: { findFirst: Function } },
  userId: string,
  addressId: string,
) {
  const address = await prisma.address.findFirst({
    where: { id: addressId, userId },
  });

  if (!address) {
    throw new NotFoundException('Address not found');
  }

  return address;
}