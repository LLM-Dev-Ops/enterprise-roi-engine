/**
 * Event Store for Enterprise ROI Engine
 *
 * Implements immutable event storage for audit trails and reproducibility.
 * Events are append-only and cannot be modified once stored.
 *
 * Per SPARC specification section 4.1 (Audit Trail Requirements):
 * - Immutable Event Log: Every calculation step recorded as append-only event
 * - Events stored with cryptographic chaining
 */

import * as crypto from 'crypto';
import { BaseEvent, CorrelationId, EventType } from './types';

/**
 * Interface for event storage implementations.
 * All implementations must guarantee immutability of stored events.
 */
export interface EventStore {
  /**
   * Appends an event to the store. Events are immutable once appended.
   * The store validates the event's previousEventHash for chain integrity.
   *
   * @param event - The event to append
   * @throws Error if the event chain is broken (invalid previousEventHash)
   */
  append(event: BaseEvent): void;

  /**
   * Retrieves all events with the specified correlation ID in chronological order.
   *
   * @param correlationId - The correlation ID to filter by
   * @returns Readonly array of events matching the correlation ID
   */
  getEvents(correlationId: CorrelationId): readonly BaseEvent[];

  /**
   * Retrieves all events of the specified type in chronological order.
   *
   * @param type - The event type to filter by
   * @returns Readonly array of events matching the type
   */
  getEventsByType(type: EventType | string): readonly BaseEvent[];

  /**
   * Retrieves all events in the store in chronological order.
   *
   * @returns Readonly array of all events
   */
  getAllEvents(): readonly BaseEvent[];

  /**
   * Returns the total number of events in the store.
   *
   * @returns The event count
   */
  getEventCount(): number;

  /**
   * Computes a cryptographic hash of the entire event store for audit verification.
   * This enables detection of any tampering with the event log.
   *
   * @returns SHA-256 hash of all events in the store
   */
  computeHash(): string;

  /**
   * Returns the hash of the last event in the store.
   * Used to link new events to the chain.
   *
   * @returns Hash of the last event, or null if store is empty
   */
  getLastEventHash(): string | null;

  /**
   * Verifies the integrity of the event chain.
   * Checks that each event's previousEventHash matches the hash of the prior event.
   *
   * @returns True if chain is valid, false if tampering detected
   */
  verifyChainIntegrity(): boolean;

  /**
   * Retrieves events within a time range.
   *
   * @param startTime - ISO 8601 timestamp for range start (inclusive)
   * @param endTime - ISO 8601 timestamp for range end (inclusive)
   * @returns Readonly array of events within the range
   */
  getEventsByTimeRange(startTime: string, endTime: string): readonly BaseEvent[];

  /**
   * Clears all events from the store. Use with caution - primarily for testing.
   * In production, this should be disabled or require special authorization.
   */
  clear(): void;
}

/**
 * Computes the SHA-256 hash of an event for chain linking.
 * Uses deterministic JSON stringification for reproducibility.
 *
 * @param event - The event to hash
 * @returns SHA-256 hash as hexadecimal string
 */
export function computeEventHash(event: BaseEvent): string {
  // Create a deterministic JSON representation
  // Sort keys to ensure consistent ordering
  const sortedEvent = sortObjectKeys(event);
  const eventString = JSON.stringify(sortedEvent);
  return crypto.createHash('sha256').update(eventString, 'utf8').digest('hex');
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
 * Result of chain integrity verification
 */
export interface ChainVerificationResult {
  readonly valid: boolean;
  readonly eventCount: number;
  readonly brokenAt?: number;
  readonly expectedHash?: string;
  readonly actualHash?: string;
  readonly message: string;
}

/**
 * In-memory implementation of EventStore for testing and development.
 * Events are stored in an array and are fully immutable once appended.
 *
 * Note: This implementation does not persist events across restarts.
 * For production use, implement a persistent EventStore backed by a database.
 */
export class InMemoryEventStore implements EventStore {
  private readonly events: BaseEvent[] = [];
  private readonly eventsByCorrelationId: Map<CorrelationId, BaseEvent[]> = new Map();
  private readonly eventsByType: Map<string, BaseEvent[]> = new Map();
  private lastEventHash: string | null = null;

  /**
   * Creates a new InMemoryEventStore instance.
   *
   * @param validateChain - Whether to validate previousEventHash on append (default: true)
   */
  constructor(private readonly validateChain: boolean = true) {}

  /**
   * Appends an event to the store with chain validation.
   */
  append(event: BaseEvent): void {
    // Validate chain integrity if enabled
    if (this.validateChain) {
      if (event.previousEventHash !== this.lastEventHash) {
        throw new Error(
          `Event chain broken: expected previousEventHash '${this.lastEventHash}', ` +
            `got '${event.previousEventHash}'`
        );
      }
    }

    // Deep freeze the event to ensure immutability
    const frozenEvent = this.deepFreeze({ ...event });

    // Store the event
    this.events.push(frozenEvent);

    // Index by correlation ID
    const correlationEvents = this.eventsByCorrelationId.get(event.correlationId) || [];
    correlationEvents.push(frozenEvent);
    this.eventsByCorrelationId.set(event.correlationId, correlationEvents);

    // Index by type
    const typeEvents = this.eventsByType.get(event.type) || [];
    typeEvents.push(frozenEvent);
    this.eventsByType.set(event.type, typeEvents);

    // Update last event hash
    this.lastEventHash = computeEventHash(frozenEvent);
  }

  /**
   * Returns events for a specific correlation ID.
   */
  getEvents(correlationId: CorrelationId): readonly BaseEvent[] {
    const events = this.eventsByCorrelationId.get(correlationId);
    return events ? Object.freeze([...events]) : Object.freeze([]);
  }

  /**
   * Returns events of a specific type.
   */
  getEventsByType(type: EventType | string): readonly BaseEvent[] {
    const events = this.eventsByType.get(type);
    return events ? Object.freeze([...events]) : Object.freeze([]);
  }

  /**
   * Returns all events in chronological order.
   */
  getAllEvents(): readonly BaseEvent[] {
    return Object.freeze([...this.events]);
  }

  /**
   * Returns the total number of events.
   */
  getEventCount(): number {
    return this.events.length;
  }

  /**
   * Computes a hash of the entire event store for audit verification.
   */
  computeHash(): string {
    if (this.events.length === 0) {
      return crypto.createHash('sha256').update('EMPTY_STORE', 'utf8').digest('hex');
    }

    // Compute hash by chaining all event hashes
    const allHashes = this.events.map((event) => computeEventHash(event));
    const combinedHash = allHashes.join(':');
    return crypto.createHash('sha256').update(combinedHash, 'utf8').digest('hex');
  }

  /**
   * Returns the hash of the last event.
   */
  getLastEventHash(): string | null {
    return this.lastEventHash;
  }

  /**
   * Verifies the integrity of the event chain.
   */
  verifyChainIntegrity(): boolean {
    return this.verifyChainIntegrityDetailed().valid;
  }

  /**
   * Performs detailed chain integrity verification with diagnostic information.
   */
  verifyChainIntegrityDetailed(): ChainVerificationResult {
    if (this.events.length === 0) {
      return {
        valid: true,
        eventCount: 0,
        message: 'Store is empty, chain is trivially valid',
      };
    }

    // First event should have null previousEventHash
    const firstEvent = this.events[0];
    if (firstEvent === undefined) {
      return {
        valid: false,
        eventCount: this.events.length,
        message: 'First event is undefined',
      };
    }

    if (firstEvent.previousEventHash !== null) {
      return {
        valid: false,
        eventCount: this.events.length,
        brokenAt: 0,
        expectedHash: 'null',
        actualHash: firstEvent.previousEventHash ?? 'undefined',
        message: 'First event must have null previousEventHash',
      };
    }

    // Verify each subsequent event links to the previous
    let previousHash = computeEventHash(firstEvent);

    for (let i = 1; i < this.events.length; i++) {
      const event = this.events[i];
      if (event === undefined) {
        return {
          valid: false,
          eventCount: this.events.length,
          brokenAt: i,
          message: `Event at index ${i} is undefined`,
        };
      }
      if (event.previousEventHash !== previousHash) {
        return {
          valid: false,
          eventCount: this.events.length,
          brokenAt: i,
          expectedHash: previousHash,
          actualHash: event.previousEventHash ?? 'null',
          message: `Chain broken at event index ${i}`,
        };
      }
      previousHash = computeEventHash(event);
    }

    return {
      valid: true,
      eventCount: this.events.length,
      message: 'Chain integrity verified successfully',
    };
  }

  /**
   * Returns events within a time range.
   */
  getEventsByTimeRange(startTime: string, endTime: string): readonly BaseEvent[] {
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();

    const filtered = this.events.filter((event) => {
      const eventTime = new Date(event.timestamp).getTime();
      return eventTime >= start && eventTime <= end;
    });

    return Object.freeze(filtered);
  }

  /**
   * Clears all events from the store.
   * Warning: This operation is irreversible. Use only for testing.
   */
  clear(): void {
    this.events.length = 0;
    this.eventsByCorrelationId.clear();
    this.eventsByType.clear();
    this.lastEventHash = null;
  }

  /**
   * Deep freezes an object to ensure complete immutability.
   */
  private deepFreeze<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    // Freeze the object itself
    Object.freeze(obj);

    // Recursively freeze all properties
    Object.getOwnPropertyNames(obj).forEach((prop) => {
      const value = (obj as Record<string, unknown>)[prop];
      if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
        this.deepFreeze(value);
      }
    });

    return obj;
  }
}

/**
 * Creates a snapshot of an event store for backup or transfer purposes.
 */
export interface EventStoreSnapshot {
  readonly version: number;
  readonly createdAt: string;
  readonly eventCount: number;
  readonly storeHash: string;
  readonly events: readonly BaseEvent[];
}

/**
 * Creates a snapshot of the current event store state.
 *
 * @param store - The event store to snapshot
 * @returns An immutable snapshot of the store
 */
export function createEventStoreSnapshot(store: EventStore): EventStoreSnapshot {
  const events = store.getAllEvents();
  return Object.freeze({
    version: 1,
    createdAt: new Date().toISOString(),
    eventCount: events.length,
    storeHash: store.computeHash(),
    events: events,
  });
}

/**
 * Restores an event store from a snapshot.
 *
 * @param snapshot - The snapshot to restore from
 * @param validateChain - Whether to validate the chain during restoration
 * @returns A new InMemoryEventStore populated with the snapshot's events
 */
export function restoreFromSnapshot(
  snapshot: EventStoreSnapshot,
  validateChain: boolean = true
): InMemoryEventStore {
  const store = new InMemoryEventStore(validateChain);

  for (const event of snapshot.events) {
    store.append(event);
  }

  // Verify the restored store matches the snapshot hash
  const restoredHash = store.computeHash();
  if (restoredHash !== snapshot.storeHash) {
    throw new Error(
      `Snapshot restoration failed: hash mismatch. ` +
        `Expected '${snapshot.storeHash}', got '${restoredHash}'`
    );
  }

  return store;
}
