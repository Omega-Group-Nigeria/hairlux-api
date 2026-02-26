import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAddressDto {
  @ApiProperty({
    example: 'Home',
    description: 'Label for the address (e.g., Home, Office)',
    required: false,
  })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiProperty({
    example: '15 Lekki Phase 1',
    description: 'Street address or detailed location',
  })
  @IsString()
  @IsNotEmpty({ message: 'Address line is required' })
  addressLine: string;

  @ApiProperty({
    example: 'Lagos',
    description: 'City name',
  })
  @IsString()
  @IsNotEmpty({ message: 'City is required' })
  city: string;

  @ApiProperty({
    example: 'Lagos',
    description: 'State or province',
  })
  @IsString()
  @IsNotEmpty({ message: 'State is required' })
  state: string;

  @ApiProperty({
    example: 'Nigeria',
    description: 'Country name (defaults to Nigeria)',
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
    example: 6.4541,
    description: 'Latitude coordinate for the address location',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiProperty({
    example: 3.3947,
    description: 'Longitude coordinate for the address location',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiProperty({
    example: true,
    description: 'Set as default address',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
