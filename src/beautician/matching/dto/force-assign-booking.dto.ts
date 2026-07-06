import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ForceAssignBookingDto {
  @ApiProperty({ description: 'Beautician user ID to assign' })
  @IsUUID()
  beauticianUserId: string;
}