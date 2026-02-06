import { describe, expect, it } from 'bun:test';
import type { FastifyRequest } from 'fastify';
import {
  AppError,
  BadRequestError,
  ConflictError,
  ErrorCodes,
  errorStatusMap,
  ForbiddenError,
  formatProblemDetails,
  GoneError,
  NotFoundError,
  PayloadTooLargeError,
  UnauthorizedError,
  ValidationError,
} from '../index';

describe('AppError base class', () => {
  it('should set code and message on construction', () => {
    const error = new AppError('TEST_CODE', 'Test message');
    expect(error.code).toBe('TEST_CODE');
    expect(error.message).toBe('Test message');
  });

  it('should extend Error', () => {
    const error = new AppError('TEST_CODE', 'Test message');
    expect(error instanceof Error).toBe(true);
  });
});

describe('Error subclasses', () => {
  it('NotFoundError should be instanceof AppError and NotFoundError', () => {
    const error = new NotFoundError(ErrorCodes.ITEMS_NOT_FOUND, 'Not found');
    expect(error instanceof AppError).toBe(true);
    expect(error instanceof NotFoundError).toBe(true);
  });

  it('BadRequestError should be instanceof AppError and BadRequestError', () => {
    const error = new BadRequestError(ErrorCodes.ITEMS_CREATE_FAILED, 'Failed to create');
    expect(error instanceof AppError).toBe(true);
    expect(error instanceof BadRequestError).toBe(true);
  });

  it('ConflictError should be instanceof AppError and ConflictError', () => {
    const error = new ConflictError(ErrorCodes.AUTH_EMAIL_TAKEN, 'Email already registered');
    expect(error instanceof AppError).toBe(true);
    expect(error instanceof ConflictError).toBe(true);
  });

  it('UnauthorizedError should be instanceof AppError and UnauthorizedError', () => {
    const error = new UnauthorizedError(ErrorCodes.AUTH_UNAUTHORIZED, 'Unauthorized');
    expect(error instanceof AppError).toBe(true);
    expect(error instanceof UnauthorizedError).toBe(true);
  });

  it('ForbiddenError should be instanceof AppError and ForbiddenError', () => {
    const error = new ForbiddenError(ErrorCodes.ADMIN_INSUFFICIENT_PERMISSIONS, 'Forbidden');
    expect(error instanceof AppError).toBe(true);
    expect(error instanceof ForbiddenError).toBe(true);
  });

  it('GoneError should be instanceof AppError and GoneError', () => {
    const error = new GoneError(ErrorCodes.AUTH_TOKEN_EXPIRED, 'Token expired');
    expect(error instanceof AppError).toBe(true);
    expect(error instanceof GoneError).toBe(true);
  });

  it('PayloadTooLargeError should be instanceof AppError and PayloadTooLargeError', () => {
    const error = new PayloadTooLargeError(ErrorCodes.STORAGE_FILE_TOO_LARGE, 'File too large');
    expect(error instanceof AppError).toBe(true);
    expect(error instanceof PayloadTooLargeError).toBe(true);
  });
});

describe('ValidationError', () => {
  it('should have fields array', () => {
    const fields = [
      { field: 'email', message: 'Invalid email' },
      { field: 'password', message: 'Too short' },
    ];
    const error = new ValidationError(
      ErrorCodes.VALIDATION_INVALID_REQUEST,
      'Validation failed',
      fields
    );
    expect(error.fields).toEqual(fields);
  });

  it('should have empty fields array by default', () => {
    const error = new ValidationError(ErrorCodes.VALIDATION_INVALID_REQUEST, 'Validation failed');
    expect(error.fields).toEqual([]);
  });

  it('should be instanceof AppError and ValidationError', () => {
    const error = new ValidationError(ErrorCodes.VALIDATION_INVALID_REQUEST, 'Validation failed');
    expect(error instanceof AppError).toBe(true);
    expect(error instanceof ValidationError).toBe(true);
  });
});

describe('formatProblemDetails', () => {
  const mockRequest = {
    url: '/api/items/test-id',
  } as FastifyRequest;

  it('should return type about:blank', () => {
    const error = new NotFoundError(ErrorCodes.ITEMS_NOT_FOUND, 'Item not found');
    const details = formatProblemDetails(error, mockRequest);
    expect(details.type).toBe('about:blank');
  });

  it('should return correct title for NotFoundError (404)', () => {
    const error = new NotFoundError(ErrorCodes.ITEMS_NOT_FOUND, 'Item not found');
    const details = formatProblemDetails(error, mockRequest);
    expect(details.title).toBe('Not Found');
  });

  it('should return correct title for BadRequestError (400)', () => {
    const error = new BadRequestError(ErrorCodes.ITEMS_CREATE_FAILED, 'Failed to create');
    const details = formatProblemDetails(error, mockRequest);
    expect(details.title).toBe('Bad Request');
  });

  it('should return correct title for ConflictError (409)', () => {
    const error = new ConflictError(ErrorCodes.AUTH_EMAIL_TAKEN, 'Email already registered');
    const details = formatProblemDetails(error, mockRequest);
    expect(details.title).toBe('Conflict');
  });

  it('should return correct title for UnauthorizedError (401)', () => {
    const error = new UnauthorizedError(ErrorCodes.AUTH_UNAUTHORIZED, 'Unauthorized');
    const details = formatProblemDetails(error, mockRequest);
    expect(details.title).toBe('Unauthorized');
  });

  it('should return correct title for ForbiddenError (403)', () => {
    const error = new ForbiddenError(ErrorCodes.ADMIN_INSUFFICIENT_PERMISSIONS, 'Forbidden');
    const details = formatProblemDetails(error, mockRequest);
    expect(details.title).toBe('Forbidden');
  });

  it('should return correct title for ValidationError (422)', () => {
    const error = new ValidationError(ErrorCodes.VALIDATION_INVALID_REQUEST, 'Validation failed');
    const details = formatProblemDetails(error, mockRequest);
    expect(details.title).toBe('Unprocessable Entity');
  });

  it('should return correct title for GoneError (410)', () => {
    const error = new GoneError(ErrorCodes.AUTH_TOKEN_EXPIRED, 'Token expired');
    const details = formatProblemDetails(error, mockRequest);
    expect(details.title).toBe('Gone');
  });

  it('should return correct title for PayloadTooLargeError (413)', () => {
    const error = new PayloadTooLargeError(ErrorCodes.STORAGE_FILE_TOO_LARGE, 'File too large');
    const details = formatProblemDetails(error, mockRequest);
    expect(details.title).toBe('Payload Too Large');
  });

  it('should return correct status code', () => {
    const error = new NotFoundError(ErrorCodes.ITEMS_NOT_FOUND, 'Item not found');
    const details = formatProblemDetails(error, mockRequest);
    expect(details.status).toBe(404);
  });

  it('should return error detail from message', () => {
    const message = 'Custom error message';
    const error = new BadRequestError(ErrorCodes.ITEMS_CREATE_FAILED, message);
    const details = formatProblemDetails(error, mockRequest);
    expect(details.detail).toBe(message);
  });

  it('should return errorCode from error.code', () => {
    const error = new NotFoundError(ErrorCodes.ITEMS_NOT_FOUND, 'Item not found');
    const details = formatProblemDetails(error, mockRequest);
    expect(details.errorCode).toBe(ErrorCodes.ITEMS_NOT_FOUND);
  });

  it('should return instance from request URL', () => {
    const error = new NotFoundError(ErrorCodes.ITEMS_NOT_FOUND, 'Item not found');
    const details = formatProblemDetails(error, mockRequest);
    expect(details.instance).toBe('/api/items/test-id');
  });

  it('should include errors array for ValidationError with fields', () => {
    const fields = [
      { field: 'email', message: 'Invalid email' },
      { field: 'password', message: 'Too short' },
    ];
    const error = new ValidationError(
      ErrorCodes.VALIDATION_INVALID_REQUEST,
      'Validation failed',
      fields
    );
    const details = formatProblemDetails(error, mockRequest);
    expect(details.errors).toEqual(fields);
  });

  it('should not include errors array for ValidationError without fields', () => {
    const error = new ValidationError(
      ErrorCodes.VALIDATION_INVALID_REQUEST,
      'Validation failed',
      []
    );
    const details = formatProblemDetails(error, mockRequest);
    expect(details.errors).toBeUndefined();
  });

  it('should not include errors array for non-ValidationError', () => {
    const error = new BadRequestError(ErrorCodes.ITEMS_CREATE_FAILED, 'Failed to create');
    const details = formatProblemDetails(error, mockRequest);
    expect(details.errors).toBeUndefined();
  });
});

describe('errorStatusMap', () => {
  it('should map NotFoundError to 404', () => {
    expect(errorStatusMap.get(NotFoundError)).toBe(404);
  });

  it('should map BadRequestError to 400', () => {
    expect(errorStatusMap.get(BadRequestError)).toBe(400);
  });

  it('should map ConflictError to 409', () => {
    expect(errorStatusMap.get(ConflictError)).toBe(409);
  });

  it('should map UnauthorizedError to 401', () => {
    expect(errorStatusMap.get(UnauthorizedError)).toBe(401);
  });

  it('should map ForbiddenError to 403', () => {
    expect(errorStatusMap.get(ForbiddenError)).toBe(403);
  });

  it('should map ValidationError to 422', () => {
    expect(errorStatusMap.get(ValidationError)).toBe(422);
  });

  it('should map GoneError to 410', () => {
    expect(errorStatusMap.get(GoneError)).toBe(410);
  });

  it('should map PayloadTooLargeError to 413', () => {
    expect(errorStatusMap.get(PayloadTooLargeError)).toBe(413);
  });
});

describe('ErrorCodes', () => {
  it('should have all required error codes', () => {
    expect(ErrorCodes.AUTH_EMAIL_TAKEN).toBe('AUTH_EMAIL_TAKEN');
    expect(ErrorCodes.AUTH_INVALID_CREDENTIALS).toBe('AUTH_INVALID_CREDENTIALS');
    expect(ErrorCodes.AUTH_TOKEN_EXPIRED).toBe('AUTH_TOKEN_EXPIRED');
    expect(ErrorCodes.AUTH_TOKEN_INVALID).toBe('AUTH_TOKEN_INVALID');
    expect(ErrorCodes.AUTH_TOKEN_USED).toBe('AUTH_TOKEN_USED');
    expect(ErrorCodes.AUTH_EMAIL_NOT_VERIFIED).toBe('AUTH_EMAIL_NOT_VERIFIED');
    expect(ErrorCodes.AUTH_SOCIAL_ACCOUNT).toBe('AUTH_SOCIAL_ACCOUNT');
    expect(ErrorCodes.AUTH_UNAUTHORIZED).toBe('AUTH_UNAUTHORIZED');
    expect(ErrorCodes.AUTH_CREATE_FAILED).toBe('AUTH_CREATE_FAILED');
    expect(ErrorCodes.AUTH_TOKEN_TYPE_INVALID).toBe('AUTH_TOKEN_TYPE_INVALID');

    expect(ErrorCodes.ITEMS_NOT_FOUND).toBe('ITEMS_NOT_FOUND');
    expect(ErrorCodes.ITEMS_CREATE_FAILED).toBe('ITEMS_CREATE_FAILED');
    expect(ErrorCodes.ITEMS_UPDATE_FAILED).toBe('ITEMS_UPDATE_FAILED');

    expect(ErrorCodes.LOANS_NOT_FOUND).toBe('LOANS_NOT_FOUND');
    expect(ErrorCodes.LOANS_ITEM_NOT_FOUND).toBe('LOANS_ITEM_NOT_FOUND');
    expect(ErrorCodes.LOANS_USER_NOT_FOUND).toBe('LOANS_USER_NOT_FOUND');
    expect(ErrorCodes.LOANS_CREATE_FAILED).toBe('LOANS_CREATE_FAILED');
    expect(ErrorCodes.LOANS_INVALID_STATE).toBe('LOANS_INVALID_STATE');
    expect(ErrorCodes.LOANS_TOKEN_INVALID).toBe('LOANS_TOKEN_INVALID');
    expect(ErrorCodes.LOANS_TOKEN_EXPIRED).toBe('LOANS_TOKEN_EXPIRED');
    expect(ErrorCodes.LOANS_TOKEN_USED).toBe('LOANS_TOKEN_USED');
    expect(ErrorCodes.LOANS_ALREADY_PROCESSED).toBe('LOANS_ALREADY_PROCESSED');
    expect(ErrorCodes.LOANS_NO_RECEIVER).toBe('LOANS_NO_RECEIVER');
    expect(ErrorCodes.LOANS_FETCH_FAILED).toBe('LOANS_FETCH_FAILED');

    expect(ErrorCodes.LINKS_INVALID_TOKEN).toBe('LINKS_INVALID_TOKEN');
    expect(ErrorCodes.LINKS_TOKEN_EXPIRED).toBe('LINKS_TOKEN_EXPIRED');

    expect(ErrorCodes.ADMIN_INSUFFICIENT_PERMISSIONS).toBe('ADMIN_INSUFFICIENT_PERMISSIONS');
    expect(ErrorCodes.ADMIN_TARGET_NOT_FOUND).toBe('ADMIN_TARGET_NOT_FOUND');
    expect(ErrorCodes.ADMIN_CANNOT_DEMOTE_SELF).toBe('ADMIN_CANNOT_DEMOTE_SELF');
    expect(ErrorCodes.ADMIN_INVALID_ROLE).toBe('ADMIN_INVALID_ROLE');
    expect(ErrorCodes.ADMIN_USE_REMOVE).toBe('ADMIN_USE_REMOVE');

    expect(ErrorCodes.STORAGE_FILE_TOO_LARGE).toBe('STORAGE_FILE_TOO_LARGE');
    expect(ErrorCodes.STORAGE_UNSUPPORTED_FORMAT).toBe('STORAGE_UNSUPPORTED_FORMAT');
    expect(ErrorCodes.STORAGE_PROCESSING_FAILED).toBe('STORAGE_PROCESSING_FAILED');
    expect(ErrorCodes.STORAGE_UPLOAD_FAILED).toBe('STORAGE_UPLOAD_FAILED');
    expect(ErrorCodes.STORAGE_RECORD_FAILED).toBe('STORAGE_RECORD_FAILED');
    expect(ErrorCodes.STORAGE_NO_FILE).toBe('STORAGE_NO_FILE');
    expect(ErrorCodes.STORAGE_MAX_FILES).toBe('STORAGE_MAX_FILES');

    expect(ErrorCodes.VALIDATION_INVALID_REQUEST).toBe('VALIDATION_INVALID_REQUEST');

    expect(ErrorCodes.RATE_LIMIT_EXCEEDED).toBe('RATE_LIMIT_EXCEEDED');
  });
});
