import type { Response } from 'express';
import type { ZodError } from 'zod';

export const ErrorCodes = {
  EVENT_NOT_FOUND: 'EVENT_NOT_FOUND',
  EVENT_NOT_AVAILABLE: 'EVENT_NOT_AVAILABLE',
  ZONE_NOT_FOUND: 'ZONE_NOT_FOUND',
  ZONE_CAPACITY_EXCEEDED: 'ZONE_CAPACITY_EXCEEDED',
  SEAT_NOT_FOUND: 'SEAT_NOT_FOUND',
  SEAT_ALREADY_BOOKED: 'SEAT_ALREADY_BOOKED',
  TABLE_NOT_FOUND: 'TABLE_NOT_FOUND',
  TABLE_CAPACITY_EXCEEDED: 'TABLE_CAPACITY_EXCEEDED',
  INVALID_QUANTITY: 'INVALID_QUANTITY',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  PAYMENT_NOT_FOUND: 'PAYMENT_NOT_FOUND',
  PAYMENT_ALREADY_COMPLETED: 'PAYMENT_ALREADY_COMPLETED',
  PAYMENT_AMOUNT_MISMATCH: 'PAYMENT_AMOUNT_MISMATCH',
  INVALID_WEBHOOK_SIGNATURE: 'INVALID_WEBHOOK_SIGNATURE',
  DUPLICATE_WEBHOOK: 'DUPLICATE_WEBHOOK',
  TICKET_ALREADY_CHECKED_IN: 'TICKET_ALREADY_CHECKED_IN',
  TICKET_NOT_CONFIRMED: 'TICKET_NOT_CONFIRMED',
  TICKET_NOT_FOUND: 'TICKET_NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorBody(code: string, message: string) {
  return { success: false as const, error: { code, message } };
}

export function fail(res: Response, status: number, code: string, message: string) {
  return res.status(status).json(errorBody(code, message));
}

export function failApp(res: Response, err: AppError) {
  return fail(res, err.status, err.code, err.message);
}

export function failZod(res: Response, error: ZodError, code: string = ErrorCodes.VALIDATION_ERROR) {
  return fail(res, 400, code, error.issues[0]?.message ?? 'Invalid request');
}

export function registerValidationCode(error: ZodError): string {
  const path = error.issues[0]?.path.join('.') ?? '';
  if (
    path.includes('quantity') ||
    path === 'items' ||
    path.includes('seatIds') ||
    path.includes('guestNames')
  ) {
    return ErrorCodes.INVALID_QUANTITY;
  }
  return ErrorCodes.VALIDATION_ERROR;
}

export function isPrismaErrorCode(err: unknown, code: string): boolean {
  let current: unknown = err;
  for (let i = 0; i < 5 && current && typeof current === 'object'; i++) {
    if ('code' in current && (current as { code: unknown }).code === code) {
      return true;
    }
    current = 'cause' in current ? (current as { cause: unknown }).cause : undefined;
  }
  return false;
}

export function isTestMode(): boolean {
  return process.env.TEST_MODE === 'true';
}
