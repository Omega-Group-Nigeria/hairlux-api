import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateBranchDto {
  @ApiProperty({ example: 'Lekki Branch' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name: string;

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