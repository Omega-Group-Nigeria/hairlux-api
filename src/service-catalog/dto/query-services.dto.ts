import { IsOptional, IsString, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { BookingType } from '@prisma/client';

export class QueryServicesDto {
  @ApiPropertyOptional({
    description: 'Filter by category ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Search by service name',
    example: 'Hair braiding',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: ['ACTIVE', 'INACTIVE'],
    example: 'ACTIVE',
  })
  @IsOptional()
  @IsEnum(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  @ApiPropertyOptional({
    description:
      'Resolve and filter services by booking type. Only services available for this type are returned.',
    enum: BookingType,
    example: BookingType.WALK_IN,
  })
  @IsOptional()
  @IsEnum(BookingType)
  bookingType?: BookingType;
}
