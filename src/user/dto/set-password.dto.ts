import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

/**
 * Distinct from ChangePasswordDto -- this is for an account that currently
 * has NO password at all (Google-signup), so there's nothing to confirm
 * against. Once set, the account can be used with either email+password
 * login or Google -- never removed, only ever added. Same strength rule
 * as ChangePasswordDto's newPassword, kept in sync deliberately.
 */
export class SetPasswordDto {
    @ApiProperty({
        example: 'NewSecurePass123',
        description: 'New password (min 8 characters, must contain uppercase, lowercase, and number)',
    })
    @IsString()
    @IsNotEmpty({ message: 'Password is required' })
    @MinLength(8, { message: 'Password must be at least 8 characters long' })
    @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
        message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
    })
    newPassword: string;
}