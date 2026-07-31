import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetAdminAccessDto {
    @ApiProperty({ description: 'true to grant admin portal access, false to revoke it' })
    @IsBoolean()
    grant: boolean;
}