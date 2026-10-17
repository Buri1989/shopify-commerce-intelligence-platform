import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import type { $ZodIssue } from 'zod/v4/core';

export interface ValidationIssue {
  path: string;
  message: string;
}

export class ZodValidationPipe<Output> implements PipeTransform<
  unknown,
  Output
> {
  constructor(private readonly schema: ZodType<Output>) {}

  transform(value: unknown): Output {
    const result = this.schema.safeParse(value);
    if (result.success) {
      return result.data;
    }
    throw new BadRequestException({
      message: 'Validation failed',
      issues: result.error.issues.map(mapZodIssue),
    });
  }
}

function mapZodIssue(issue: $ZodIssue): ValidationIssue {
  return { path: issue.path.join('.'), message: issue.message };
}
