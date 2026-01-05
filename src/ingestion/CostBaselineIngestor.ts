/**
 * CostBaselineIngestor
 * Loads cost model snapshots from CostOps (read-only).
 * Performs schema validation, temporal bounds checking, and checksum computation.
 */

import { createHash } from 'crypto';
import {
  CostBaseline,
  CostBaselineSchema,
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

export interface CostBaselineIngestionResult {
  readonly status: IngestionStatus;
  readonly data: CostBaseline | null;
  readonly checksum: SHA256Hash;
  readonly warnings: readonly string[];
  readonly errors: readonly IngestionError[];
  readonly ingestedAt: string;
}

// ============================================================================
// Endpoint Interface (Abstract for mocking)
// ============================================================================

export interface CostOpsEndpoint {
  /**
   * Fetch cost baseline snapshot from CostOps.
   * This is a READ-ONLY operation. The engine never writes to CostOps.
   * Implementations should handle HTTP calls, authentication, etc.
   */
  fetchCostBaseline(baselineId?: string): Promise<unknown>;
}

// ============================================================================
// CostBaselineIngestor Class
// ============================================================================

export class CostBaselineIngestor {
  private readonly endpoint: CostOpsEndpoint;

  constructor(endpoint: CostOpsEndpoint) {
    this.endpoint = endpoint;
  }

  /**
   * Ingest cost baseline from the configured endpoint.
   * Validates against Zod schema, checks temporal bounds, computes checksum.
   * @param baselineId Optional specific baseline ID to fetch
   */
  async ingest(baselineId?: string): Promise<CostBaselineIngestionResult> {
    const warnings: string[] = [];
    const errors: IngestionError[] = [];
    const ingestedAt = new Date().toISOString();

    let rawPayload: unknown;
    try {
      rawPayload = await this.endpoint.fetchCostBaseline(baselineId);
    } catch (error) {
      const ingestionError = new IngestionError(
        `Failed to fetch cost baseline: ${error instanceof Error ? error.message : String(error)}`,
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
    const parseResult = CostBaselineSchema.safeParse(rawPayload);

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

    const data = parseResult.data as CostBaseline;

    // Check temporal bounds using snapshotTimestamp
    const temporalResult = this.checkTemporalBounds(data.snapshotTimestamp, ingestedAt);
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

    // Additional validation: check rate consistency
    const rateWarnings = this.validateRateConsistency(data);
    warnings.push(...rateWarnings);

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
  validatePayload(rawPayload: unknown): CostBaselineIngestionResult {
    const warnings: string[] = [];
    const ingestedAt = new Date().toISOString();

    // Compute checksum of raw payload for audit trail
    const checksum = this.computeChecksum(rawPayload);

    // Validate against Zod schema
    const parseResult = CostBaselineSchema.safeParse(rawPayload);

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

    const data = parseResult.data as CostBaseline;

    // Check temporal bounds
    const temporalResult = this.checkTemporalBounds(data.snapshotTimestamp, ingestedAt);
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

    // Additional validation: check rate consistency
    const rateWarnings = this.validateRateConsistency(data);
    warnings.push(...rateWarnings);

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
          `Cost baseline snapshot timestamp ${dataTimestamp} is in the future (current: ${currentTimestamp})`,
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
        warning: `Cost baseline is stale (${ageHours} hours old). Snapshot timestamp: ${dataTimestamp}`,
      };
    }

    return {};
  }

  /**
   * Validate rate consistency across the baseline.
   * Checks for potential issues in the cost model.
   */
  private validateRateConsistency(data: CostBaseline): string[] {
    const warnings: string[] = [];

    // Check for duplicate role IDs in labor rates
    const roleIds = new Set<string>();
    for (const rate of data.laborRates) {
      if (roleIds.has(rate.roleId)) {
        warnings.push(`Duplicate labor rate for role ${rate.roleId}`);
      }
      roleIds.add(rate.roleId);
    }

    // Check for duplicate resource types in infrastructure costs
    const resourceTypes = new Set<string>();
    for (const cost of data.infrastructureCosts) {
      if (resourceTypes.has(cost.resourceType)) {
        warnings.push(`Duplicate infrastructure cost for resource type ${cost.resourceType}`);
      }
      resourceTypes.add(cost.resourceType);
    }

    // Validate discount rate is reasonable (warn if outside typical range 0.05-0.15)
    if (data.discountRate < 0.05 || data.discountRate > 0.15) {
      warnings.push(
        `Discount rate ${data.discountRate} is outside typical range (5%-15%)`
      );
    }

    // Check overhead factors sum to reasonable values
    for (const overhead of data.overheadFactors) {
      const totalOverhead =
        overhead.directRate + overhead.indirectRate + overhead.sharedServicesRate;
      if (totalOverhead > 1.0) {
        warnings.push(
          `Total overhead rates for cost center ${overhead.costCenterId} exceed 100% (${(totalOverhead * 100).toFixed(1)}%)`
        );
      }
    }

    return warnings;
  }
}
