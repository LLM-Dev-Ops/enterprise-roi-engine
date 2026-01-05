/**
 * API Layer Exports
 * Central export point for all API components.
 *
 * The API layer provides a framework-agnostic interface for the Enterprise ROI Engine.
 * It can be adapted to Express, Fastify, Koa, or any other HTTP framework.
 */

// ============================================================================
// Types
// ============================================================================

export type {
  // Common types
  CorrelationId,
  APIVersion,
  ContentType,

  // Request types
  APIRequest,
  ROIEngineRequest,
  CalculationOptions,
  ValidationRequest,

  // Response types
  APIResponse,
  ROIEngineResponse,
  ExecutionMetrics,
  ValidationResponse,
  InputValidationResult,
  CrossValidationResult,
  ValidationIssue,
  CrossValidationIssue,
  ValidationSummary,
  HealthCheckResponse,
  ComponentHealth,

  // Error types
  APIError,
  ErrorResponse,
} from './types';

export {
  APIErrorCode,
  HTTPStatus,
} from './types';

// ============================================================================
// Handlers
// ============================================================================

export {
  // Handler functions
  handleCalculateROI,
  handleValidateInput,
  handleHealthCheck,
  handleGetArtifact,

  // Handler configuration
  type HandlerConfig,
  DEFAULT_HANDLER_CONFIG,

  // Handler context
  type HandlerContext,
  createHandlerContext,

  // Artifact storage
  type ArtifactStore,
  InMemoryArtifactStore,
} from './handlers';

// ============================================================================
// Middleware
// ============================================================================

export {
  // Correlation ID
  CORRELATION_ID_HEADER,
  extractCorrelationId,

  // Request validation
  validateRequestSchema,
  validateRequiredFields,
  type ValidationResult,

  // Error handling
  errorHandler,
  type ErrorContext,
  type ErrorHandlerOptions,
  DEFAULT_ERROR_HANDLER_OPTIONS,

  // Custom errors
  APIException,
  ValidationError,
  NotFoundError,
  CalculationError,

  // Request logging
  type RequestLogEntry,
  type RequestLogger,
  ConsoleRequestLogger,
  type RequestLoggerConfig,
  DEFAULT_REQUEST_LOGGER_CONFIG,
  createRequestLogEntry,
  redactSensitiveFields,
  requestLogger,

  // Content type validation
  validateContentType,

  // Rate limiting types
  type RateLimitConfig,
  DEFAULT_RATE_LIMIT_CONFIG,
  type RateLimitResult,
} from './middleware';

// ============================================================================
// Routes
// ============================================================================

export {
  // Route definitions
  ROUTE_DEFINITIONS,
  type RouteDefinition,
  type HTTPMethod,

  // Generic request/response
  type GenericRequest,
  type GenericResponse,
  type RouteHandler,

  // Route handlers
  calculateHandler,
  validateHandler,
  healthHandler,
  getArtifactHandler,

  // Router
  Router,
  createRouter,
} from './routes';

// ============================================================================
// OpenAPI
// ============================================================================

export {
  openApiSpec,
  type OpenAPISpec,
  getOpenAPISpec,
  getOpenAPISpecJSON,
} from './openapi';
