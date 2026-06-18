import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

const toTrimmedString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateStaffLocationDto {
  @ApiProperty({ example: 'Lekki Branch' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }) => toTrimmedString(value))
  name: string;

  @ApiProperty({
    example: '15 Admiralty Way, Lekki Phase 1, Lagos',
    description: 'Physical address for the location / branch',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  @Transform(({ value }) => toTrimmedString(value))
  address: string;
}
