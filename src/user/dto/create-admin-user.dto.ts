import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  Matches,
  IsOptional,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAdminUserDto {
  @ApiProperty({ example: 'admin@hairlux.com' })
  @Transform(({ value }) => value?.trim().toLowerCase())
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'Admin' })
  @Transform(({ value }) => value?.trim())
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'User' })
  @Transform(({ value }) => value?.trim())
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiPropertyOptional({ example: '+2348012345678' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ example: 'StrongPass@1', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/, {
    message:
      'Password must contain uppercase, lowercase, number, and special character',
  })
  password: string;

  @ApiPropertyOptional({
    example: 'b2f7e1a0-3c14-4f2b-9e8d-1a2b3c4d5e6f',
    description:
      'UUID of the AdminRole to assign. Use either adminRoleId or role (name), not both.',
  })
  @ValidateIf((o) => !o.role)
  @IsUUID()
  adminRoleId?: string;

  @ApiPropertyOptional({
    example: 'CASHIER',
    description:
      'Name of the AdminRole to assign. Use either role (name) or adminRoleId (UUID), not both.',
  })
  @ValidateIf((o) => !o.adminRoleId)
  @IsString()
  @IsNotEmpty()
  role?: string;
}
