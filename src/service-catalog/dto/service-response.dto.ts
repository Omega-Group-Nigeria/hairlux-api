import { ApiProperty } from '@nestjs/swagger';

export class CategoryResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ example: 'Hair Services' })
  name: string;

  @ApiProperty({ example: 'Professional hair styling and treatments' })
  description: string;

  @ApiProperty({ example: '2024-01-15T10:30:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-15T10:30:00.000Z' })
  updatedAt: Date;
}

export class ServiceResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174001' })
  id: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  categoryId: string;

  @ApiProperty({ example: 'Box Braids' })
  name: string;

  @ApiProperty({
    example: 'Beautiful long-lasting box braids styled to perfection',
  })
  description: string;

  @ApiProperty({ example: 25000 })
  price: number;

  @ApiProperty({ example: 180 })
  duration: number;

  @ApiProperty({ example: 'ACTIVE' })
  status: string;

  @ApiProperty({ type: CategoryResponseDto })
  category: CategoryResponseDto;

  @ApiProperty({ example: '2024-01-15T10:30:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-15T10:30:00.000Z' })
  updatedAt: Date;
}
