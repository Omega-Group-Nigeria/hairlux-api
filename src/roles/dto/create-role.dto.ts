import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateRoleDto {
  @ApiProperty({
    example: 'Receptionist',
    description: 'Unique role name (e.g. "Receptionist", "Senior Manager")',
  })
  @Transform(({ value }) => value?.trim())
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name: string;

  @ApiPropertyOptional({
    example: 'Handles front-desk bookings and customer queries',
    description: 'Optional description of what this role covers',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
