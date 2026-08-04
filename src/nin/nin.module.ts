import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NinController } from './nin.controller';
import { QoreidService } from './qoreid.service';

@Module({
  imports: [ConfigModule],
  controllers: [NinController],
  providers: [QoreidService],
  exports: [QoreidService],
})
export class NinModule { }