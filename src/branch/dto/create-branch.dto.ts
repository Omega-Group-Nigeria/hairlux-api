import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class CreateBranchDto {
  @ApiProperty({ example: 'Lekki Branch' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name: string;

  @ApiPropertyOptional({ example: 'LEK', description: '...' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2,5}$/, { message: 'code must be 2-5 uppercase letters (e.g. LEK, IFE, ABJ)' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  code?: string;

  @ApiProperty({ example: '15 Admiralty Way, Lekki Phase 1, Lagos', description: 'Physical address shown in branch picker and detail' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  address: string;

  @ApiProperty({ example: 6.4531, description: 'Branch latitude — required before Attendance clock-in will work for this branch' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  gpsLat?: number;

  @ApiProperty({ example: 3.4692, description: 'Branch longitude' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  gpsLng?: number;

  @ApiPropertyOptional({ example: 100, description: 'GPS radius in meters within which staff can clock in', default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  approvedRadiusMeters?: number;

  @ApiPropertyOptional({ example: 10, description: 'Minutes of grace before a late clock-in counts as Late', default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  lateGracePeriodMinutes?: number;
}