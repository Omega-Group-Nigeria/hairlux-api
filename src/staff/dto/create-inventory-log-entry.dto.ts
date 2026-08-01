import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateInventoryLogEntryDto {
  @ApiProperty({ example: 'Olaplex No.3 Hair Perfector' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  productName: string;

  @ApiProperty({ enum: ['RECEIVED', 'SOLD'], example: 'RECEIVED' })
  @IsIn(['RECEIVED', 'SOLD'])
  type: 'RECEIVED' | 'SOLD';

  @ApiProperty({ example: 12 })
  @IsInt()
  @Min(1)
  @Max(100000)
  quantity: number;

  @ApiPropertyOptional({ example: 'Delivery from supplier, invoice #4471' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  note?: string;
}