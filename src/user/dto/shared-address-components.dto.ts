import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class AddressComponentsDto {
  @ApiPropertyOptional({ example: '12 Admiralty Way' })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty({
    message: 'addressComponents.streetAddress should not be empty',
  })
  streetAddress?: string;

  @ApiPropertyOptional({ example: 'Lagos' })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: 'addressComponents.city should not be empty' })
  city?: string;

  @ApiPropertyOptional({ example: 'Lagos' })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: 'addressComponents.state should not be empty' })
  state?: string;

  @ApiPropertyOptional({ example: 'Nigeria' })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: 'addressComponents.country should not be empty' })
  country?: string;
}
