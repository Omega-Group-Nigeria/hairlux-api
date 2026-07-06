import { Injectable, Logger } from '@nestjs/common';
import {
  DispatchStatus,
  MatchingExhaustedReason,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { DispatchEventType } from '../constants/dispatch-event.constants';

export interface DispatchTransitionInput {
  from?: DispatchStatus | null;
  to: DispatchStatus;
  eventType: DispatchEventType | string;
  payload?: Prisma.InputJsonValue;
  idempotencyKey?: string;
  matchingStartedAt?: Date;
  matchingExhaustedAt?: Date | null;
  matchingExhaustedReason?: MatchingExhaustedReason | null;
  matchingAttempt?: number;
}

const ALLOWED_TRANSITIONS: Record<string, DispatchStatus[]> = {
  null: [
    DispatchStatus.PENDING_MATCH,
    DispatchStatus.OFFERING,
    DispatchStatus.ASSIGNED,
    DispatchStatus.CANCELLED,
  ],
  [DispatchStatus.PENDING_MATCH]: [
    DispatchStatus.OFFERING,
    DispatchStatus.MATCH_EXHAUSTED,
    DispatchStatus.ASSIGNED,
    DispatchStatus.CANCELLED,
  ],
  [DispatchStatus.OFFERING]: [
    DispatchStatus.PENDING_MATCH,
    DispatchStatus.MATCH_EXHAUSTED,
    DispatchStatus.ASSIGNED,
    DispatchStatus.CANCELLED,
  ],
  [DispatchStatus.MATCH_EXHAUSTED]: [
    DispatchStatus.PENDING_MATCH,
    DispatchStatus.ASSIGNED,
    DispatchStatus.CANCELLED,
  ],
  [DispatchStatus.ASSIGNED]: [DispatchStatus.CANCELLED],
  [DispatchStatus.CANCELLED]: [],
};

@Injectable()
export class DispatchStateService {
  private readonly logger = new Logger(DispatchStateService.name);

  constructor(private readonly prisma: PrismaService) {}

  async transition(
    bookingId: string,
    input: DispatchTransitionInput,
  ): Promise<{ applied: boolean; eventId?: string }> {
    if (input.idempotencyKey) {
      const existing = await this.prisma.dispatchEvent.findFirst({
        where: {
          bookingId,
          eventType: input.eventType,
          idempotencyKey: input.idempotencyKey,
        },
        select: { id: true },
      });

      if (existing) {
        return { applied: false, eventId: existing.id };
      }
    }

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { dispatchStatus: true },
    });

    if (!booking) {
      this.logger.warn(`Dispatch transition skipped — booking ${bookingId} not found`);
      return { applied: false };
    }

    const currentStatus = booking.dispatchStatus;
    const currentKey = currentStatus ?? 'null';

    if (input.from !== undefined && input.from !== currentStatus) {
      this.logger.warn(
        `Dispatch transition rejected for ${bookingId} — expected from ${input.from ?? 'null'}, got ${currentStatus ?? 'null'}`,
      );
      return { applied: false };
    }

    const allowedTargets = ALLOWED_TRANSITIONS[currentKey] ?? [];
    if (
      currentStatus !== input.to &&
      !allowedTargets.includes(input.to)
    ) {
      this.logger.warn(
        `Dispatch transition rejected for ${bookingId} — ${currentStatus ?? 'null'} → ${input.to} not allowed`,
      );
      return { applied: false };
    }

    const bookingUpdate: Prisma.BookingUpdateInput = {};

    if (currentStatus !== input.to) {
      bookingUpdate.dispatchStatus = input.to;
    }

    if (input.matchingStartedAt !== undefined) {
      bookingUpdate.matchingStartedAt = input.matchingStartedAt;
    }

    if (input.matchingExhaustedAt !== undefined) {
      bookingUpdate.matchingExhaustedAt = input.matchingExhaustedAt;
    }

    if (input.matchingExhaustedReason !== undefined) {
      bookingUpdate.matchingExhaustedReason = input.matchingExhaustedReason;
    }

    if (input.matchingAttempt !== undefined) {
      bookingUpdate.matchingAttempt = input.matchingAttempt;
    }

    try {
      const event = await this.prisma.$transaction(async (tx) => {
        const created = await tx.dispatchEvent.create({
          data: {
            bookingId,
            eventType: input.eventType,
            payload: input.payload ?? Prisma.JsonNull,
            idempotencyKey: input.idempotencyKey ?? null,
          },
        });

        if (Object.keys(bookingUpdate).length > 0) {
          await tx.booking.update({
            where: { id: bookingId },
            data: bookingUpdate,
          });
        }

        return created;
      });

      return { applied: true, eventId: event.id };
    } catch (error) {
      if (
        input.idempotencyKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.dispatchEvent.findFirst({
          where: {
            bookingId,
            eventType: input.eventType,
            idempotencyKey: input.idempotencyKey,
          },
          select: { id: true },
        });

        return { applied: false, eventId: existing?.id };
      }

      throw error;
    }
  }

  async recordEvent(
    bookingId: string,
    eventType: DispatchEventType | string,
    payload?: Prisma.InputJsonValue,
    idempotencyKey?: string,
  ): Promise<{ applied: boolean; eventId?: string }> {
    if (idempotencyKey) {
      const existing = await this.prisma.dispatchEvent.findFirst({
        where: { bookingId, eventType, idempotencyKey },
        select: { id: true },
      });

      if (existing) {
        return { applied: false, eventId: existing.id };
      }
    }

    try {
      const event = await this.prisma.dispatchEvent.create({
        data: {
          bookingId,
          eventType,
          payload: payload ?? Prisma.JsonNull,
          idempotencyKey: idempotencyKey ?? null,
        },
      });

      return { applied: true, eventId: event.id };
    } catch (error) {
      if (
        idempotencyKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.dispatchEvent.findFirst({
          where: { bookingId, eventType, idempotencyKey },
          select: { id: true },
        });

        return { applied: false, eventId: existing?.id };
      }

      throw error;
    }
  }
}