import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdvertBannersService } from './advert-banners.service';

@ApiTags('Advert Banners')
@Controller('advert-banners')
export class AdvertBannersController {
  constructor(private readonly advertBannersService: AdvertBannersService) {}

  @Get()
  @ApiOperation({
    summary: 'Get active home-screen advert banners',
    description:
      'Public. Returns only banners currently active, sorted by carousel order (sortOrder ascending).',
  })
  @ApiResponse({
    status: 200,
    description: 'Active advert banners retrieved successfully',
    schema: {
      example: {
        success: true,
        message: 'Advert banners retrieved successfully',
        data: [
          {
            id: 'banner-uuid',
            title: 'Back to School 20% Off',
            imageUrl:
              'https://res.cloudinary.com/demo/hairlux/advert-banners/banner-uuid.webp',
            linkUrl: 'https://hairlux.com.ng/promo/bts',
          },
        ],
      },
    },
  })
  async findPublic() {
    const data = await this.advertBannersService.findPublicBanners();
    return {
      success: true,
      message: 'Advert banners retrieved successfully',
      data,
    };
  }
}
