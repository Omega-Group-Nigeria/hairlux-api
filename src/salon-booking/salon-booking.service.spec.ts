import { Test, TestingModule } from '@nestjs/testing';
import { SalonBookingService } from './salon-booking.service';

describe('SalonBookingService', () => {
  let service: SalonBookingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SalonBookingService],
    }).compile();

    service = module.get<SalonBookingService>(SalonBookingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
