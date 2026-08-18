import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class GoogleSignInDto {
    @ApiProperty({ description: 'The ID token returned by Google Sign-In on the frontend.' })
    @IsString()
    @IsNotEmpty()
    idToken: string;
}