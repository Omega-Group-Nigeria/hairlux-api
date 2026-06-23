import { BookingType } from '@prisma/client';
import { BookingServiceRecord } from '../../../booking/utils/booking.utils';

export function bookingNeedsBeauticianAssignment(
  bookingType: BookingType,
  services: BookingServiceRecord[],
): boolean {
  if (bookingType === BookingType.HOME_SERVICE) {
    return true;
  }

  return services.some(
    (service) => service.serviceMode === BookingType.HOME_SERVICE,
  );
}

export function extractHomeServiceIds(services: BookingServiceRecord[]): string[] {
  return [
    ...new Set(
      services
        .filter(
          (service) =>
            !service.serviceMode ||
            service.serviceMode === BookingType.HOME_SERVICE,
        )
        .map((service) => service.serviceId)
        .filter(Boolean),
    ),
  ];
}

export function sumHomeServiceAmount(services: BookingServiceRecord[]): number {
  return services
    .filter(
      (service) =>
        !service.serviceMode ||
        service.serviceMode === BookingType.HOME_SERVICE,
    )
    .reduce((sum, service) => sum + service.price * service.quantity, 0);
}

export function maskAddress(fullAddress: string): string {
  const parts = fullAddress.split(',').map((part) => part.trim());
  if (parts.length <= 2) {
    return parts[parts.length - 1] ?? 'Nearby area';
  }
  return `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`;
}