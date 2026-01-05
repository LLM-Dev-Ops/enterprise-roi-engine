/**
 * SimulationIngestor
 * Validates and deserializes simulation output from the Agentics engine.
 * Performs schema validation, temporal bounds checking, and checksum computation.
 */

import { createHash } from 'crypto';
import {
  SimulationOutput,
  SimulationOutputSchema,
  IngestionError,
  IngestionStatus,
  SHA256Hash,
} from '../contracts';

// ============================================================================
// Constants
// ============================================================================

const STALE_DATA_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// ============================================================================
// Result Types
// ============================================================================

export interface SimulationIngestionResult {
  readonly status: IngestionStatus;
  readonly data: SimulationOutput | null;
  readonly checksum: SHA256Hash;
  readonly warnings: readonly string[];
  readonly errors: readonly IngestionError[];
  readonly ingestedAt: string;
}

// ============================================================================
// Endpoint Interface (Abstract for mocking)
// ============================================================================

export interface SimulationEndpoint {
  /**
   * Fetch raw simulation output from the Agentics engine.
   * Implementations should handle HTTP calls, authentication, etc.
   */
  fetchSimulationOutput(): Promise<unknown>;
}

// ============================================================================
// SimulationIngestor Class
// ============================================================================

export class SimulationIngestor {
  private readonly endpoint: SimulationEndpoint;

  constructor(endpoint: SimulationEndpoint) {
    this.endpoint = endpoint;
  }

  /**
   * Ingest simulation output from the configured endpoint.
   * Validates against Zod schema, checks temporal bounds, computes checksum.
   */
  async ingest(): Promise<SimulationIngestionResult> {
    const warnings: string[] = [];
    const errors: IngestionError[] = [];
    const ingestedAt = new Date().toISOString();

    let rawPayload: unknown;
    try {
      rawPayload = await this.endpoint.fetchSimulationOutput();
    } catch (error) {
      const ingestionError = new IngestionError(
        `Failed to fetch simulation output: ${error instanceof Error ? error.message : String(error)}`,
        'FETCH_ERROR',
        error
      );
      return {
        status: IngestionStatus.FAILED,
        data: null,
        checksum: '',
        warnings: [],
        errors: [ingestionError],
        ingestedAt,
      };
    }

    // Compute checksum of raw payload for audit trail
    const checksum = this.computeChecksum(rawPayload);

    // Validate against Zod schema
    const parseResult = SimulationOutputSchema.safeParse(rawPayload);

    if (!parseResult.success) {
      const validationErrors = parseResult.error.errors.map(
        (err) =>
          new IngestionError(
            `Schema validation failed at ${err.path.join('.')}: ${err.message}`,
            'SCHEMA_VALIDATION_ERROR',
            { path: err.path, code: err.code }
          )
      );
      return {
        status: IngestionStatus.FAILED,
        data: null,
        checksum,
        warnings: [],
        errors: validationErrors,
        ingestedAt,
      };
    }

    const data = parseResult.data as SimulationOutput;

    // Check temporal bounds
    const temporalResult = this.checkTemporalBounds(data.metadata.timestamp, ingestedAt);
    if (temporalResult.error) {
      errors.push(temporalResult.error);
      return {
        status: IngestionStatus.FAILED,
        data: null,
        checksum,
        warnings: [],
        errors,
        ingestedAt,
      };
    }
    if (temporalResult.warning) {
      warnings.push(temporalResult.warning);
    }

    return {
      status: warnings.length > 0 ? IngestionStatus.PARTIAL : IngestionStatus.SUCCESS,
      data,
      checksum,
      warnings,
      errors: [],
      ingestedAt,
    };
  }

  /**
   * Validate raw payload directly without fetching from endpoint.
   * Useful for testing or when data is already available.
   */
  validatePayload(rawPayload: unknown): SimulationIngestionResult {
    const warnings: string[] = [];
    const ingestedAt = new Date().toISOString();

    // Compute checksum of raw payload for audit trail
    const checksum = this.computeChecksum(rawPayload);

    // Validate against Zod schema
    const parseResult = SimulationOutputSchema.safeParse(rawPayload);

    if (!parseResult.success) {
      const validationErrors = parseResult.error.errors.map(
        (err) =>
          new IngestionError(
            `Schema validation failed at ${err.path.join('.')}: ${err.message}`,
            'SCHEMA_VALIDATION_ERROR',
            { path: err.path, code: err.code }
          )
      );
      return {
        status: IngestionStatus.FAILED,
        data: null,
        checksum,
        warnings: [],
        errors: validationErrors,
        ingestedAt,
      };
    }

    const data = parseResult.data as SimulationOutput;

    // Check temporal bounds
    const temporalResult = this.checkTemporalBounds(data.metadata.timestamp, ingestedAt);
    if (temporalResult.error) {
      return {
        status: IngestionStatus.FAILED,
        data: null,
        checksum,
        warnings: [],
        errors: [temporalResult.error],
        ingestedAt,
      };
    }
    if (temporalResult.warning) {
      warnings.push(temporalResult.warning);
    }

    return {
      status: warnings.length > 0 ? IngestionStatus.PARTIAL : IngestionStatus.SUCCESS,
      data,
      checksum,
      warnings,
      errors: [],
      ingestedAt,
    };
  }

  /**
   * Compute SHA-256 checksum of the raw payload.
   */
  private computeChecksum(payload: unknown): SHA256Hash {
    const serialized = JSON.stringify(payload);
    return createHash('sha256').update(serialized).digest('hex');
  }

  /**
   * Check temporal bounds of the data.
   * Rejects future timestamps, warns on stale data (>24h old).
   */
  private checkTemporalBounds(
    dataTimestamp: string,
    currentTimestamp: string
  ): { error?: IngestionError; warning?: string } {
    const dataTime = new Date(dataTimestamp).getTime();
    const currentTime = new Date(currentTimestamp).getTime();

    // Reject future timestamps
    if (dataTime > currentTime) {
      return {
        error: new IngestionError(
          `Data timestamp ${dataTimestamp} is in the future (current: ${currentTimestamp})`,
          'FUTURE_TIMESTAMP_ERROR',
          { dataTimestamp, currentTimestamp }
        ),
      };
    }

    // Warn on stale data
    const ageMs = currentTime - dataTime;
    if (ageMs > STALE_DATA_THRESHOLD_MS) {
      const ageHours = Math.round(ageMs / (60 * 60 * 1000));
      return {
        warning: `Simulation data is stale (${ageHours} hours old). Timestamp: ${dataTimestamp}`,
      };
    }

    return {};
  }
}
