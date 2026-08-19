import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Permission } from '../auth/decorators/permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { MAX_ADVERT_BANNER_IMAGE_BYTES } from './advert-banners.constants';
import { AdvertBannersService } from './advert-banners.service';
import { CreateAdvertBannerDto } from './dto/create-advert-banner.dto';
import { ReorderAdvertBannersDto } from './dto/reorder-advert-banners.dto';
import { UpdateAdvertBannerDto } from './dto/update-advert-banner.dto';

const bannerImageInterceptor = FileInterceptor('image', {
  storage: memoryStorage(),
  limits: { fileSize: MAX_ADVERT_BANNER_IMAGE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(
        new BadRequestException('Only image files are allowed.'),
        false,
      );
    }
    cb(null, true);
  },
});

@ApiTags('Admin - Advert Banners')
@ApiBearerAuth('JWT-auth')
@Controller('admin/advert-banners')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminAdvertBannersController {
  constructor(private readonly advertBannersService: AdvertBannersService) {}

  @Get()
  @Permission(PERMISSIONS.ADVERTS_READ)
  @ApiOperation({
    summary: 'List all advert banners (admin)',
    description:
      'Returns every banner including inactive ones, in carousel order.',
  })
  @ApiResponse({
    status: 200,
    description: 'Advert banners retrieved successfully',
  })
  async findAll() {
    const data = await this.advertBannersService.findAll();
    return {
      success: true,
      message: 'Advert banners retrieved successfully',
      data,
    };
  }

  @Post()
  @Permission(PERMISSIONS.ADVERTS_MANAGE)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Create an advert banner',
    description:
      'Creates a banner with a required image. Image is stored as WebP on Cloudinary under the advert-banners folder.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['image', 'title'],
      properties: {
        image: {
          type: 'string',
          format: 'binary',
          description: 'Banner image (jpg/png/webp etc.)',
        },
        title: { type: 'string', example: 'Back to School 20% Off' },
        linkUrl: {
          type: 'string',
          example: 'https://hairlux.com.ng/promo/bts',
        },
        isActive: { type: 'boolean', example: true, default: false },
        sortOrder: { type: 'integer', example: 1, minimum: 0 },
      },
    },
  })
  @UseInterceptors(bannerImageInterceptor)
  async create(
    @Body() dto: CreateAdvertBannerDto,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    const data = await this.advertBannersService.create(dto, image);
    return {
      success: true,
      message: 'Advert banner created successfully',
      data,
    };
  }

  @Patch(':id')
  @Permission(PERMISSIONS.ADVERTS_MANAGE)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Update an advert banner',
    description:
      'Partially update a banner. A new image is optional — if provided it overwrites the existing Cloudinary asset in place.',
  })
  @ApiParam({ name: 'id', description: 'Banner ID', example: 'banner-uuid' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          format: 'binary',
          description: 'Optional banner image to replace the current one',
        },
        title: { type: 'string', example: 'Back to School 25% Off' },
        linkUrl: { type: 'string', nullable: true },
        isActive: { type: 'boolean', example: true },
        sortOrder: { type: 'integer', example: 0, minimum: 0 },
      },
    },
  })
  @UseInterceptors(bannerImageInterceptor)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdvertBannerDto,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    const data = await this.advertBannersService.update(id, dto, image);
    return {
      success: true,
      message: 'Advert banner updated successfully',
      data,
    };
  }

  @Delete(':id')
  @Permission(PERMISSIONS.ADVERTS_MANAGE)
  @ApiOperation({ summary: 'Delete an advert banner' })
  @ApiParam({ name: 'id', description: 'Banner ID', example: 'banner-uuid' })
  @ApiResponse({
    status: 200,
    description: 'Advert banner deleted successfully',
  })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.advertBannersService.remove(id);
    return { success: true, message: 'Advert banner deleted successfully' };
  }

  @Put('reorder')
  @Permission(PERMISSIONS.ADVERTS_MANAGE)
  @ApiOperation({
    summary: 'Reorder advert banners',
    description:
      'Sets the sortOrder of the listed banners to the requested values. Unknown IDs are rejected.',
  })
  @ApiResponse({
    status: 200,
    description: 'Advert banners reordered successfully',
  })
  async reorder(@Body() dto: ReorderAdvertBannersDto) {
    await this.advertBannersService.reorder(dto);
    return { success: true, message: 'Advert banners reordered successfully' };
  }
}
