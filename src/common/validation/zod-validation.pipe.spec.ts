import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe.js';

const orderSchema = z.object({
  total: z.coerce.number().int().min(0),
  customer: z.object({ email: z.email() }),
});

function catchThrown(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error('expected the action to throw');
}

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(orderSchema);
  const validOrder = { total: 12, customer: { email: 'ada@example.com' } };

  it('returns the parsed value when the input is valid', () => {
    expect(pipe.transform(validOrder)).toEqual(validOrder);
  });

  it('coerces values the schema asks to coerce', () => {
    expect(pipe.transform({ ...validOrder, total: '12' })).toEqual(validOrder);
  });

  it('strips keys the schema does not know', () => {
    expect(pipe.transform({ ...validOrder, isAdmin: true })).toEqual(
      validOrder,
    );
  });

  it('throws a BadRequestException listing one issue per invalid field', () => {
    const invalidOrder = { total: -1, customer: { email: 'nope' } };

    const thrown = catchThrown(() => pipe.transform(invalidOrder));

    expect(thrown).toBeInstanceOf(BadRequestException);
    expect((thrown as BadRequestException).getResponse()).toEqual({
      message: 'Validation failed',
      issues: [
        { path: 'total', message: expect.any(String) },
        { path: 'customer.email', message: expect.any(String) },
      ],
    });
  });
});
