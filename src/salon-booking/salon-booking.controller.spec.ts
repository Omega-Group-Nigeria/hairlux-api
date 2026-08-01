import { Test, TestingModule } from '@nestjs/testing';
import { SalonBookingController } from './salon-booking.controller';

describe('SalonBookingController', () => {
  let controller: SalonBookingController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SalonBookingController],
    }).compile();

    controller = module.get<SalonBookingController>(SalonBookingController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
