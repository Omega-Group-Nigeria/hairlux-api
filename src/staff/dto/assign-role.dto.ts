import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';

export class AssignRoleDto {
    @ApiProperty({ description: 'The AdminRole (permission set) to assign' })
    @IsUUID()
    adminRoleId: string;

    @ApiProperty({ description: 'Whether this role assignment also grants a login to the admin dashboard. If false, the permissions still apply within the staff portal only. Ignored when mode is "secondary" — login capability is only ever governed by the primary role.' })
    @IsBoolean()
    grantPortalLogin: boolean;

    @ApiPropertyOptional({
        description: 'primary (default) REPLACES the staff member\'s existing role. secondary ADDS this role alongside whatever they already hold — effective permissions become the union.',
        enum: ['primary', 'secondary'],
        default: 'primary',
    })
    @IsOptional()
    @IsIn(['primary', 'secondary'])
    mode?: 'primary' | 'secondary';
}