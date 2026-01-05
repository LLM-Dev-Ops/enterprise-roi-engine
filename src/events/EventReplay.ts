/**
 * Event Replay Engine for Enterprise ROI Engine
 *
 * Enables reproducibility by replaying events in order and verifying
 * event sequence integrity. Supports time-travel debugging and
 * audit verification.
 *
 * Per SPARC specification section 4.2 (Reproducibility Requirements):
 * - Deterministic Execution: Same inputs produce bit-identical outputs
 * - Time-Travel Capability: Recalculate historical outputs with original context
 * - Seed Preservation: Random seeds for Monte Carlo stored
 */

import { BaseEvent, EventType, CorrelationId } from './types';
import { EventStore, ChainVerificationResult, computeEventHash } from './EventStore';
import { EventEmitter } from './EventEmitter';

/**
 * Replay mode options
 */
export enum ReplayMode {
  /**
   * Replay events at original recorded speed
   */
  REALTIME = 'REALTIME',

  /**
   * Replay events as fast as possible
   */
  FAST_FORWARD = 'FAST_FORWARD',

  /**
   * Replay events one at a time with manual control
   */
  STEP = 'STEP',

  /**
   * Replay events with a speed multiplier
   */
  ACCELERATED = 'ACCELERATED',
}

/**
 * Options for replay execution
 */
export interface ReplayOptions {
  /**
   * The replay mode
   * Default: FAST_FORWARD
   */
  readonly mode?: ReplayMode;

  /**
   * Speed multiplier for ACCELERATED mode
   * Default: 1.0
   */
  readonly speedMultiplier?: number;

  /**
   * Whether to verify chain integrity before replay
   * Default: true
   */
  readonly verifyIntegrity?: boolean;

  /**
   * Event types to filter for replay (empty = all)
   */
  readonly filterTypes?: EventType[];

  /**
   * Correlation ID to filter for replay
   */
  readonly filterCorrelationId?: CorrelationId;

  /**
   * Start time for replay range (inclusive)
   */
  readonly startTime?: string;

  /**
   * End time for replay range (inclusive)
   */
  readonly endTime?: string;

  /**
   * Maximum number of events to replay
   */
  readonly limit?: number;

  /**
   * Whether to stop on first error
   * Default: true
   */
  readonly stopOnError?: boolean;

  /**
   * Callback for progress updates
   */
  readonly onProgress?: (progress: ReplayProgress) => void;
}

/**
 * Progress information during replay
 */
export interface ReplayProgress {
  readonly totalEvents: number;
  readonly processedEvents: number;
  readonly currentEvent: BaseEvent;
  readonly percentComplete: number;
  readonly estimatedTimeRemainingMs?: number;
  readonly errors: number;
}

/**
 * Result of a replay operation
 */
export interface ReplayResult {
  readonly success: boolean;
  readonly totalEvents: number;
  readonly replayedEvents: number;
  readonly skippedEvents: number;
  readonly errors: ReadonlyArray<ReplayError>;
  readonly chainIntegrity: ChainVerificationResult;
  readonly anomalies: ReadonlyArray<EventAnomaly>;
  readonly durationMs: number;
  readonly startTime: string;
  readonly endTime: string;
}

/**
 * Error encountered during replay
 */
export interface ReplayError {
  readonly eventId: string;
  readonly eventIndex: number;
  readonly error: Error;
  readonly recoverable: boolean;
}

/**
 * Anomaly types that can be detected during replay
 */
export enum AnomalyType {
  /**
   * Gap in event sequence (missing events)
   */
  SEQUENCE_GAP = 'SEQUENCE_GAP',

  /**
   * Duplicate event detected
   */
  DUPLICATE_EVENT = 'DUPLICATE_EVENT',

  /**
   * Event timestamp out of order
   */
  TIMESTAMP_DISORDER = 'TIMESTAMP_DISORDER',

  /**
   * Hash chain broken
   */
  CHAIN_BREAK = 'CHAIN_BREAK',

  /**
   * Unexpected event type in sequence
   */
  UNEXPECTED_TYPE = 'UNEXPECTED_TYPE',

  /**
   * Missing expected event
   */
  MISSING_EVENT = 'MISSING_EVENT',

  /**
   * Event data inconsistency
   */
  DATA_INCONSISTENCY = 'DATA_INCONSISTENCY',
}

/**
 * Detected anomaly in event sequence
 */
export interface EventAnomaly {
  readonly type: AnomalyType;
  readonly eventIndex: number;
  readonly eventId?: string;
  readonly description: string;
  readonly severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  readonly context?: Record<string, unknown>;
}

/**
 * Expected event sequence patterns for validation
 */
export interface EventSequencePattern {
  readonly name: string;
  readonly pattern: EventType[];
  readonly strict: boolean;
}

/**
 * Predefined event sequence patterns for the ROI Engine pipeline
 */
export const ROI_ENGINE_PATTERNS: EventSequencePattern[] = [
  {
    name: 'INGESTION_FLOW',
    pattern: [EventType.INGESTION_STARTED, EventType.INGESTION_COMPLETED],
    strict: false,
  },
  {
    name: 'INGESTION_FAILURE_FLOW',
    pattern: [EventType.INGESTION_STARTED, EventType.INGESTION_FAILED],
    strict: false,
  },
  {
    name: 'NORMALIZATION_FLOW',
    pattern: [EventType.NORMALIZATION_STARTED, EventType.NORMALIZATION_COMPLETED],
    strict: false,
  },
  {
    name: 'ATTRIBUTION_FLOW',
    pattern: [EventType.ATTRIBUTION_STARTED, EventType.ATTRIBUTION_COMPLETED],
    strict: false,
  },
  {
    name: 'CALCULATION_FLOW',
    pattern: [EventType.CALCULATION_STARTED, EventType.CALCULATION_COMPLETED],
    strict: false,
  },
  {
    name: 'EXPORT_FLOW',
    pattern: [EventType.EXPORT_STARTED, EventType.EXPORT_COMPLETED],
    strict: false,
  },
  {
    name: 'FULL_PIPELINE',
    pattern: [
      EventType.INGESTION_STARTED,
      EventType.INGESTION_COMPLETED,
      EventType.NORMALIZATION_STARTED,
      EventType.NORMALIZATION_COMPLETED,
      EventType.ATTRIBUTION_STARTED,
      EventType.ATTRIBUTION_COMPLETED,
      EventType.CALCULATION_STARTED,
      EventType.CALCULATION_COMPLETED,
      EventType.EXPORT_STARTED,
      EventType.EXPORT_COMPLETED,
    ],
    strict: false,
  },
];

/**
 * Replay engine for event sourcing reproducibility.
 * Enables replaying events through handlers to reproduce system state.
 */
export class ReplayEngine {
  private readonly eventStore: EventStore;
  private readonly eventEmitter: EventEmitter | undefined;

  /**
   * Creates a new ReplayEngine instance.
   *
   * @param eventStore - The event store to replay from
   * @param eventEmitter - Optional event emitter to dispatch events during replay
   */
  constructor(eventStore: EventStore, eventEmitter?: EventEmitter) {
    this.eventStore = eventStore;
    this.eventEmitter = eventEmitter;
  }

  /**
   * Replays events from the store in chronological order.
   *
   * @param options - Replay configuration options
   * @returns Result of the replay operation
   */
  async replay(options: ReplayOptions = {}): Promise<ReplayResult> {
    const startTime = new Date().toISOString();
    const startMs = Date.now();

    const {
      mode = ReplayMode.FAST_FORWARD,
      speedMultiplier = 1.0,
      verifyIntegrity = true,
      filterTypes = [],
      filterCorrelationId,
      startTime: rangeStart,
      endTime: rangeEnd,
      limit,
      stopOnError = true,
      onProgress,
    } = options;

    // Verify chain integrity if requested
    let chainIntegrity: ChainVerificationResult = {
      valid: true,
      eventCount: 0,
      message: 'Integrity check skipped',
    };

    if (verifyIntegrity) {
      chainIntegrity = this.verifySequenceIntegrity();
      if (!chainIntegrity.valid && stopOnError) {
        return {
          success: false,
          totalEvents: this.eventStore.getEventCount(),
          replayedEvents: 0,
          skippedEvents: 0,
          errors: [],
          chainIntegrity,
          anomalies: [
            {
              type: AnomalyType.CHAIN_BREAK,
              eventIndex: chainIntegrity.brokenAt || -1,
              description: chainIntegrity.message,
              severity: 'CRITICAL',
            },
          ],
          durationMs: Date.now() - startMs,
          startTime,
          endTime: new Date().toISOString(),
        };
      }
    }

    // Get events to replay
    let events = this.getEventsForReplay(filterCorrelationId, rangeStart, rangeEnd);

    // Apply type filter
    if (filterTypes.length > 0) {
      events = events.filter((e) => filterTypes.includes(e.type as EventType));
    }

    // Apply limit
    if (limit !== undefined && limit > 0) {
      events = events.slice(0, limit);
    }

    const totalEvents = events.length;
    const errors: ReplayError[] = [];
    const anomalies: EventAnomaly[] = [];
    let replayedEvents = 0;
    let skippedEvents = 0;

    // Detect anomalies before replay
    const detectedAnomalies = this.detectAnomalies(events);
    anomalies.push(...detectedAnomalies);

    // Track timing for realtime/accelerated modes
    let previousTimestamp: Date | null = null;

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      if (event === undefined) continue;

      // Report progress
      if (onProgress) {
        const progress: ReplayProgress = {
          totalEvents,
          processedEvents: i,
          currentEvent: event,
          percentComplete: (i / totalEvents) * 100,
          errors: errors.length,
        };
        onProgress(progress);
      }

      // Handle timing for different modes
      if (mode === ReplayMode.REALTIME || mode === ReplayMode.ACCELERATED) {
        const eventTime = new Date(event.timestamp);
        if (previousTimestamp) {
          const delay = eventTime.getTime() - previousTimestamp.getTime();
          const adjustedDelay =
            mode === ReplayMode.ACCELERATED ? delay / speedMultiplier : delay;
          if (adjustedDelay > 0) {
            await this.sleep(adjustedDelay);
          }
        }
        previousTimestamp = eventTime;
      }

      // Emit the event if emitter is configured
      try {
        if (this.eventEmitter) {
          await this.eventEmitter.emit(event, { persist: false });
        }
        replayedEvents++;
      } catch (error) {
        const replayError: ReplayError = {
          eventId: event.id,
          eventIndex: i,
          error: error instanceof Error ? error : new Error(String(error)),
          recoverable: true,
        };
        errors.push(replayError);

        if (stopOnError) {
          skippedEvents = totalEvents - i - 1;
          break;
        }
      }
    }

    return {
      success: errors.length === 0,
      totalEvents,
      replayedEvents,
      skippedEvents,
      errors: Object.freeze(errors),
      chainIntegrity,
      anomalies: Object.freeze(anomalies),
      durationMs: Date.now() - startMs,
      startTime,
      endTime: new Date().toISOString(),
    };
  }

  /**
   * Verifies the integrity of the event sequence.
   *
   * @returns Verification result with details
   */
  verifySequenceIntegrity(): ChainVerificationResult {
    const events = this.eventStore.getAllEvents();

    if (events.length === 0) {
      return {
        valid: true,
        eventCount: 0,
        message: 'Store is empty, chain is trivially valid',
      };
    }

    const firstEvent = events[0];
    if (firstEvent === undefined) {
      return {
        valid: false,
        eventCount: events.length,
        message: 'First event is undefined',
      };
    }

    // First event should have null previousEventHash
    if (firstEvent.previousEventHash !== null) {
      return {
        valid: false,
        eventCount: events.length,
        brokenAt: 0,
        expectedHash: 'null',
        actualHash: firstEvent.previousEventHash || 'undefined',
        message: 'First event must have null previousEventHash',
      };
    }

    // Verify chain
    let previousHash = computeEventHash(firstEvent);
    for (let i = 1; i < events.length; i++) {
      const event = events[i];
      if (event === undefined) continue;
      if (event.previousEventHash !== previousHash) {
        return {
          valid: false,
          eventCount: events.length,
          brokenAt: i,
          expectedHash: previousHash,
          actualHash: event.previousEventHash || 'null',
          message: `Chain broken at event index ${i}`,
        };
      }
      previousHash = computeEventHash(event);
    }

    return {
      valid: true,
      eventCount: events.length,
      message: 'Chain integrity verified successfully',
    };
  }

  /**
   * Detects anomalies in the event sequence.
   *
   * @param events - Events to analyze
   * @returns Array of detected anomalies
   */
  detectAnomalies(events?: readonly BaseEvent[]): EventAnomaly[] {
    const eventsToAnalyze = events ?? this.eventStore.getAllEvents();
    const anomalies: EventAnomaly[] = [];

    if (eventsToAnalyze.length === 0) {
      return anomalies;
    }

    const seenIds = new Set<string>();
    let previousTimestamp: Date | null = null;

    for (let i = 0; i < eventsToAnalyze.length; i++) {
      const event = eventsToAnalyze[i];
      if (event === undefined) continue;

      // Check for duplicate events
      if (seenIds.has(event.id)) {
        anomalies.push({
          type: AnomalyType.DUPLICATE_EVENT,
          eventIndex: i,
          eventId: event.id,
          description: `Duplicate event ID detected: ${event.id}`,
          severity: 'HIGH',
        });
      }
      seenIds.add(event.id);

      // Check for timestamp disorder
      const currentTimestamp = new Date(event.timestamp);
      if (previousTimestamp && currentTimestamp < previousTimestamp) {
        anomalies.push({
          type: AnomalyType.TIMESTAMP_DISORDER,
          eventIndex: i,
          eventId: event.id,
          description: `Event timestamp ${event.timestamp} is before previous event timestamp`,
          severity: 'MEDIUM',
          context: {
            previousTimestamp: previousTimestamp.toISOString(),
            currentTimestamp: currentTimestamp.toISOString(),
          },
        });
      }
      previousTimestamp = currentTimestamp;
    }

    // Check for pattern violations
    const patternAnomalies = this.checkPatternViolations(eventsToAnalyze);
    anomalies.push(...patternAnomalies);

    return anomalies;
  }

  /**
   * Validates that events for a correlation ID follow expected patterns.
   *
   * @param correlationId - The correlation ID to validate
   * @param patterns - Patterns to validate against (default: ROI_ENGINE_PATTERNS)
   * @returns Array of pattern violations
   */
  validateEventSequence(
    correlationId: CorrelationId,
    patterns: EventSequencePattern[] = ROI_ENGINE_PATTERNS
  ): EventAnomaly[] {
    const events = this.eventStore.getEvents(correlationId);
    return this.checkPatternViolations(events, patterns);
  }

  /**
   * Creates a replay point-in-time snapshot.
   *
   * @param timestamp - The timestamp to snapshot at
   * @returns Events up to the specified timestamp
   */
  getSnapshotAt(timestamp: string): readonly BaseEvent[] {
    const targetTime = new Date(timestamp).getTime();
    const events = this.eventStore.getAllEvents();

    return events.filter((event) => {
      const eventTime = new Date(event.timestamp).getTime();
      return eventTime <= targetTime;
    });
  }

  /**
   * Computes the state hash at a specific point in time.
   *
   * @param timestamp - The timestamp to compute hash at
   * @returns SHA-256 hash of events up to the timestamp
   */
  computeStateHashAt(timestamp: string): string {
    const events = this.getSnapshotAt(timestamp);
    if (events.length === 0) {
      return 'EMPTY_STATE';
    }

    const lastEvent = events[events.length - 1];
    if (lastEvent === undefined) {
      return 'EMPTY_STATE';
    }
    return computeEventHash(lastEvent);
  }

  /**
   * Gets events filtered for replay.
   */
  private getEventsForReplay(
    correlationId?: CorrelationId,
    startTime?: string,
    endTime?: string
  ): BaseEvent[] {
    let events: readonly BaseEvent[];

    if (correlationId) {
      events = this.eventStore.getEvents(correlationId);
    } else if (startTime && endTime) {
      events = this.eventStore.getEventsByTimeRange(startTime, endTime);
    } else {
      events = this.eventStore.getAllEvents();
    }

    return [...events];
  }

  /**
   * Checks for pattern violations in event sequences.
   */
  private checkPatternViolations(
    events: readonly BaseEvent[],
    patterns: EventSequencePattern[] = ROI_ENGINE_PATTERNS
  ): EventAnomaly[] {
    const anomalies: EventAnomaly[] = [];

    // Group events by correlation ID
    const eventsByCorrelation = new Map<CorrelationId, BaseEvent[]>();
    for (const event of events) {
      const group = eventsByCorrelation.get(event.correlationId) || [];
      group.push(event);
      eventsByCorrelation.set(event.correlationId, group);
    }

    // Check each correlation group against patterns
    for (const [correlationId, correlationEvents] of eventsByCorrelation) {
      const eventTypes = correlationEvents.map((e) => e.type as EventType);

      for (const pattern of patterns) {
        // Skip patterns with no events defined
        const firstPattern = pattern.pattern[0];
        const lastPattern = pattern.pattern[pattern.pattern.length - 1];
        if (firstPattern === undefined || lastPattern === undefined) continue;

        // Check if this correlation might match this pattern
        const hasStart = eventTypes.includes(firstPattern);
        if (!hasStart) continue;

        // Check for incomplete patterns
        const hasEnd = eventTypes.includes(lastPattern);
        if (hasStart && !hasEnd) {
          // Started but didn't complete
          const startIndex = eventTypes.indexOf(firstPattern);
          anomalies.push({
            type: AnomalyType.MISSING_EVENT,
            eventIndex: startIndex,
            description: `Pattern '${pattern.name}' started but not completed for correlation ${correlationId}`,
            severity: 'MEDIUM',
            context: {
              pattern: pattern.name,
              correlationId,
              expectedEvents: pattern.pattern,
              actualEvents: eventTypes,
            },
          });
        }
      }
    }

    return anomalies;
  }

  /**
   * Sleep utility for timing control.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Creates a deterministic replay that can be used for testing.
 * Ensures all timestamps and IDs are predictable.
 */
export class DeterministicReplayEngine extends ReplayEngine {
  private readonly deterministicTime: Date;
  private timeOffset: number = 0;

  constructor(eventStore: EventStore, eventEmitter?: EventEmitter, baseTime?: Date) {
    super(eventStore, eventEmitter);
    this.deterministicTime = baseTime || new Date('2026-01-01T00:00:00.000Z');
  }

  /**
   * Gets the current deterministic time.
   */
  getCurrentTime(): Date {
    return new Date(this.deterministicTime.getTime() + this.timeOffset);
  }

  /**
   * Advances the deterministic time.
   *
   * @param ms - Milliseconds to advance
   */
  advanceTime(ms: number): void {
    this.timeOffset += ms;
  }

  /**
   * Resets the deterministic time to the base time.
   */
  resetTime(): void {
    this.timeOffset = 0;
  }
}
