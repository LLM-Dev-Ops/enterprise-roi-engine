/**
 * API Middleware
 * Framework-agnostic middleware functions for request processing.
 * These can be adapted to Express, Fastify, Koa, or any other framework.
 */

import { v4 as uuidv4 } from 'uuid';
import { ZodSchema, ZodError } from 'zod';

import {
  APIError,
  APIErrorCode,
  ErrorResponse,
  HTTPStatus,
  CorrelationId,
} from './types';

// ============================================================================
// Correlation ID Middleware
// ============================================================================

/**
 * Header name for correlation ID.
 */
export const CORRELATION_ID_HEADER = 'X-Correlation-ID';

/**
 * Extracts or generates a correlation ID from request headers.
 */
export function extractCorrelationId(headers: Record<string, string | undefined>): CorrelationId {
  const headerValue = headers[CORRELATION_ID_HEADER] ?? headers[CORRELATION_ID_HEADER.toLowerCase()];

  if (headerValue && isValidCorrelationId(headerValue)) {
    return headerValue;
  }

  return uuidv4();
}

/**
 * Validates a correlation ID format.
 */
function isValidCorrelationId(id: string): boolean {
  // Accept UUIDs or custom correlation IDs (alphanumeric with hyphens, max 64 chars)
  const pattern = /^[a-zA-Z0-9-]{1,64}$/;
  return pattern.test(id);
}

// ============================================================================
// Request Validation Middleware
// ============================================================================

/**
 * Result of request validation.
 */
export interface ValidationResult<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: APIError;
  readonly httpStatus?: HTTPStatus;
}

/**
 * Validates a request body against a Zod schema.
 */
export function validateRequestSchema<T>(
  body: unknown,
  schema: ZodSchema<T>
): ValidationResult<T> {
  try {
    const result = schema.safeParse(body);

    if (result.success) {
      return {
        success: true,
        data: result.data,
      };
    }

    return {
      success: false,
      error: zodErrorToAPIError(result.error),
      httpStatus: HTTPStatus.BAD_REQUEST,
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: APIErrorCode.INTERNAL_ERROR,
        message: 'Unexpected validation error',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      httpStatus: HTTPStatus.INTERNAL_SERVER_ERROR,
    };
  }
}

/**
 * Converts a Zod error to an API error.
 */
function zodErrorToAPIError(error: ZodError): APIError {
  const issues = error.issues.map(issue => ({
    path: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }));

  return {
    code: APIErrorCode.VALIDATION_ERROR,
    message: 'Request validation failed',
    details: {
      issues,
    },
    errors: issues.map(issue => ({
      code: APIErrorCode.INVALID_FIELD_VALUE,
      message: `${issue.path}: ${issue.message}`,
    })),
  };
}

/**
 * Validates that required fields are present.
 */
export function validateRequiredFields(
  body: Record<string, unknown>,
  requiredFields: readonly string[]
): ValidationResult<Record<string, unknown>> {
  const missingFields: string[] = [];

  for (const field of requiredFields) {
    if (!(field in body) || body[field] === undefined || body[field] === null) {
      missingFields.push(field);
    }
  }

  if (missingFields.length > 0) {
    return {
      success: false,
      error: {
        code: APIErrorCode.MISSING_REQUIRED_FIELD,
        message: `Missing required fields: ${missingFields.join(', ')}`,
        details: {
          missingFields,
        },
      },
      httpStatus: HTTPStatus.BAD_REQUEST,
    };
  }

  return {
    success: true,
    data: body,
  };
}

// ============================================================================
// Error Handler Middleware
// ============================================================================

/**
 * Error context for error handling.
 */
export interface ErrorContext {
  readonly correlationId: CorrelationId;
  readonly path: string;
  readonly method: string;
  readonly timestamp: string;
}

/**
 * Options for error handling.
 */
export interface ErrorHandlerOptions {
  /**
   * Whether to include stack traces in error responses.
   * Should be false in production.
   */
  readonly includeStackTrace: boolean;

  /**
   * Custom error logger function.
   */
  readonly logger?: (error: unknown, context: ErrorContext) => void;
}

/**
 * Default error handler options.
 */
export const DEFAULT_ERROR_HANDLER_OPTIONS: ErrorHandlerOptions = {
  includeStackTrace: false,
};

/**
 * Handles errors and produces standardized error responses.
 */
export function errorHandler(
  error: unknown,
  context: ErrorContext,
  options: ErrorHandlerOptions = DEFAULT_ERROR_HANDLER_OPTIONS
): { response: ErrorResponse; httpStatus: HTTPStatus } {
  // Log the error if logger provided
  if (options.logger) {
    options.logger(error, context);
  }

  // Determine error details
  const { apiError, httpStatus } = categorizeError(error, options.includeStackTrace);

  const response: ErrorResponse = {
    correlationId: context.correlationId,
    timestamp: context.timestamp,
    apiVersion: 'v1',
    error: apiError,
  };

  return { response, httpStatus };
}

/**
 * Categorizes an error and returns appropriate API error and HTTP status.
 */
function categorizeError(
  error: unknown,
  includeStackTrace: boolean
): { apiError: APIError; httpStatus: HTTPStatus } {
  // Handle known error types
  if (error instanceof ValidationError) {
    const apiError: APIError = {
      code: APIErrorCode.VALIDATION_ERROR,
      message: error.message,
    };
    if (error.details) {
      (apiError as { details: Record<string, unknown> }).details = error.details;
    }
    return {
      apiError,
      httpStatus: HTTPStatus.BAD_REQUEST,
    };
  }

  if (error instanceof NotFoundError) {
    const apiError: APIError = {
      code: APIErrorCode.RESOURCE_NOT_FOUND,
      message: error.message,
    };
    if (error.details) {
      (apiError as { details: Record<string, unknown> }).details = error.details;
    }
    return {
      apiError,
      httpStatus: HTTPStatus.NOT_FOUND,
    };
  }

  if (error instanceof CalculationError) {
    const apiError: APIError = {
      code: APIErrorCode.CALCULATION_ERROR,
      message: error.message,
    };
    if (error.details) {
      (apiError as { details: Record<string, unknown> }).details = error.details;
    }
    if (includeStackTrace && error.stack) {
      (apiError as { stack: string }).stack = error.stack;
    }
    return {
      apiError,
      httpStatus: HTTPStatus.INTERNAL_SERVER_ERROR,
    };
  }

  // Handle generic errors
  if (error instanceof Error) {
    const apiError: APIError = {
      code: APIErrorCode.INTERNAL_ERROR,
      message: error.message,
    };
    if (includeStackTrace && error.stack) {
      (apiError as { stack: string }).stack = error.stack;
    }
    return {
      apiError,
      httpStatus: HTTPStatus.INTERNAL_SERVER_ERROR,
    };
  }

  // Handle unknown errors
  return {
    apiError: {
      code: APIErrorCode.INTERNAL_ERROR,
      message: 'An unexpected error occurred',
    },
    httpStatus: HTTPStatus.INTERNAL_SERVER_ERROR,
  };
}

// ============================================================================
// Custom Error Classes
// ============================================================================

/**
 * Base API error class.
 */
export class APIException extends Error {
  readonly code: APIErrorCode;
  readonly httpStatus: HTTPStatus;
  readonly details?: Record<string, unknown>;

  constructor(
    code: APIErrorCode,
    message: string,
    httpStatus: HTTPStatus,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'APIException';
    this.code = code;
    this.httpStatus = httpStatus;
    if (details) {
      this.details = details;
    }
  }
}

/**
 * Validation error.
 */
export class ValidationError extends APIException {
  constructor(message: string, details?: Record<string, unknown>) {
    super(APIErrorCode.VALIDATION_ERROR, message, HTTPStatus.BAD_REQUEST, details);
    this.name = 'ValidationError';
  }
}

/**
 * Resource not found error.
 */
export class NotFoundError extends APIException {
  constructor(resourceType: string, resourceId: string) {
    super(
      APIErrorCode.RESOURCE_NOT_FOUND,
      `${resourceType} not found: ${resourceId}`,
      HTTPStatus.NOT_FOUND,
      { resourceType, resourceId }
    );
    this.name = 'NotFoundError';
  }
}

/**
 * Calculation error.
 */
export class CalculationError extends APIException {
  constructor(message: string, details?: Record<string, unknown>) {
    super(
      APIErrorCode.CALCULATION_ERROR,
      message,
      HTTPStatus.INTERNAL_SERVER_ERROR,
      details
    );
    this.name = 'CalculationError';
  }
}

// ============================================================================
// Request Logger Middleware
// ============================================================================

/**
 * Log entry for a request.
 */
export interface RequestLogEntry {
  readonly correlationId: CorrelationId;
  readonly method: string;
  readonly path: string;
  readonly timestamp: string;
  readonly durationMs?: number;
  readonly statusCode?: number;
  readonly requestBody?: unknown;
  readonly responseBody?: unknown;
  readonly error?: string;
  readonly userAgent?: string;
  readonly ip?: string;
}

/**
 * Logger interface for request logging.
 */
export interface RequestLogger {
  log(entry: RequestLogEntry): void;
  error(entry: RequestLogEntry): void;
}

/**
 * Console-based request logger for development.
 */
export class ConsoleRequestLogger implements RequestLogger {
  log(entry: RequestLogEntry): void {
    console.log(JSON.stringify({
      level: 'info',
      ...entry,
    }));
  }

  error(entry: RequestLogEntry): void {
    console.error(JSON.stringify({
      level: 'error',
      ...entry,
    }));
  }
}

/**
 * Configuration for request logging.
 */
export interface RequestLoggerConfig {
  /**
   * Whether to log request bodies.
   */
  readonly logRequestBody: boolean;

  /**
   * Whether to log response bodies.
   */
  readonly logResponseBody: boolean;

  /**
   * Maximum body size to log (in bytes).
   */
  readonly maxBodySize: number;

  /**
   * Fields to redact from logs.
   */
  readonly redactFields: readonly string[];
}

/**
 * Default request logger configuration.
 */
export const DEFAULT_REQUEST_LOGGER_CONFIG: RequestLoggerConfig = {
  logRequestBody: false,
  logResponseBody: false,
  maxBodySize: 10000,
  redactFields: ['password', 'token', 'secret', 'apiKey', 'authorization'],
};

/**
 * Creates a request log entry.
 */
export function createRequestLogEntry(
  correlationId: CorrelationId,
  method: string,
  path: string,
  options?: {
    statusCode?: number;
    durationMs?: number;
    requestBody?: unknown;
    responseBody?: unknown;
    error?: string;
    userAgent?: string;
    ip?: string;
  }
): RequestLogEntry {
  return {
    correlationId,
    method,
    path,
    timestamp: new Date().toISOString(),
    ...options,
  };
}

/**
 * Redacts sensitive fields from an object.
 */
export function redactSensitiveFields(
  obj: unknown,
  fieldsToRedact: readonly string[] = DEFAULT_REQUEST_LOGGER_CONFIG.redactFields
): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => redactSensitiveFields(item, fieldsToRedact));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (fieldsToRedact.includes(key.toLowerCase())) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      result[key] = redactSensitiveFields(value, fieldsToRedact);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Logs a request with timing.
 */
export function requestLogger(
  correlationId: CorrelationId,
  method: string,
  path: string,
  logger: RequestLogger,
  config: RequestLoggerConfig = DEFAULT_REQUEST_LOGGER_CONFIG
): {
  logStart: (requestBody?: unknown) => void;
  logEnd: (statusCode: number, responseBody?: unknown, durationMs?: number) => void;
  logError: (error: Error, durationMs?: number) => void;
} {
  const startTime = Date.now();

  return {
    logStart(requestBody?: unknown) {
      const entry = createRequestLogEntry(correlationId, method, path, {
        requestBody: config.logRequestBody
          ? redactSensitiveFields(requestBody, config.redactFields)
          : undefined,
      });
      logger.log(entry);
    },

    logEnd(statusCode: number, responseBody?: unknown, durationMs?: number) {
      const entry = createRequestLogEntry(correlationId, method, path, {
        statusCode,
        durationMs: durationMs ?? Date.now() - startTime,
        responseBody: config.logResponseBody
          ? redactSensitiveFields(responseBody, config.redactFields)
          : undefined,
      });
      logger.log(entry);
    },

    logError(error: Error, durationMs?: number) {
      const entry = createRequestLogEntry(correlationId, method, path, {
        durationMs: durationMs ?? Date.now() - startTime,
        error: error.message,
      });
      logger.error(entry);
    },
  };
}

// ============================================================================
// Content Type Middleware
// ============================================================================

/**
 * Validates the Content-Type header.
 */
export function validateContentType(
  contentType: string | undefined,
  allowedTypes: readonly string[] = ['application/json']
): ValidationResult<string> {
  if (!contentType) {
    return {
      success: false,
      error: {
        code: APIErrorCode.INVALID_REQUEST,
        message: 'Content-Type header is required',
      },
      httpStatus: HTTPStatus.BAD_REQUEST,
    };
  }

  // Extract media type without parameters
  const mediaType = contentType.split(';')[0]?.trim().toLowerCase() ?? '';

  if (!allowedTypes.includes(mediaType)) {
    return {
      success: false,
      error: {
        code: APIErrorCode.INVALID_REQUEST,
        message: `Unsupported Content-Type: ${mediaType}. Allowed: ${allowedTypes.join(', ')}`,
      },
      httpStatus: HTTPStatus.BAD_REQUEST,
    };
  }

  return {
    success: true,
    data: mediaType,
  };
}

// ============================================================================
// Rate Limiting Types (for framework integration)
// ============================================================================

/**
 * Rate limit configuration.
 */
export interface RateLimitConfig {
  /**
   * Maximum requests per window.
   */
  readonly maxRequests: number;

  /**
   * Window size in milliseconds.
   */
  readonly windowMs: number;

  /**
   * Key generator for rate limiting (e.g., by IP, API key).
   */
  readonly keyGenerator?: (request: { ip?: string; headers: Record<string, string> }) => string;
}

/**
 * Default rate limit configuration.
 */
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  maxRequests: 100,
  windowMs: 60000, // 1 minute
};

/**
 * Rate limit result.
 */
export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetAt: number;
  readonly retryAfter?: number;
}
