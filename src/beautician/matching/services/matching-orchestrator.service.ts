import { Injectable, Logger } from '@nestjs/common';
import { BookingStatus, JobOfferStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { GeocodingService } from '../../../common/services/geocoding.service';
import { normalizeBookingServices } from '../../../booking/utils/booking.utils';
import { HomeServiceSettingsService } from '../../services/home-service-settings.service';
import {
  extractHomeServiceIds,
  sumHomeServiceAmount,
} from '../utils/booking-assignment.utils';
import { CandidateFinderService } from './candidate-finder.service';
import { OfferFactoryService } from './offer-factory.service';
import { RealtimePublisherService } from '../../realtime/realtime-publisher.service';

@Injectable()
export class MatchingOrchestratorService {
  private readonly logger = new Logger(MatchingOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geocodingService: GeocodingService,
    private readonly settingsService: HomeServiceSettingsService,
    private readonly candidateFinder: CandidateFinderService,
    private readonly offerFactory: OfferFactoryService,
    private readonly realtimePublisher: RealtimePublisherService,
  ) {}

  async createOffersForBooking(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { address: true },
    });

    if (!booking) {
      this.logger.warn(`Booking ${bookingId} not found for matching`);
      return;
    }

    if (booking.status !== BookingStatus.PENDING_ASSIGNMENT) {
      this.logger.log(
        `Skipping matching for booking ${bookingId} — status ${booking.status}`,
      );
      return;
    }

    const services = normalizeBookingServices(booking.services);
    const requiredServiceIds = extractHomeServiceIds(services);

    if (!requiredServiceIds.length) {
      this.logger.warn(`Booking ${bookingId} has no home service items`);
      return;
    }

    const coordinates = await this.resolveCoordinates(booking.address);
    if (!coordinates) {
      this.logger.error(
        `Booking ${bookingId} has no geocoded address — cannot match beauticians`,
      );
      return;
    }

    const settings = await this.settingsService.getSettings();
    const excludeIds = await this.getExcludedBeauticianIds(bookingId);

    const candidates = await this.candidateFinder.findCandidates({
      bookingId,
      customerLat: coordinates.lat,
      customerLng: coordinates.lng,
      radiusKm: Number(settings.defaultMatchingRadiusKm),
      requiredServiceIds,
      excludeBeauticianUserIds: excludeIds,
    });

    const homeServiceAmount = sumHomeServiceAmount(services);

    await this.offerFactory.createOffers({
      bookingId,
      candidates,
      homeServiceAmount,
      globalCommissionRate: Number(settings.commissionRate),
      timeoutMinutes: settings.jobOfferTimeoutMinutes,
    });
  }

  async expireOffersForBooking(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { status: true },
    });

    if (!booking || booking.status !== BookingStatus.PENDING_ASSIGNMENT) {
      return;
    }

    const now = new Date();

    const expiringOffers = await this.prisma.jobOffer.findMany({
      where: {
        bookingId,
        status: JobOfferStatus.OFFERED,
        expiresAt: { lte: now },
      },
      select: { beauticianUserId: true },
    });

    await this.prisma.jobOffer.updateMany({
      where: {
        bookingId,
        status: JobOfferStatus.OFFERED,
        expiresAt: { lte: now },
      },
      data: {
        status: JobOfferStatus.EXPIRED,
        respondedAt: now,
      },
    });

    for (const offer of expiringOffers) {
      this.realtimePublisher.emitOfferExpired(offer.beauticianUserId, bookingId);
    }

    const activeOffers = await this.prisma.jobOffer.count({
      where: {
        bookingId,
        status: JobOfferStatus.OFFERED,
        expiresAt: { gt: now },
      },
    });

    if (activeOffers === 0) {
      await this.createOffersForBooking(bookingId);
    }
  }

  private async getExcludedBeauticianIds(bookingId: string): Promise<string[]> {
    const offers = await this.prisma.jobOffer.findMany({
      where: {
        bookingId,
        status: {
          in: [JobOfferStatus.DECLINED, JobOfferStatus.OFFERED, JobOfferStatus.ACCEPTED],
        },
      },
      select: { beauticianUserId: true, status: true, expiresAt: true },
    });

    const now = new Date();
    const excluded = new Set<string>();

    for (const offer of offers) {
      if (offer.status === JobOfferStatus.DECLINED) {
        excluded.add(offer.beauticianUserId);
      }
      if (
        offer.status === JobOfferStatus.OFFERED &&
        offer.expiresAt > now
      ) {
        excluded.add(offer.beauticianUserId);
      }
      if (offer.status === JobOfferStatus.ACCEPTED) {
        excluded.add(offer.beauticianUserId);
      }
    }

    return [...excluded];
  }

  private async resolveCoordinates(
    address: {
      latitude: unknown;
      longitude: unknown;
      fullAddress: string;
      placeId: string | null;
    } | null,
  ): Promise<{ lat: number; lng: number } | null> {
    if (!address) return null;

    if (address.latitude != null && address.longitude != null) {
      return {
        lat: Number(address.latitude),
        lng: Number(address.longitude),
      };
    }

    if (address.placeId) {
      const geo = await this.geocodingService.geocodeByPlaceId(address.placeId);
      if (geo) return { lat: geo.latitude, lng: geo.longitude };
    }

    const geo = await this.geocodingService.geocodeAddress(address.fullAddress);
    return geo ? { lat: geo.latitude, lng: geo.longitude } : null;
  }
}