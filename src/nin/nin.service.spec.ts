import { Test, TestingModule } from '@nestjs/testing';
import { NinService } from './nin.service';

describe('NinService', () => {
  let service: NinService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NinService],
    }).compile();

    service = module.get<NinService>(NinService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
