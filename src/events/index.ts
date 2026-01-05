/**
 * Event Sourcing Infrastructure for Enterprise ROI Engine
 *
 * This module provides a complete event sourcing implementation supporting:
 * - Immutable event logs for audit trails
 * - Cryptographic chaining for tamper detection
 * - Event replay for reproducibility
 * - Typed event handling
 *
 * Per SPARC specification requirements:
 * - Section 4.1: Audit Trail Requirements
 * - Section 4.2: Reproducibility Requirements
 * - Section 4.3: Confidence Interval Requirements
 * - Section 4.4: Source Attribution Requirements
 *
 * @module events
 */

// =============================================================================
// Type Exports
// =============================================================================

export {
  // Core types
  EventId,
  CorrelationId,
  ISO8601Timestamp,
  EventVersion,
  PreviousEventHash,
  EventType,
  BaseEvent,
  // Data source types
  DataSourceType,
  // Pipeline events
  IngestionStartedEvent,
  IngestionCompletedEvent,
  IngestionFailedEvent,
  NormalizationStartedEvent,
  NormalizationCompletedEvent,
  AttributionStartedEvent,
  AttributionCompletedEvent,
  CalculationStartedEvent,
  CalculationCompletedEvent,
  ExportStartedEvent,
  ExportCompletedEvent,
  // Validation and error events
  ValidationSeverity,
  ValidationEvent,
  ErrorCategory,
  ErrorEvent,
  // Union type
  ROIEngineEvent,
  // Type guards
  isIngestionStartedEvent,
  isIngestionCompletedEvent,
  isIngestionFailedEvent,
  isNormalizationStartedEvent,
  isNormalizationCompletedEvent,
  isAttributionStartedEvent,
  isAttributionCompletedEvent,
  isCalculationStartedEvent,
  isCalculationCompletedEvent,
  isExportStartedEvent,
  isExportCompletedEvent,
  isValidationEvent,
  isErrorEvent,
  // Metadata types
  EventMetadata,
  AuditableEvent,
  CreateEventOptions,
  // Constants
  DEFAULT_EVENT_VERSION,
} from './types';

// =============================================================================
// Event Store Exports
// =============================================================================

export {
  // Interface
  EventStore,
  // Implementation
  InMemoryEventStore,
  // Utilities
  computeEventHash,
  ChainVerificationResult,
  EventStoreSnapshot,
  createEventStoreSnapshot,
  restoreFromSnapshot,
} from './EventStore';

// =============================================================================
// Event Emitter Exports
// =============================================================================

export {
  // Handler types
  EventHandler,
  HandlerOptions,
  // Result types
  EmitResult,
  EmitOptions,
  // Classes
  EventEmitter,
  TypedEventEmitter,
  EventBus,
} from './EventEmitter';

// =============================================================================
// Event Replay Exports
// =============================================================================

export {
  // Enums
  ReplayMode,
  AnomalyType,
  // Option types
  ReplayOptions,
  ReplayProgress,
  // Result types
  ReplayResult,
  ReplayError,
  EventAnomaly,
  // Pattern types
  EventSequencePattern,
  ROI_ENGINE_PATTERNS,
  // Classes
  ReplayEngine,
  DeterministicReplayEngine,
} from './EventReplay';

// =============================================================================
// Event Serializer Exports
// =============================================================================

export {
  // Types
  SerializedEvent,
  SerializationOptions,
  DeserializationOptions,
  DeserializationResult,
  EventFactory,
  // Functions
  toJSON,
  fromJSON,
  computeEventHash as hashEvent,
  serializeWithChain,
  deserializeWithChain,
  signEvent,
  verifyEventSignature,
  generateEventId,
  generateTimestamp,
  serializeBatch,
  deserializeBatch,
  computeMerkleRoot,
  // Classes
  ChainedEventFactory,
} from './EventSerializer';

// =============================================================================
// Convenience Factory Functions
// =============================================================================

import { InMemoryEventStore, EventStore } from './EventStore';
import { EventEmitter, EventBus } from './EventEmitter';
import { ReplayEngine } from './EventReplay';
import { ChainedEventFactory } from './EventSerializer';

/**
 * Creates a complete event sourcing system with all components wired together.
 *
 * @param options - Configuration options
 * @returns Object containing all event infrastructure components
 */
export function createEventSystem(options: { validateChain?: boolean } = {}): {
  store: EventStore;
  emitter: EventEmitter;
  replayEngine: ReplayEngine;
  factory: ChainedEventFactory;
} {
  const store = new InMemoryEventStore(options.validateChain ?? true);
  const emitter = new EventEmitter(store);
  const replayEngine = new ReplayEngine(store, emitter);
  const factory = new ChainedEventFactory();

  return {
    store,
    emitter,
    replayEngine,
    factory,
  };
}

/**
 * Creates an event bus with multiple namespaced emitters.
 *
 * @param namespaces - Array of namespace names to create
 * @returns Configured event bus
 */
export function createEventBus(
  namespaces: string[] = [],
  store?: EventStore
): EventBus {
  const bus = new EventBus(store);
  for (const namespace of namespaces) {
    bus.namespace(namespace);
  }
  return bus;
}

/**
 * Creates a replay engine for analyzing historical events.
 *
 * @param store - The event store to replay from
 * @returns Configured replay engine
 */
export function createReplayEngine(store: EventStore): ReplayEngine {
  return new ReplayEngine(store);
}
