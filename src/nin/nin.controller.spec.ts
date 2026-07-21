import { Test, TestingModule } from '@nestjs/testing';
import { NinController } from './nin.controller';
import { NinService } from './nin.service';

describe('NinController', () => {
  let controller: NinController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NinController],
      providers: [NinService],
    }).compile();

    controller = module.get<NinController>(NinController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
