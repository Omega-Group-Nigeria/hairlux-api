import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetDocumentTypeActiveDto {
    @ApiProperty()
    @IsBoolean()
    isActive: boolean;
}