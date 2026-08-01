import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsUUID } from 'class-validator';

export class AssignRoleDto {
    @ApiProperty({ description: 'The AdminRole (permission set) to assign' })
    @IsUUID()
    adminRoleId: string;

    @ApiProperty({ description: 'Whether this role assignment also grants a login to the admin dashboard. If false, the permissions still apply within the staff portal only.' })
    @IsBoolean()
    grantPortalLogin: boolean;
}