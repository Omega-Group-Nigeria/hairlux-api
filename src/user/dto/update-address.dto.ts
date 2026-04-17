import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AddressComponentsDto } from './shared-address-components.dto';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateAddressDto {
  @ApiPropertyOptional({
    example: 'Office',
    description: 'Label for the address',
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: 'label should not be empty' })
  @MaxLength(60)
  label?: string;

  @ApiPropertyOptional({
    example: '12 Admiralty Way, Lekki Phase 1, Lagos, Nigeria',
    description: 'User-selected full address from maps lookup',
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: 'fullAddress should not be empty' })
  @MaxLength(255)
  fullAddress?: string;

  @ApiPropertyOptional({
    example: '12 Admiralty Way',
    description: 'Normalized street address from maps',
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: 'streetAddress should not be empty' })
  streetAddress?: string;

  @ApiPropertyOptional({
    example: 'Lagos',
    description: 'City name',
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: 'city should not be empty' })
  city?: string;

  @ApiPropertyOptional({
    example: 'Lagos',
    description: 'State or province',
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: 'state should not be empty' })
  state?: string;

  @ApiPropertyOptional({
    example: 'Nigeria',
    description: 'Country name',
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: 'country should not be empty' })
  country?: string;

  @ApiPropertyOptional({
    example: 'ChIJ...',
    description: 'Google maps place id',
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: 'placeId should not be empty' })
  @MaxLength(255)
  placeId?: string;

  @ApiPropertyOptional({
    description: 'Normalized maps components',
    type: AddressComponentsDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressComponentsDto)
  addressComponents?: AddressComponentsDto;

  @ApiPropertyOptional({
    example: false,
    description: 'Set as default address',
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
