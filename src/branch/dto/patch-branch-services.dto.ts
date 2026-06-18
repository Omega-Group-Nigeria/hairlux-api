import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { PatchBranchServiceItemDto } from './patch-branch-service-item.dto';

export class PatchBranchServicesDto {
  @ApiProperty({ type: [PatchBranchServiceItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PatchBranchServiceItemDto)
  services: PatchBranchServiceItemDto[];
}