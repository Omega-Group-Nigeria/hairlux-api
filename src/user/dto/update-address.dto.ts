import { IsOptional, IsString, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateAddressDto {
  @ApiProperty({
    example: 'Office',
    description: 'Label for the address',
    required: false,
  })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiProperty({
    example: '25 Victoria Island',
    description: 'Street address or detailed location',
    required: false,
  })
  @IsOptional()
  @IsString()
  addressLine?: string;

  @ApiProperty({
    example: 'Lagos',
    description: 'City name',
    required: false,
  })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({
    example: 'Lagos',
    description: 'State or province',
    required: false,
  })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiProperty({
    example: 'Nigeria',
    description: 'Country name',
    required: false,
  })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiProperty({
    example: '101245',
    description: 'Postal or ZIP code',
    required: false,
  })
  @IsOptional()
  @IsString()
  postalCode?: string;

  @ApiProperty({
    example: false,
    description: 'Set as default address',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
