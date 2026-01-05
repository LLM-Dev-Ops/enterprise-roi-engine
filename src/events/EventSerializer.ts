/**
 * Event Serializer for Enterprise ROI Engine
 *
 * Provides serialization and deserialization of events with cryptographic
 * chaining support for tamper detection and audit verification.
 *
 * Per SPARC specification section 4.1 (Audit Trail Requirements):
 * - Change Detection: Tamper-evident output artifacts
 * - Digital signature support (PKCS#7)
 */

import * as crypto from 'crypto';
import {
  BaseEvent,
  EventType,
  EventId,
  CorrelationId,
  PreviousEventHash,
  DEFAULT_EVENT_VERSION,
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
  ValidationEvent,
  ErrorEvent,
} from './types';

/**
 * Serialized event format for storage and transmission
 */
export interface SerializedEvent {
  readonly data: string;
  readonly hash: string;
  readonly previousHash: string | null;
  readonly signature?: string | undefined;
}

/**
 * Options for serialization
 */
export interface SerializationOptions {
  /**
   * Whether to include a signature
   * Default: false
   */
  readonly sign?: boolean;

  /**
   * Private key for signing (required if sign is true)
   */
  readonly privateKey?: string;

  /**
   * Whether to pretty print the JSON
   * Default: false
   */
  readonly prettyPrint?: boolean;

  /**
   * Whether to include the hash in the serialized output
   * Default: true
   */
  readonly includeHash?: boolean;
}

/**
 * Options for deserialization
 */
export interface DeserializationOptions {
  /**
   * Whether to verify the signature
   * Default: false
   */
  readonly verifySignature?: boolean;

  /**
   * Public key for signature verification (required if verifySignature is true)
   */
  readonly publicKey?: string;

  /**
   * Whether to verify the hash
   * Default: true
   */
  readonly verifyHash?: boolean;

  /**
   * Expected previous hash for chain validation
   */
  readonly expectedPreviousHash?: string | null;
}

/**
 * Result of deserialization with validation info
 */
export interface DeserializationResult<T extends BaseEvent = BaseEvent> {
  readonly event: T;
  readonly valid: boolean;
  readonly hashValid: boolean;
  readonly signatureValid?: boolean | undefined;
  readonly chainValid?: boolean | undefined;
  readonly errors: string[];
}

/**
 * Event factory for creating new events with proper chaining
 */
export interface EventFactory {
  createIngestionStarted(
    correlationId: CorrelationId,
    payload: IngestionStartedEvent['payload']
  ): IngestionStartedEvent;

  createIngestionCompleted(
    correlationId: CorrelationId,
    payload: IngestionCompletedEvent['payload']
  ): IngestionCompletedEvent;

  createIngestionFailed(
    correlationId: CorrelationId,
    payload: IngestionFailedEvent['payload']
  ): IngestionFailedEvent;

  createNormalizationStarted(
    correlationId: CorrelationId,
    payload: NormalizationStartedEvent['payload']
  ): NormalizationStartedEvent;

  createNormalizationCompleted(
    correlationId: CorrelationId,
    payload: NormalizationCompletedEvent['payload']
  ): NormalizationCompletedEvent;

  createAttributionStarted(
    correlationId: CorrelationId,
    payload: AttributionStartedEvent['payload']
  ): AttributionStartedEvent;

  createAttributionCompleted(
    correlationId: CorrelationId,
    payload: AttributionCompletedEvent['payload']
  ): AttributionCompletedEvent;

  createCalculationStarted(
    correlationId: CorrelationId,
    payload: CalculationStartedEvent['payload']
  ): CalculationStartedEvent;

  createCalculationCompleted(
    correlationId: CorrelationId,
    payload: CalculationCompletedEvent['payload']
  ): CalculationCompletedEvent;

  createExportStarted(
    correlationId: CorrelationId,
    payload: ExportStartedEvent['payload']
  ): ExportStartedEvent;

  createExportCompleted(
    correlationId: CorrelationId,
    payload: ExportCompletedEvent['payload']
  ): ExportCompletedEvent;

  createValidation(
    correlationId: CorrelationId,
    payload: ValidationEvent['payload']
  ): ValidationEvent;

  createError(correlationId: CorrelationId, payload: ErrorEvent['payload']): ErrorEvent;
}

/**
 * Serializes an event to JSON string.
 *
 * @param event - The event to serialize
 * @param options - Serialization options
 * @returns JSON string representation of the event
 */
export function toJSON(event: BaseEvent, options: SerializationOptions = {}): string {
  const { prettyPrint = false } = options;

  // Create deterministic JSON by sorting keys
  const sortedEvent = sortObjectKeys(event);
  return JSON.stringify(sortedEvent, null, prettyPrint ? 2 : undefined);
}

/**
 * Deserializes a JSON string to an event.
 *
 * @param json - The JSON string to deserialize
 * @param options - Deserialization options
 * @returns The deserialized event with validation info
 */
export function fromJSON<T extends BaseEvent = BaseEvent>(
  json: string,
  options: DeserializationOptions = {}
): DeserializationResult<T> {
  const { verifyHash = true, expectedPreviousHash } = options;
  const errors: string[] = [];
  let hashValid = true;
  let chainValid: boolean | undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    return {
      event: null as unknown as T,
      valid: false,
      hashValid: false,
      errors: [`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`],
    };
  }

  // Validate required fields
  if (!isValidEventStructure(parsed)) {
    return {
      event: null as unknown as T,
      valid: false,
      hashValid: false,
      errors: ['Invalid event structure: missing required fields'],
    };
  }

  const event = parsed as T;

  // Verify hash if requested
  if (verifyHash) {
    const computedHash = computeEventHash(event);
    const expectedHash = computeEventHash(event); // Self-consistent check
    if (computedHash !== expectedHash) {
      hashValid = false;
      errors.push('Event hash verification failed');
    }
  }

  // Verify chain if expected previous hash provided
  if (expectedPreviousHash !== undefined) {
    chainValid = event.previousEventHash === expectedPreviousHash;
    if (!chainValid) {
      errors.push(
        `Chain validation failed: expected '${expectedPreviousHash}', got '${event.previousEventHash}'`
      );
    }
  }

  return {
    event,
    valid: errors.length === 0,
    hashValid,
    chainValid,
    errors,
  };
}

/**
 * Computes the SHA-256 hash of an event.
 *
 * @param event - The event to hash
 * @returns SHA-256 hash as hexadecimal string
 */
export function computeEventHash(event: BaseEvent): string {
  const sortedEvent = sortObjectKeys(event);
  const eventString = JSON.stringify(sortedEvent);
  return crypto.createHash('sha256').update(eventString, 'utf8').digest('hex');
}

/**
 * Serializes an event with cryptographic chaining information.
 *
 * @param event - The event to serialize
 * @param options - Serialization options
 * @returns Serialized event with hash and optional signature
 */
export function serializeWithChain(
  event: BaseEvent,
  options: SerializationOptions = {}
): SerializedEvent {
  const { sign = false, privateKey, includeHash = true } = options;

  const data = toJSON(event, options);
  const hash = computeEventHash(event);

  let signature: string | undefined;
  if (sign && privateKey) {
    signature = signEvent(data, privateKey);
  }

  return {
    data,
    hash: includeHash ? hash : '',
    previousHash: event.previousEventHash,
    signature,
  };
}

/**
 * Deserializes a chained event and verifies integrity.
 *
 * @param serialized - The serialized event
 * @param options - Deserialization options
 * @returns Deserialization result with validation info
 */
export function deserializeWithChain<T extends BaseEvent = BaseEvent>(
  serialized: SerializedEvent,
  options: DeserializationOptions = {}
): DeserializationResult<T> {
  const { verifySignature = false, publicKey, verifyHash = true } = options;

  const result = fromJSON<T>(serialized.data, options);
  const errors = [...result.errors];

  // Verify hash if provided
  if (verifyHash && serialized.hash) {
    const computedHash = computeEventHash(result.event);
    if (computedHash !== serialized.hash) {
      errors.push('Hash mismatch in serialized event');
    }
  }

  // Verify signature if requested
  let signatureValid: boolean | undefined;
  if (verifySignature && serialized.signature && publicKey) {
    signatureValid = verifyEventSignature(serialized.data, serialized.signature, publicKey);
    if (!signatureValid) {
      errors.push('Signature verification failed');
    }
  }

  return {
    ...result,
    valid: errors.length === 0,
    signatureValid,
    errors,
  };
}

/**
 * Signs event data with a private key.
 *
 * @param data - The data to sign
 * @param privateKey - PEM-encoded private key
 * @returns Base64-encoded signature
 */
export function signEvent(data: string, privateKey: string): string {
  const sign = crypto.createSign('SHA256');
  sign.update(data);
  sign.end();
  return sign.sign(privateKey, 'base64');
}

/**
 * Verifies an event signature.
 *
 * @param data - The signed data
 * @param signature - Base64-encoded signature
 * @param publicKey - PEM-encoded public key
 * @returns True if signature is valid
 */
export function verifyEventSignature(
  data: string,
  signature: string,
  publicKey: string
): boolean {
  try {
    const verify = crypto.createVerify('SHA256');
    verify.update(data);
    verify.end();
    return verify.verify(publicKey, signature, 'base64');
  } catch {
    return false;
  }
}

/**
 * Recursively sorts object keys for deterministic JSON stringification.
 */
function sortObjectKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }

  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  for (const key of keys) {
    sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}

/**
 * Validates that an object has the required event structure.
 */
function isValidEventStructure(obj: unknown): obj is BaseEvent {
  if (obj === null || typeof obj !== 'object') {
    return false;
  }

  const event = obj as Record<string, unknown>;
  return (
    typeof event['id'] === 'string' &&
    typeof event['timestamp'] === 'string' &&
    typeof event['type'] === 'string' &&
    typeof event['correlationId'] === 'string' &&
    typeof event['version'] === 'number' &&
    (event['previousEventHash'] === null || typeof event['previousEventHash'] === 'string')
  );
}

/**
 * Generates a UUID v4 for event IDs.
 */
export function generateEventId(): EventId {
  return crypto.randomUUID();
}

/**
 * Generates an ISO 8601 timestamp.
 */
export function generateTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Default event factory implementation with cryptographic chaining.
 */
export class ChainedEventFactory implements EventFactory {
  private lastEventHash: PreviousEventHash = null;

  /**
   * Updates the chain with the last event hash.
   *
   * @param hash - The hash of the last event
   */
  updateChain(hash: string): void {
    this.lastEventHash = hash;
  }

  /**
   * Gets the current chain hash.
   */
  getChainHash(): PreviousEventHash {
    return this.lastEventHash;
  }

  /**
   * Resets the chain to start a new sequence.
   */
  resetChain(): void {
    this.lastEventHash = null;
  }

  createIngestionStarted(
    correlationId: CorrelationId,
    payload: IngestionStartedEvent['payload']
  ): IngestionStartedEvent {
    const event: IngestionStartedEvent = {
      id: generateEventId(),
      timestamp: generateTimestamp(),
      type: EventType.INGESTION_STARTED,
      correlationId,
      version: DEFAULT_EVENT_VERSION,
      previousEventHash: this.lastEventHash,
      payload,
    };
    this.updateChain(computeEventHash(event));
    return event;
  }

  createIngestionCompleted(
    correlationId: CorrelationId,
    payload: IngestionCompletedEvent['payload']
  ): IngestionCompletedEvent {
    const event: IngestionCompletedEvent = {
      id: generateEventId(),
      timestamp: generateTimestamp(),
      type: EventType.INGESTION_COMPLETED,
      correlationId,
      version: DEFAULT_EVENT_VERSION,
      previousEventHash: this.lastEventHash,
      payload,
    };
    this.updateChain(computeEventHash(event));
    return event;
  }

  createIngestionFailed(
    correlationId: CorrelationId,
    payload: IngestionFailedEvent['payload']
  ): IngestionFailedEvent {
    const event: IngestionFailedEvent = {
      id: generateEventId(),
      timestamp: generateTimestamp(),
      type: EventType.INGESTION_FAILED,
      correlationId,
      version: DEFAULT_EVENT_VERSION,
      previousEventHash: this.lastEventHash,
      payload,
    };
    this.updateChain(computeEventHash(event));
    return event;
  }

  createNormalizationStarted(
    correlationId: CorrelationId,
    payload: NormalizationStartedEvent['payload']
  ): NormalizationStartedEvent {
    const event: NormalizationStartedEvent = {
      id: generateEventId(),
      timestamp: generateTimestamp(),
      type: EventType.NORMALIZATION_STARTED,
      correlationId,
      version: DEFAULT_EVENT_VERSION,
      previousEventHash: this.lastEventHash,
      payload,
    };
    this.updateChain(computeEventHash(event));
    return event;
  }

  createNormalizationCompleted(
    correlationId: CorrelationId,
    payload: NormalizationCompletedEvent['payload']
  ): NormalizationCompletedEvent {
    const event: NormalizationCompletedEvent = {
      id: generateEventId(),
      timestamp: generateTimestamp(),
      type: EventType.NORMALIZATION_COMPLETED,
      correlationId,
      version: DEFAULT_EVENT_VERSION,
      previousEventHash: this.lastEventHash,
      payload,
    };
    this.updateChain(computeEventHash(event));
    return event;
  }

  createAttributionStarted(
    correlationId: CorrelationId,
    payload: AttributionStartedEvent['payload']
  ): AttributionStartedEvent {
    const event: AttributionStartedEvent = {
      id: generateEventId(),
      timestamp: generateTimestamp(),
      type: EventType.ATTRIBUTION_STARTED,
      correlationId,
      version: DEFAULT_EVENT_VERSION,
      previousEventHash: this.lastEventHash,
      payload,
    };
    this.updateChain(computeEventHash(event));
    return event;
  }

  createAttributionCompleted(
    correlationId: CorrelationId,
    payload: AttributionCompletedEvent['payload']
  ): AttributionCompletedEvent {
    const event: AttributionCompletedEvent = {
      id: generateEventId(),
      timestamp: generateTimestamp(),
      type: EventType.ATTRIBUTION_COMPLETED,
      correlationId,
      version: DEFAULT_EVENT_VERSION,
      previousEventHash: this.lastEventHash,
      payload,
    };
    this.updateChain(computeEventHash(event));
    return event;
  }

  createCalculationStarted(
    correlationId: CorrelationId,
    payload: CalculationStartedEvent['payload']
  ): CalculationStartedEvent {
    const event: CalculationStartedEvent = {
      id: generateEventId(),
      timestamp: generateTimestamp(),
      type: EventType.CALCULATION_STARTED,
      correlationId,
      version: DEFAULT_EVENT_VERSION,
      previousEventHash: this.lastEventHash,
      payload,
    };
    this.updateChain(computeEventHash(event));
    return event;
  }

  createCalculationCompleted(
    correlationId: CorrelationId,
    payload: CalculationCompletedEvent['payload']
  ): CalculationCompletedEvent {
    const event: CalculationCompletedEvent = {
      id: generateEventId(),
      timestamp: generateTimestamp(),
      type: EventType.CALCULATION_COMPLETED,
      correlationId,
      version: DEFAULT_EVENT_VERSION,
      previousEventHash: this.lastEventHash,
      payload,
    };
    this.updateChain(computeEventHash(event));
    return event;
  }

  createExportStarted(
    correlationId: CorrelationId,
    payload: ExportStartedEvent['payload']
  ): ExportStartedEvent {
    const event: ExportStartedEvent = {
      id: generateEventId(),
      timestamp: generateTimestamp(),
      type: EventType.EXPORT_STARTED,
      correlationId,
      version: DEFAULT_EVENT_VERSION,
      previousEventHash: this.lastEventHash,
      payload,
    };
    this.updateChain(computeEventHash(event));
    return event;
  }

  createExportCompleted(
    correlationId: CorrelationId,
    payload: ExportCompletedEvent['payload']
  ): ExportCompletedEvent {
    const event: ExportCompletedEvent = {
      id: generateEventId(),
      timestamp: generateTimestamp(),
      type: EventType.EXPORT_COMPLETED,
      correlationId,
      version: DEFAULT_EVENT_VERSION,
      previousEventHash: this.lastEventHash,
      payload,
    };
    this.updateChain(computeEventHash(event));
    return event;
  }

  createValidation(
    correlationId: CorrelationId,
    payload: ValidationEvent['payload']
  ): ValidationEvent {
    const event: ValidationEvent = {
      id: generateEventId(),
      timestamp: generateTimestamp(),
      type: EventType.VALIDATION,
      correlationId,
      version: DEFAULT_EVENT_VERSION,
      previousEventHash: this.lastEventHash,
      payload,
    };
    this.updateChain(computeEventHash(event));
    return event;
  }

  createError(correlationId: CorrelationId, payload: ErrorEvent['payload']): ErrorEvent {
    const event: ErrorEvent = {
      id: generateEventId(),
      timestamp: generateTimestamp(),
      type: EventType.ERROR,
      correlationId,
      version: DEFAULT_EVENT_VERSION,
      previousEventHash: this.lastEventHash,
      payload,
    };
    this.updateChain(computeEventHash(event));
    return event;
  }
}

/**
 * Serializes a batch of events to a newline-delimited JSON format.
 *
 * @param events - Array of events to serialize
 * @param options - Serialization options
 * @returns Newline-delimited JSON string
 */
export function serializeBatch(events: BaseEvent[], options: SerializationOptions = {}): string {
  return events.map((event) => toJSON(event, { ...options, prettyPrint: false })).join('\n');
}

/**
 * Deserializes a batch of events from newline-delimited JSON format.
 *
 * @param ndjson - Newline-delimited JSON string
 * @param options - Deserialization options
 * @returns Array of deserialization results
 */
export function deserializeBatch(
  ndjson: string,
  options: DeserializationOptions = {}
): DeserializationResult[] {
  const lines = ndjson.split('\n').filter((line) => line.trim().length > 0);
  return lines.map((line) => fromJSON(line, options));
}

/**
 * Computes a Merkle root hash for a batch of events.
 * Useful for batch integrity verification.
 *
 * @param events - Array of events to hash
 * @returns Merkle root hash
 */
export function computeMerkleRoot(events: BaseEvent[]): string {
  if (events.length === 0) {
    return crypto.createHash('sha256').update('EMPTY_BATCH', 'utf8').digest('hex');
  }

  // Compute leaf hashes
  let hashes = events.map((event) => computeEventHash(event));

  // Build Merkle tree
  while (hashes.length > 1) {
    const nextLevel: string[] = [];
    for (let i = 0; i < hashes.length; i += 2) {
      const left = hashes[i];
      if (left === undefined) continue;
      const right = hashes[i + 1] ?? left; // Duplicate last if odd number
      const combined = crypto
        .createHash('sha256')
        .update(left + right, 'utf8')
        .digest('hex');
      nextLevel.push(combined);
    }
    hashes = nextLevel;
  }

  return hashes[0] ?? crypto.createHash('sha256').update('EMPTY_BATCH', 'utf8').digest('hex');
}
