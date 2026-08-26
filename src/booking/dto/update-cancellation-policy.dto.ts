import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CancellationPolicyScenario } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CancellationPolicyRuleDto {
  @ApiProperty({ enum: CancellationPolicyScenario })
  @IsEnum(CancellationPolicyScenario)
  scenario: CancellationPolicyScenario;

  @ApiPropertyOptional({
    description:
      'Minutes before service (walk-in within window) or after booking (home grace period).',
    example: 120,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_080)
  windowMinutes?: number;

  @ApiProperty({ example: 100, description: 'Refund percentage (0–100)' })
  @IsInt()
  @Min(0)
  @Max(100)
  refundPercent: number;

  @ApiProperty({ example: 0, description: 'Forfeiture percentage (0–100)' })
  @IsInt()
  @Min(0)
  @Max(100)
  forfeiturePercent: number;

  @ApiProperty({ example: true })
  @IsBoolean()
  customerCanCancel: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  adminCanCancel: boolean;
}

export class UpdateCancellationPolicyDto {
  @ApiPropertyOptional({ type: [CancellationPolicyRuleDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CancellationPolicyRuleDto)
  walkInBranch?: CancellationPolicyRuleDto[];

  @ApiPropertyOptional({ type: [CancellationPolicyRuleDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CancellationPolicyRuleDto)
  homeService?: CancellationPolicyRuleDto[];
}
