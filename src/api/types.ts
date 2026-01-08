/**
 * API Types
 * Type definitions for the Enterprise ROI Engine REST API.
 * Framework-agnostic request/response types.
 */

import {
  SimulationOutput,
  ERPMetadata,
  CostBaseline,
  ArtifactBundle,
  ExecutionStatus,
  ValidationStatus,
  FinancialArtifact,
  GovernancePayload,
  ExecutionProof,
} from '../contracts';

// ============================================================================
// Common Types
// ============================================================================

/**
 * Correlation ID for request tracing across services.
 */
export type CorrelationId = string;

/**
 * API version identifier.
 */
export type APIVersion = 'v1';

/**
 * Supported content types.
 */
export type ContentType = 'application/json';

// ============================================================================
// Request Types
// ============================================================================

/**
 * Base interface for all API requests.
 */
export interface APIRequest {
  /**
   * Correlation ID for distributed tracing.
   * If not provided, the API will generate one.
   */
  readonly correlationId?: CorrelationId;
}

/**
 * Request body for the /calculate endpoint.
 * Contains all inputs needed for ROI calculation.
 */
export interface ROIEngineRequest extends APIRequest {
  /**
   * Simulation output from the Agentics simulation engine.
   */
  readonly simulation: SimulationOutput;

  /**
   * ERP metadata from erp-surface.
   */
  readonly erpMetadata: ERPMetadata;

  /**
   * Cost baseline from CostOps.
   */
  readonly costBaseline: CostBaseline;

  /**
   * Optional calculation parameters to override defaults.
   */
  readonly options?: CalculationOptions;
}

/**
 * Optional parameters for ROI calculation.
 */
export interface CalculationOptions {
  /**
   * Override the discount rate from cost baseline.
   * Value between 0 and 1.
   */
  readonly discountRateOverride?: number;

  /**
   * Default time horizon in months if not specified per decision.
   */
  readonly defaultHorizonMonths?: number;

  /**
   * Whether to include sensitivity analysis in the output.
   * Default: true
   */
  readonly includeSensitivity?: boolean;

  /**
   * Confidence levels to calculate (e.g., [50, 75, 90, 95]).
   */
  readonly confidenceLevels?: readonly number[];

  /**
   * Risk tolerance level for governance flags.
   */
  readonly riskToleranceLevel?: 'LOW' | 'MODERATE' | 'HIGH';

  /**
   * Whether to perform strict schema validation.
   * Default: true
   */
  readonly strictValidation?: boolean;
}

/**
 * Request body for the /validate endpoint.
 * Validates inputs without performing calculation.
 */
export interface ValidationRequest extends APIRequest {
  /**
   * Simulation output to validate.
   */
  readonly simulation?: SimulationOutput;

  /**
   * ERP metadata to validate.
   */
  readonly erpMetadata?: ERPMetadata;

  /**
   * Cost baseline to validate.
   */
  readonly costBaseline?: CostBaseline;

  /**
   * Whether to perform cross-validation between inputs.
   * Default: true
   */
  readonly crossValidate?: boolean;
}

// ============================================================================
// Response Types
// ============================================================================

/**
 * Base interface for all API responses.
 */
export interface APIResponse {
  /**
   * Correlation ID for distributed tracing.
   */
  readonly correlationId: CorrelationId;

  /**
   * ISO8601 timestamp of response generation.
   */
  readonly timestamp: string;

  /**
   * API version.
   */
  readonly apiVersion: APIVersion;
}

/**
 * Response from the /calculate endpoint.
 */
export interface ROIEngineResponse extends APIResponse {
  /**
   * Execution status of the calculation.
   */
  readonly status: ExecutionStatus;

  /**
   * The complete artifact bundle containing all outputs.
   * Present when status is SUCCESS.
   */
  readonly artifactBundle?: ArtifactBundle;

  /**
   * The primary financial artifact (convenience accessor).
   * Present when status is SUCCESS.
   */
  readonly financialArtifact?: FinancialArtifact;

  /**
   * Governance payload with compliance information.
   * Present when status is SUCCESS.
   */
  readonly governance?: GovernancePayload;

  /**
   * Execution metrics.
   */
  readonly metrics?: ExecutionMetrics;

  /**
   * Error details if status is FAILED.
   */
  readonly error?: APIError;

  /**
   * Warnings that occurred during processing.
   */
  readonly warnings?: readonly string[];

  /**
   * Execution proof demonstrating platform participation.
   * Required for all responses to comply with contract enforcement.
   */
  readonly executionProof?: ExecutionProof;
}

/**
 * Execution metrics for the calculation.
 */
export interface ExecutionMetrics {
  /**
   * Number of decisions processed.
   */
  readonly decisionsProcessed: number;

  /**
   * Total identified savings (decimal string).
   */
  readonly totalSavingsIdentified: string;

  /**
   * Execution duration in milliseconds.
   */
  readonly executionDurationMs: number;

  /**
   * Processing phases completed.
   */
  readonly phasesCompleted: number;

  /**
   * Breakdown by phase.
   */
  readonly phaseBreakdown?: {
    readonly ingestionMs: number;
    readonly normalizationMs: number;
    readonly attributionMs: number;
    readonly calculationMs: number;
    readonly exportMs: number;
  };
}

/**
 * Response from the /validate endpoint.
 */
export interface ValidationResponse extends APIResponse {
  /**
   * Overall validation status.
   */
  readonly status: ValidationStatus;

  /**
   * Whether all validations passed.
   */
  readonly valid: boolean;

  /**
   * Validation results by input type.
   */
  readonly results: {
    readonly simulation?: InputValidationResult;
    readonly erpMetadata?: InputValidationResult;
    readonly costBaseline?: InputValidationResult;
    readonly crossValidation?: CrossValidationResult;
  };

  /**
   * Summary of validation issues.
   */
  readonly summary: ValidationSummary;

  /**
   * Execution proof demonstrating platform participation.
   */
  readonly executionProof?: ExecutionProof;
}

/**
 * Validation result for a single input.
 */
export interface InputValidationResult {
  /**
   * Whether this input is valid.
   */
  readonly valid: boolean;

  /**
   * Validation errors.
   */
  readonly errors: readonly ValidationIssue[];

  /**
   * Validation warnings.
   */
  readonly warnings: readonly ValidationIssue[];

  /**
   * Schema version used for validation.
   */
  readonly schemaVersion: string;
}

/**
 * Cross-validation result between inputs.
 */
export interface CrossValidationResult {
  /**
   * Whether cross-validation passed.
   */
  readonly valid: boolean;

  /**
   * Cross-validation issues.
   */
  readonly issues: readonly CrossValidationIssue[];
}

/**
 * A single validation issue.
 */
export interface ValidationIssue {
  /**
   * Field or path where the issue was found.
   */
  readonly path: string;

  /**
   * Issue message.
   */
  readonly message: string;

  /**
   * Issue code for programmatic handling.
   */
  readonly code: string;

  /**
   * Severity of the issue.
   */
  readonly severity: 'error' | 'warning';
}

/**
 * A cross-validation issue between inputs.
 */
export interface CrossValidationIssue {
  /**
   * Source input type.
   */
  readonly sourceInput: 'simulation' | 'erpMetadata' | 'costBaseline';

  /**
   * Target input type.
   */
  readonly targetInput: 'simulation' | 'erpMetadata' | 'costBaseline';

  /**
   * Issue message.
   */
  readonly message: string;

  /**
   * Issue code.
   */
  readonly code: string;
}

/**
 * Summary of all validation issues.
 */
export interface ValidationSummary {
  /**
   * Total number of errors.
   */
  readonly errorCount: number;

  /**
   * Total number of warnings.
   */
  readonly warningCount: number;

  /**
   * Whether all inputs are valid.
   */
  readonly allValid: boolean;

  /**
   * Which inputs were validated.
   */
  readonly inputsValidated: readonly string[];
}

/**
 * Response from the /health endpoint.
 */
export interface HealthCheckResponse {
  /**
   * Overall health status.
   */
  readonly status: 'healthy' | 'degraded' | 'unhealthy';

  /**
   * Engine version.
   */
  readonly version: string;

  /**
   * ISO8601 timestamp of the check.
   */
  readonly timestamp: string;

  /**
   * Uptime in milliseconds.
   */
  readonly uptimeMs: number;

  /**
   * Component health checks.
   */
  readonly components: {
    readonly engine: ComponentHealth;
    readonly validation: ComponentHealth;
  };

  /**
   * Build information.
   */
  readonly build?: {
    readonly commitHash?: string;
    readonly buildTime?: string;
    readonly contractSchemaId?: string;
    readonly contractSchemaVersion?: string;
  };
}

/**
 * Health status of a component.
 */
export interface ComponentHealth {
  /**
   * Component status.
   */
  readonly status: 'healthy' | 'degraded' | 'unhealthy';

  /**
   * Optional status message.
   */
  readonly message?: string;

  /**
   * Last check timestamp.
   */
  readonly lastCheck?: string;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * API error response.
 */
export interface APIError {
  /**
   * Error code for programmatic handling.
   */
  readonly code: string;

  /**
   * Human-readable error message.
   */
  readonly message: string;

  /**
   * Additional error details.
   */
  readonly details?: Record<string, unknown>;

  /**
   * Stack trace (only in development).
   */
  readonly stack?: string;

  /**
   * Nested errors if applicable.
   */
  readonly errors?: readonly APIError[];
}

/**
 * Standard error response wrapper.
 */
export interface ErrorResponse extends APIResponse {
  /**
   * The error information.
   */
  readonly error: APIError;
}

// ============================================================================
// Error Codes
// ============================================================================

/**
 * Standard error codes for the API.
 */
export enum APIErrorCode {
  // Validation errors (4xx)
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_REQUEST = 'INVALID_REQUEST',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  INVALID_FIELD_VALUE = 'INVALID_FIELD_VALUE',
  SCHEMA_VALIDATION_FAILED = 'SCHEMA_VALIDATION_FAILED',
  CROSS_VALIDATION_FAILED = 'CROSS_VALIDATION_FAILED',

  // Resource errors (4xx)
  ARTIFACT_NOT_FOUND = 'ARTIFACT_NOT_FOUND',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',

  // Processing errors (5xx)
  CALCULATION_ERROR = 'CALCULATION_ERROR',
  INGESTION_ERROR = 'INGESTION_ERROR',
  NORMALIZATION_ERROR = 'NORMALIZATION_ERROR',
  ATTRIBUTION_ERROR = 'ATTRIBUTION_ERROR',
  EXPORT_ERROR = 'EXPORT_ERROR',

  // System errors (5xx)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
}

// ============================================================================
// HTTP Status Codes
// ============================================================================

/**
 * HTTP status codes used by the API.
 */
export enum HTTPStatus {
  OK = 200,
  CREATED = 201,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  UNPROCESSABLE_ENTITY = 422,
  TOO_MANY_REQUESTS = 429,
  INTERNAL_SERVER_ERROR = 500,
  SERVICE_UNAVAILABLE = 503,
}
