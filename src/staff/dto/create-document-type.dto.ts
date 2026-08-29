import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateDocumentTypeDto {
    @ApiProperty({ example: 'Fire Safety Acknowledgment' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(150)
    name: string;
}