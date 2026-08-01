import { ForbiddenException } from '@nestjs/common';
import { BookingCommsSessionStatus, BookingStatus } from '@prisma/client';
import { CommsAccessService } from './comms-access.service';

describe('CommsAccessService', () => {
  let service: CommsAccessService;

  beforeEach(() => {
    service = new CommsAccessService({} as never);
  });

  it('allows comms only for active sessions in active booking statuses', () => {
    expect(
      service.canUseComms(
        BookingStatus.AWAITING_CUSTOMER_CONFIRM,
        BookingCommsSessionStatus.ACTIVE,
      ),
    ).toBe(true);

    expect(
      service.canUseComms(
        BookingStatus.COMPLETED,
        BookingCommsSessionStatus.ACTIVE,
      ),
    ).toBe(false);
  });

  it('rejects non-participants', () => {
    expect(() =>
      service.assertParticipant(
        {
          userId: 'customer-1',
          assignedBeauticianUserId: 'beautician-1',
        },
        'other-user',
      ),
    ).toThrow(ForbiddenException);
  });
});