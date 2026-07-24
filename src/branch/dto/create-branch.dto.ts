import { ApiProperty,ApiPropertyOptional, } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, IsOptional, Matches } from 'class-validator';

export class CreateBranchDto {
  @ApiProperty({ example: 'Lekki Branch' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name: string;

  @ApiPropertyOptional({
  example: 'LEK',
  description:
    'Short branch code used in staff IDs (e.g. HL-LEK-0001). 2-5 uppercase ' +
    'letters. If omitted, a code is auto-suggested from the branch name.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2,5}$/, {
    message: 'code must be 2-5 uppercase letters (e.g. LEK, IFE, ABJ)',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
    code?: string;

  @ApiProperty({
    example: '15 Admiralty Way, Lekki Phase 1, Lagos',
    description: 'Physical address shown in branch picker and detail',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  address: string;
}