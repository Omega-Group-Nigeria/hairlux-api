import { NotFoundException } from '@nestjs/common';
import { Address, Prisma } from '@prisma/client';

export interface AddressComponents {
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  country: string;
}

export interface NormalizedAddressFields {
  fullAddress: string;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  country: string;
  addressComponents: AddressComponents;
}

type AddressLike = Pick<
  Address,
  'fullAddress' | 'streetAddress' | 'city' | 'state' | 'country' | 'addressComponents'
>;

function extractAddressComponents(value: unknown): Partial<AddressComponents> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const components: Partial<AddressComponents> = {};

  if (typeof raw.streetAddress === 'string') {
    components.streetAddress = raw.streetAddress;
  }
  if (typeof raw.city === 'string') {
    components.city = raw.city;
  }
  if (typeof raw.state === 'string') {
    components.state = raw.state;
  }
  if (typeof raw.country === 'string') {
    components.country = raw.country;
  }

  return Object.keys(components).length > 0 ? components : null;
}

function joinAddressParts(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => (typeof part === 'string' ? part.trim() : part))
    .filter((part): part is string => Boolean(part))
    .join(', ');
}

export function resolveAddressFields(address: AddressLike): NormalizedAddressFields {
  const components = extractAddressComponents(address.addressComponents);

  const streetAddress =
    address.streetAddress ?? components?.streetAddress ?? null;
  const city = address.city ?? components?.city ?? null;
  const state = address.state ?? components?.state ?? null;
  const country = address.country ?? components?.country ?? 'Nigeria';
  const fullAddress =
    address.fullAddress ||
    joinAddressParts([streetAddress, city, state, country]);

  return {
    fullAddress,
    streetAddress,
    city,
    state,
    country,
    addressComponents: {
      streetAddress,
      city,
      state,
      country,
    },
  };
}

export function formatAddress(address: unknown) {
  if (!address || typeof address !== 'object' || Array.isArray(address)) {
    return null;
  }

  const raw = address as Record<string, unknown>;
  const resolved = resolveAddressFields({
    fullAddress: String(raw.fullAddress ?? ''),
    streetAddress:
      raw.streetAddress === null || raw.streetAddress === undefined
        ? null
        : String(raw.streetAddress),
    city:
      raw.city === null || raw.city === undefined ? null : String(raw.city),
    state:
      raw.state === null || raw.state === undefined ? null : String(raw.state),
    country:
      raw.country === null || raw.country === undefined
        ? 'Nigeria'
        : String(raw.country),
    addressComponents: raw.addressComponents as Address['addressComponents'],
  });

  return {
    id: raw.id,
    fullAddress: resolved.fullAddress,
    streetAddress: resolved.streetAddress,
    city: resolved.city,
    state: resolved.state,
    country: resolved.country,
    placeId: raw.placeId ?? null,
    addressComponents: resolved.addressComponents,
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