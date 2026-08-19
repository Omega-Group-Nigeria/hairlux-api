import { Module } from '@nestjs/common';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { AdvertBannersService } from './advert-banners.service';
import { AdvertBannersController } from './advert-banners.controller';
import { AdminAdvertBannersController } from './admin-advert-banners.controller';

@Module({
  imports: [CloudinaryModule],
  controllers: [AdvertBannersController, AdminAdvertBannersController],
  providers: [AdvertBannersService],
  exports: [AdvertBannersService],
})
export class AdvertBannersModule {}
