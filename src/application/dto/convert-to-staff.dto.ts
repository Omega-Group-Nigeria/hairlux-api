import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ConvertToStaffDto {
  @ApiProperty({
    description:
      'Final staff location to assign on hire — may differ from the applicant\'s preferred branch, so this is chosen explicitly rather than reused automatically',
  })
  @IsUUID()
  locationId: string;
}