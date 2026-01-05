/**
 * Event Sourcing Type Definitions for Enterprise ROI Engine
 *
 * Implements immutable event types for audit trails and reproducibility
 * as specified in SPARC specification sections 4.1, 4.2, and 4.3.
 *
 * All events are immutable once created and support cryptographic chaining
 * for tamper detection.
 */

/**
 * Unique identifier for events, following UUID v4 format
 */
export type EventId = string;

/**
 * Correlation ID to link related events across the pipeline
 */
export type CorrelationId = string;

/**
 * ISO 8601 timestamp string
 */
export type ISO8601Timestamp = string;

/**
 * Event version for schema evolution
 */
export type EventVersion = number;

/**
 * Hash of the previous event in the chain for integrity verification
 */
export type PreviousEventHash = string | null;

/**
 * Enumeration of all event types in the ROI Engine pipeline
 */
export enum EventType {
  // Ingestion events
  INGESTION_STARTED = 'INGESTION_STARTED',
  INGESTION_COMPLETED = 'INGESTION_COMPLETED',
  INGESTION_FAILED = 'INGESTION_FAILED',

  // Normalization events
  NORMALIZATION_STARTED = 'NORMALIZATION_STARTED',
  NORMALIZATION_COMPLETED = 'NORMALIZATION_COMPLETED',

  // Attribution events
  ATTRIBUTION_STARTED = 'ATTRIBUTION_STARTED',
  ATTRIBUTION_COMPLETED = 'ATTRIBUTION_COMPLETED',

  // Calculation events
  CALCULATION_STARTED = 'CALCULATION_STARTED',
  CALCULATION_COMPLETED = 'CALCULATION_COMPLETED',

  // Export events
  EXPORT_STARTED = 'EXPORT_STARTED',
  EXPORT_COMPLETED = 'EXPORT_COMPLETED',

  // Validation events
  VALIDATION = 'VALIDATION',

  // Error events
  ERROR = 'ERROR',
}

/**
 * Base event interface that all events must implement.
 * Provides the foundation for immutable audit trails.
 *
 * @property id - Unique identifier for this event (UUID v4)
 * @property timestamp - ISO 8601 timestamp when the event was created
 * @property type - The type of event from EventType enum
 * @property correlationId - Links related events across the pipeline
 * @property version - Schema version for backward compatibility
 * @property previousEventHash - Hash of the previous event for chain integrity
 */
export interface BaseEvent {
  readonly id: EventId;
  readonly timestamp: ISO8601Timestamp;
  readonly type: EventType;
  readonly correlationId: CorrelationId;
  readonly version: EventVersion;
  readonly previousEventHash: PreviousEventHash;
}

/**
 * Data source types for ingestion events
 */
export enum DataSourceType {
  SIMULATION_ENGINE = 'SIMULATION_ENGINE',
  ERP_SURFACE = 'ERP_SURFACE',
  COST_OPS = 'COST_OPS',
}

/**
 * Event emitted when data ingestion begins
 */
export interface IngestionStartedEvent extends BaseEvent {
  readonly type: EventType.INGESTION_STARTED;
  readonly payload: {
    readonly sourceType: DataSourceType;
    readonly sourceEndpoint: string;
    readonly expectedRecordCount?: number;
  };
}

/**
 * Event emitted when data ingestion completes successfully
 */
export interface IngestionCompletedEvent extends BaseEvent {
  readonly type: EventType.INGESTION_COMPLETED;
  readonly payload: {
    readonly sourceType: DataSourceType;
    readonly recordCount: number;
    readonly checksum: string;
    readonly durationMs: number;
    readonly ingestionId: string;
  };
}

/**
 * Event emitted when data ingestion fails
 */
export interface IngestionFailedEvent extends BaseEvent {
  readonly type: EventType.INGESTION_FAILED;
  readonly payload: {
    readonly sourceType: DataSourceType;
    readonly errorCode: string;
    readonly errorMessage: string;
    readonly retryable: boolean;
    readonly attemptNumber: number;
  };
}

/**
 * Event emitted when normalization begins
 */
export interface NormalizationStartedEvent extends BaseEvent {
  readonly type: EventType.NORMALIZATION_STARTED;
  readonly payload: {
    readonly ingestionId: string;
    readonly recordCount: number;
    readonly targetCurrency: string;
  };
}

/**
 * Event emitted when normalization completes
 */
export interface NormalizationCompletedEvent extends BaseEvent {
  readonly type: EventType.NORMALIZATION_COMPLETED;
  readonly payload: {
    readonly normalizationId: string;
    readonly inputRecordCount: number;
    readonly outputRecordCount: number;
    readonly deduplicatedCount: number;
    readonly durationMs: number;
    readonly checksum: string;
  };
}

/**
 * Event emitted when attribution begins
 */
export interface AttributionStartedEvent extends BaseEvent {
  readonly type: EventType.ATTRIBUTION_STARTED;
  readonly payload: {
    readonly normalizationId: string;
    readonly decisionCount: number;
    readonly costCenterCount: number;
  };
}

/**
 * Event emitted when attribution completes
 */
export interface AttributionCompletedEvent extends BaseEvent {
  readonly type: EventType.ATTRIBUTION_COMPLETED;
  readonly payload: {
    readonly attributionId: string;
    readonly attributionChainCount: number;
    readonly totalAttributedValue: number;
    readonly currency: string;
    readonly durationMs: number;
    readonly checksum: string;
  };
}

/**
 * Event emitted when financial calculations begin
 */
export interface CalculationStartedEvent extends BaseEvent {
  readonly type: EventType.CALCULATION_STARTED;
  readonly payload: {
    readonly attributionId: string;
    readonly calculationType: 'NPV' | 'IRR' | 'PAYBACK' | 'SENSITIVITY' | 'FULL';
    readonly discountRate?: number;
    readonly horizonMonths: number;
  };
}

/**
 * Event emitted when financial calculations complete
 */
export interface CalculationCompletedEvent extends BaseEvent {
  readonly type: EventType.CALCULATION_COMPLETED;
  readonly payload: {
    readonly calculationId: string;
    readonly npv?: number;
    readonly irr?: number;
    readonly paybackMonths?: number;
    readonly totalSavings: number;
    readonly riskAdjustedSavings: number;
    readonly currency: string;
    readonly confidenceLevel: number;
    readonly durationMs: number;
    readonly checksum: string;
  };
}

/**
 * Event emitted when export begins
 */
export interface ExportStartedEvent extends BaseEvent {
  readonly type: EventType.EXPORT_STARTED;
  readonly payload: {
    readonly calculationId: string;
    readonly exportFormat: 'JSON' | 'PDF' | 'EXCEL' | 'CSV';
    readonly targetSystem?: string;
  };
}

/**
 * Event emitted when export completes
 */
export interface ExportCompletedEvent extends BaseEvent {
  readonly type: EventType.EXPORT_COMPLETED;
  readonly payload: {
    readonly artifactId: string;
    readonly exportFormat: 'JSON' | 'PDF' | 'EXCEL' | 'CSV';
    readonly artifactSizeBytes: number;
    readonly artifactChecksum: string;
    readonly durationMs: number;
  };
}

/**
 * Validation severity levels
 */
export enum ValidationSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL',
}

/**
 * Event emitted for validation results during any phase
 */
export interface ValidationEvent extends BaseEvent {
  readonly type: EventType.VALIDATION;
  readonly payload: {
    readonly phase: 'INGESTION' | 'NORMALIZATION' | 'ATTRIBUTION' | 'CALCULATION' | 'EXPORT';
    readonly validationType: string;
    readonly severity: ValidationSeverity;
    readonly field?: string;
    readonly message: string;
    readonly expectedValue?: unknown;
    readonly actualValue?: unknown;
    readonly passed: boolean;
  };
}

/**
 * Error categories for classification
 */
export enum ErrorCategory {
  SCHEMA_VALIDATION = 'SCHEMA_VALIDATION',
  DATA_INTEGRITY = 'DATA_INTEGRITY',
  CALCULATION = 'CALCULATION',
  SYSTEM = 'SYSTEM',
  NETWORK = 'NETWORK',
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  RATE_LIMIT = 'RATE_LIMIT',
  TIMEOUT = 'TIMEOUT',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Event emitted when an error occurs anywhere in the pipeline
 */
export interface ErrorEvent extends BaseEvent {
  readonly type: EventType.ERROR;
  readonly payload: {
    readonly category: ErrorCategory;
    readonly code: string;
    readonly message: string;
    readonly phase: 'INGESTION' | 'NORMALIZATION' | 'ATTRIBUTION' | 'CALCULATION' | 'EXPORT';
    readonly stackTrace?: string;
    readonly recoverable: boolean;
    readonly metadata?: Record<string, unknown>;
  };
}

/**
 * Union type of all possible events in the system
 */
export type ROIEngineEvent =
  | IngestionStartedEvent
  | IngestionCompletedEvent
  | IngestionFailedEvent
  | NormalizationStartedEvent
  | NormalizationCompletedEvent
  | AttributionStartedEvent
  | AttributionCompletedEvent
  | CalculationStartedEvent
  | CalculationCompletedEvent
  | ExportStartedEvent
  | ExportCompletedEvent
  | ValidationEvent
  | ErrorEvent;

/**
 * Type guard functions for event type narrowing
 */
export function isIngestionStartedEvent(event: BaseEvent): event is IngestionStartedEvent {
  return event.type === EventType.INGESTION_STARTED;
}

export function isIngestionCompletedEvent(event: BaseEvent): event is IngestionCompletedEvent {
  return event.type === EventType.INGESTION_COMPLETED;
}

export function isIngestionFailedEvent(event: BaseEvent): event is IngestionFailedEvent {
  return event.type === EventType.INGESTION_FAILED;
}

export function isNormalizationStartedEvent(event: BaseEvent): event is NormalizationStartedEvent {
  return event.type === EventType.NORMALIZATION_STARTED;
}

export function isNormalizationCompletedEvent(
  event: BaseEvent
): event is NormalizationCompletedEvent {
  return event.type === EventType.NORMALIZATION_COMPLETED;
}

export function isAttributionStartedEvent(event: BaseEvent): event is AttributionStartedEvent {
  return event.type === EventType.ATTRIBUTION_STARTED;
}

export function isAttributionCompletedEvent(event: BaseEvent): event is AttributionCompletedEvent {
  return event.type === EventType.ATTRIBUTION_COMPLETED;
}

export function isCalculationStartedEvent(event: BaseEvent): event is CalculationStartedEvent {
  return event.type === EventType.CALCULATION_STARTED;
}

export function isCalculationCompletedEvent(event: BaseEvent): event is CalculationCompletedEvent {
  return event.type === EventType.CALCULATION_COMPLETED;
}

export function isExportStartedEvent(event: BaseEvent): event is ExportStartedEvent {
  return event.type === EventType.EXPORT_STARTED;
}

export function isExportCompletedEvent(event: BaseEvent): event is ExportCompletedEvent {
  return event.type === EventType.EXPORT_COMPLETED;
}

export function isValidationEvent(event: BaseEvent): event is ValidationEvent {
  return event.type === EventType.VALIDATION;
}

export function isErrorEvent(event: BaseEvent): event is ErrorEvent {
  return event.type === EventType.ERROR;
}

/**
 * Event metadata for audit trail purposes
 */
export interface EventMetadata {
  readonly actorId?: string;
  readonly actorType?: 'USER' | 'SYSTEM' | 'SERVICE';
  readonly sourceIp?: string;
  readonly sessionId?: string;
  readonly traceId?: string;
  readonly spanId?: string;
}

/**
 * Event with metadata for enhanced audit capabilities
 */
export interface AuditableEvent<T extends BaseEvent = BaseEvent> {
  readonly event: T;
  readonly metadata: EventMetadata;
  readonly receivedAt: ISO8601Timestamp;
  readonly processedAt?: ISO8601Timestamp;
}

/**
 * Event creation options
 */
export interface CreateEventOptions {
  readonly correlationId: CorrelationId;
  readonly previousEventHash?: PreviousEventHash;
  readonly version?: EventVersion;
}

/**
 * Default event version
 */
export const DEFAULT_EVENT_VERSION: EventVersion = 1;
