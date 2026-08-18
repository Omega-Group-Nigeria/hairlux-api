import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

const BUILDING_DESCRIPTIONS = ['Residential', 'Commercial'] as const;
const BUILDING_STATUSES = ['Completed', 'Painted', 'Completed and Painted'] as const;
// Includes 'Bungalow' -- present in QoreID's own guide/markdown docs but
// missing from the live API reference page's rendered enum list at the
// time this was built. Kept in since omitting a legitimate, extremely
// common Nigerian housing type is worse than QoreID's own API rejecting
// it with a clear validation error if it truly isn't accepted.
const BUILDING_TYPES = ['Multi-story', 'Flats & Apartment', 'Bungalow', 'Office Complex'] as const;

export class SubmitAddressVerificationDto {
    @ApiProperty() @IsString() @IsNotEmpty() street: string;
    @ApiProperty() @IsString() @IsNotEmpty() city: string;
    @ApiProperty() @IsString() @IsNotEmpty() lgaName: string;
    @ApiProperty() @IsString() @IsNotEmpty() stateName: string;
    @ApiPropertyOptional() @IsOptional() @IsString() landmark?: string;
    @ApiPropertyOptional() @IsOptional() @IsString() houseNumber?: string;

    @ApiProperty({ description: 'Free-text description to help the field agent locate the property' })
    @IsString() @IsNotEmpty() generalDescription: string;

    @ApiProperty() @Type(() => Number) @IsNumber() latitude: number;
    @ApiProperty() @Type(() => Number) @IsNumber() longitude: number;

    @ApiProperty({ enum: BUILDING_DESCRIPTIONS })
    @IsIn(BUILDING_DESCRIPTIONS) buildingDescription: string;

    @ApiProperty()
    @Type(() => Boolean) @IsBoolean() hasGateAndFence: boolean;

    @ApiProperty({ enum: BUILDING_STATUSES })
    @IsIn(BUILDING_STATUSES) buildingStatus: string;

    @ApiProperty({ enum: BUILDING_TYPES })
    @IsIn(BUILDING_TYPES) buildingType: string;

    @ApiProperty() @IsString() @IsNotEmpty() buildingColour: string;
}