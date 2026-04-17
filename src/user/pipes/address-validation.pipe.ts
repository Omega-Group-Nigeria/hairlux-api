import {
  HttpStatus,
  Injectable,
  UnprocessableEntityException,
  ValidationPipe,
} from '@nestjs/common';
import type { ValidationError } from 'class-validator';

interface ValidationIssue {
  field: string;
  message: string;
}

function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): ValidationIssue[] {
  return errors.flatMap((error) => {
    const field = parentPath ? `${parentPath}.${error.property}` : error.property;
    const issues: ValidationIssue[] = [];

    if (error.constraints) {
      for (const message of Object.values(error.constraints)) {
        issues.push({ field, message });
      }
    }

    if (error.children?.length) {
      issues.push(...flattenValidationErrors(error.children, field));
    }

    return issues;
  });
}

@Injectable()
export class AddressValidationPipe extends ValidationPipe {
  constructor() {
    super({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      exceptionFactory: (validationErrors: ValidationError[] = []) => {
        const errors = flattenValidationErrors(validationErrors);

        return new UnprocessableEntityException({
          success: false,
          message: 'Validation failed',
          errors,
        });
      },
    });
  }
}
