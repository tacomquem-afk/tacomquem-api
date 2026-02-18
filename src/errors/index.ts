import type { FastifyRequest } from 'fastify';

export interface FieldError {
  field: string;
  message: string;
}

export class AppError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(code: string, message: string) {
    super(code, message);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class BadRequestError extends AppError {
  constructor(code: string, message: string) {
    super(code, message);
    Object.setPrototypeOf(this, BadRequestError.prototype);
  }
}

export class ConflictError extends AppError {
  constructor(code: string, message: string) {
    super(code, message);
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

export class UnauthorizedError extends AppError {
  constructor(code: string, message: string) {
    super(code, message);
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

export class ForbiddenError extends AppError {
  constructor(code: string, message: string) {
    super(code, message);
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

export class ValidationError extends AppError {
  fields: FieldError[];

  constructor(code: string, message: string, fields: FieldError[] = []) {
    super(code, message);
    this.fields = fields;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class GoneError extends AppError {
  constructor(code: string, message: string) {
    super(code, message);
    Object.setPrototypeOf(this, GoneError.prototype);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(code: string, message: string) {
    super(code, message);
    Object.setPrototypeOf(this, PayloadTooLargeError.prototype);
  }
}

export class InternalServerError extends AppError {
  constructor(code: string, message: string) {
    super(code, message);
    Object.setPrototypeOf(this, InternalServerError.prototype);
  }
}

export const ErrorCodes = {
  AUTH_EMAIL_TAKEN: 'AUTH_EMAIL_TAKEN',
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  AUTH_TOKEN_USED: 'AUTH_TOKEN_USED',
  AUTH_EMAIL_NOT_VERIFIED: 'AUTH_EMAIL_NOT_VERIFIED',
  AUTH_SOCIAL_ACCOUNT: 'AUTH_SOCIAL_ACCOUNT',
  AUTH_UNAUTHORIZED: 'AUTH_UNAUTHORIZED',
  AUTH_FORBIDDEN: 'AUTH_FORBIDDEN',
  AUTH_CREATE_FAILED: 'AUTH_CREATE_FAILED',
  AUTH_TOKEN_TYPE_INVALID: 'AUTH_TOKEN_TYPE_INVALID',

  ITEMS_NOT_FOUND: 'ITEMS_NOT_FOUND',
  ITEMS_CREATE_FAILED: 'ITEMS_CREATE_FAILED',
  ITEMS_UPDATE_FAILED: 'ITEMS_UPDATE_FAILED',

  LOANS_NOT_FOUND: 'LOANS_NOT_FOUND',
  LOANS_ITEM_NOT_FOUND: 'LOANS_ITEM_NOT_FOUND',
  LOANS_USER_NOT_FOUND: 'LOANS_USER_NOT_FOUND',
  LOANS_CREATE_FAILED: 'LOANS_CREATE_FAILED',
  LOANS_INVALID_STATE: 'LOANS_INVALID_STATE',
  LOANS_TOKEN_INVALID: 'LOANS_TOKEN_INVALID',
  LOANS_TOKEN_EXPIRED: 'LOANS_TOKEN_EXPIRED',
  LOANS_TOKEN_USED: 'LOANS_TOKEN_USED',
  LOANS_ALREADY_PROCESSED: 'LOANS_ALREADY_PROCESSED',
  LOANS_NO_RECEIVER: 'LOANS_NO_RECEIVER',
  LOANS_FETCH_FAILED: 'LOANS_FETCH_FAILED',

  LINKS_INVALID_TOKEN: 'LINKS_INVALID_TOKEN',
  LINKS_TOKEN_EXPIRED: 'LINKS_TOKEN_EXPIRED',

  ADMIN_INSUFFICIENT_PERMISSIONS: 'ADMIN_INSUFFICIENT_PERMISSIONS',
  ADMIN_TARGET_NOT_FOUND: 'ADMIN_TARGET_NOT_FOUND',
  ADMIN_CANNOT_DEMOTE_SELF: 'ADMIN_CANNOT_DEMOTE_SELF',
  ADMIN_INVALID_ROLE: 'ADMIN_INVALID_ROLE',
  ADMIN_USE_REMOVE: 'ADMIN_USE_REMOVE',

  STORAGE_FILE_TOO_LARGE: 'STORAGE_FILE_TOO_LARGE',
  STORAGE_UNSUPPORTED_FORMAT: 'STORAGE_UNSUPPORTED_FORMAT',
  STORAGE_PROCESSING_FAILED: 'STORAGE_PROCESSING_FAILED',
  STORAGE_UPLOAD_FAILED: 'STORAGE_UPLOAD_FAILED',
  STORAGE_RECORD_FAILED: 'STORAGE_RECORD_FAILED',
  STORAGE_NO_FILE: 'STORAGE_NO_FILE',
  STORAGE_MAX_FILES: 'STORAGE_MAX_FILES',

  VALIDATION_INVALID_REQUEST: 'VALIDATION_INVALID_REQUEST',

  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  errorCode: string;
  instance: string;
  errors?: FieldError[];
}

type ErrorClass = new (...args: any[]) => AppError;

const HTTP_STATUS_TEXTS: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  410: 'Gone',
  413: 'Payload Too Large',
  422: 'Unprocessable Entity',
  500: 'Internal Server Error',
};

export function formatProblemDetails(error: AppError, request: FastifyRequest): ProblemDetails {
  const statusCode = errorStatusMap.get(error.constructor as ErrorClass) || 500;
  const title = HTTP_STATUS_TEXTS[statusCode] || 'Internal Server Error';

  const details: ProblemDetails = {
    type: 'about:blank',
    title,
    status: statusCode,
    detail: error.message,
    errorCode: error.code,
    instance: request.url,
  };

  if (error instanceof ValidationError && error.fields.length > 0) {
    details.errors = error.fields;
  }

  return details;
}

export const errorStatusMap = new Map<ErrorClass, number>([
  [NotFoundError, 404],
  [BadRequestError, 400],
  [ConflictError, 409],
  [UnauthorizedError, 401],
  [ForbiddenError, 403],
  [ValidationError, 422],
  [GoneError, 410],
  [PayloadTooLargeError, 413],
  [InternalServerError, 500],
]);
