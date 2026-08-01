import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BookingType } from '@prisma/client';
import { BranchCatalogService } from '../../branch/services/branch-catalog.service';
import {
  bookingIncludesWalkIn,
  resolveBookingLineUnitPrice,
} from '../../branch/utils/branch-booking.utils';
import { PrismaService } from '../../prisma/prisma.service';
import { ServiceBookingItemDto } from '../dto/create-booking.dto';
import {
  BookingServiceRecord,
  buildBookingServiceRecord,
} from '../utils/booking.utils';

@Injectable()
export class BookingLinePricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchCatalogService: BranchCatalogService,
    private readonly configService: ConfigService,
  ) {}

  async validateBranchContext(params: {
    branchId?: string;
    services: ServiceBookingItemDto[];
    bookingType?: BookingType;
  }) {
    const includesWalkIn = bookingIncludesWalkIn(
      params.services,
      params.bookingType,
    );
    const enforcementEnabled =
      this.configService.get<string>('BRANCH_WALK_IN_REQUIRED') === 'true';

    if (enforcementEnabled && includesWalkIn && !params.branchId) {
      throw new BadRequestException(
        'branchId is required for walk-in bookings',
      );
    }

    if (params.branchId) {
      await this.branchCatalogService.assertOpenBranch(params.branchId);
    }
  }

  async buildServiceRecords(params: {
    services: ServiceBookingItemDto[];
    bookingType?: BookingType;
    branchId?: string;
    resolveServiceMode: (
      item: ServiceBookingItemDto,
      fallback?: BookingType,
    ) => BookingType;
  }): Promise<BookingServiceRecord[]> {
    const { services, bookingType, branchId, resolveServiceMode } = params;

    await this.validateBranchContext({ branchId, services, bookingType });

    const assignmentMap = branchId
      ? await this.branchCatalogService.getAvailableAssignmentsMap(branchId)
      : null;

    const serviceRecords: BookingServiceRecord[] = [];

    for (const item of services) {
      const service = await this.prisma.service.findUnique({
        where: { id: item.serviceId },
      });

      if (!service) {
        throw new NotFoundException(`Service ${item.serviceId} not found`);
      }

      if (service.status !== 'ACTIVE') {
        throw new BadRequestException(
          `Service "${service.name}" is not available`,
        );
      }

      const serviceMode = resolveServiceMode(item, bookingType);
      const branchAssignment = branchId
        ? (assignmentMap?.get(service.id) ?? null)
        : null;

      serviceRecords.push(
        buildBookingServiceRecord({
          service,
          unitPrice: resolveBookingLineUnitPrice({
            service,
            serviceMode,
            branchId,
            branchAssignment,
          }),
          item,
          serviceMode,
        }),
      );
    }

    return serviceRecords;
  }
}