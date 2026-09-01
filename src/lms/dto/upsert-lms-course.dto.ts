import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Multipart form -- video/pdf arrive as files (handled separately in the
 * controller via FileFieldsInterceptor, not on this DTO), roleIds arrives
 * as a JSON-stringified array in a text field (the reliable way to send
 * an array over multipart/form-data) and is parsed here.
 */
export class UpsertLmsCourseDto {
    @ApiProperty() @IsString() @IsNotEmpty() title: string;
    @ApiProperty({ description: 'Rich text/HTML from the Quill editor' }) @IsString() @IsNotEmpty() description: string;

    @ApiProperty({ type: [String], description: 'AdminRole IDs that can view this course, sent as a JSON string' })
    @Transform(({ value }) => {
        if (Array.isArray(value)) return value;
        try { return JSON.parse(value); } catch { return []; }
    })
    @IsArray() @IsString({ each: true })
    roleIds: string[];

    @ApiPropertyOptional({ description: "'true' or 'false' as a string" })
    @IsOptional() @IsString()
    isActive?: string;
}