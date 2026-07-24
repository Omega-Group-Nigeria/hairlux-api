import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SubmitGuarantorDto {
  @ApiProperty({ example: 'Chinedu Okonkwo' })
  @IsString() @IsNotEmpty() @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name: string;

  @ApiProperty({ example: 'Civil Servant' })
  @IsString() @IsNotEmpty() @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  occupation: string;

  @ApiProperty({ example: '08012345678' })
  @IsString() @IsNotEmpty() @MaxLength(20)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  phone: string;

  @ApiProperty({ example: '12 Adeola Odeku Street, Victoria Island, Lagos' })
  @IsString() @IsNotEmpty() @MaxLength(500)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  address: string;
}

export class SubmitEmergencyContactDto {
  @ApiProperty({ example: 'Amaka Bello' })
  @IsString() @IsNotEmpty() @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name: string;

  @ApiProperty({ example: '08098765432' })
  @IsString() @IsNotEmpty() @MaxLength(20)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  phone: string;

  @ApiProperty({ example: 'Sister' })
  @IsString() @IsNotEmpty() @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  relationship: string;
}

export class SubmitAddressDto {
  @ApiProperty({ example: '45 Ring Road, Ibadan, Oyo State' })
  @IsString() @IsNotEmpty() @MaxLength(500)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  address: string;
}

export class SubmitReferenceDto {
  @ApiProperty({ example: 'Funmilayo Adeyemi' })
  @IsString() @IsNotEmpty() @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name: string;

  @ApiProperty({ example: '08011122233' })
  @IsString() @IsNotEmpty() @MaxLength(20)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  phone: string;

  @ApiProperty({ example: 'Former Manager at XYZ Salon' })
  @IsString() @IsNotEmpty() @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  relationship: string;
}