import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class ReorderAdvertBannerItemDto {
  @ApiProperty({ description: 'Banner ID', example: 'banner-uuid' })
  @IsUUID()
  id: string;

  @ApiProperty({ description: 'New carousel order', example: 0, minimum: 0 })
  @IsInt()
  @Min(0)
  sortOrder: number;
}

export class ReorderAdvertBannersDto {
  @ApiProperty({
    description:
      'Full desired ordering. Every relevant banner must be listed (or a subset you wish to reorder).',
    type: [ReorderAdvertBannerItemDto],
    example: [
      { id: 'banner-uuid-1', sortOrder: 0 },
      { id: 'banner-uuid-2', sortOrder: 1 },
    ],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ReorderAdvertBannerItemDto)
  order: ReorderAdvertBannerItemDto[];
}
