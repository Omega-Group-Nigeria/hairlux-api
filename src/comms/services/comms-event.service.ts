import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CommsEventRecordInput } from '../types/comms-admin.types';

@Injectable()
export class CommsEventService {
  constructor(private readonly prisma: PrismaService) {}

  async recordEvent(input: CommsEventRecordInput): Promise<boolean> {
    try {
      await this.prisma.bookingCommsEvent.create({
        data: {
          sessionId: input.sessionId,
          eventType: input.eventType,
          actorUserId: input.actorUserId ?? null,
          streamEventId: input.streamEventId,
          payload: (input.payload ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
      return true;
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        return false;
      }

      throw error;
    }
  }

  async updateSessionCallCid(
    sessionId: string,
    streamCallCid: string,
  ): Promise<void> {
    await this.prisma.bookingCommsSession.update({
      where: { id: sessionId },
      data: { streamCallCid },
    });
  }
}