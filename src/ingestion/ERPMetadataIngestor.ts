/**
 * ERPMetadataIngestor
 * Consumes ERP entity mappings and chart-of-accounts from erp-surface.
 * Performs schema validation, temporal bounds checking, and checksum computation.
 */

import { createHash } from 'crypto';
import {
  ERPMetadata,
  ERPMetadataSchema,
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

export interface ERPMetadataIngestionResult {
  readonly status: IngestionStatus;
  readonly data: ERPMetadata | null;
  readonly checksum: SHA256Hash;
  readonly warnings: readonly string[];
  readonly errors: readonly IngestionError[];
  readonly ingestedAt: string;
}

// ============================================================================
// Endpoint Interface (Abstract for mocking)
// ============================================================================

export interface ERPSurfaceEndpoint {
  /**
   * Fetch ERP metadata from erp-surface.
   * Implementations should handle HTTP calls, authentication, etc.
   */
  fetchERPMetadata(): Promise<unknown>;
}

// ============================================================================
// ERPMetadataIngestor Class
// ============================================================================

export class ERPMetadataIngestor {
  private readonly endpoint: ERPSurfaceEndpoint;

  constructor(endpoint: ERPSurfaceEndpoint) {
    this.endpoint = endpoint;
  }

  /**
   * Ingest ERP metadata from the configured endpoint.
   * Validates against Zod schema, checks temporal bounds, computes checksum.
   */
  async ingest(): Promise<ERPMetadataIngestionResult> {
    const warnings: string[] = [];
    const errors: IngestionError[] = [];
    const ingestedAt = new Date().toISOString();

    let rawPayload: unknown;
    try {
      rawPayload = await this.endpoint.fetchERPMetadata();
    } catch (error) {
      const ingestionError = new IngestionError(
        `Failed to fetch ERP metadata: ${error instanceof Error ? error.message : String(error)}`,
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
    const parseResult = ERPMetadataSchema.safeParse(rawPayload);

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

    const data = parseResult.data as ERPMetadata;

    // Check temporal bounds using extractTimestamp
    const temporalResult = this.checkTemporalBounds(data.extractTimestamp, ingestedAt);
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

    // Additional validation: check for entity hierarchy consistency
    const hierarchyWarnings = this.validateEntityHierarchy(data);
    warnings.push(...hierarchyWarnings);

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
  validatePayload(rawPayload: unknown): ERPMetadataIngestionResult {
    const warnings: string[] = [];
    const ingestedAt = new Date().toISOString();

    // Compute checksum of raw payload for audit trail
    const checksum = this.computeChecksum(rawPayload);

    // Validate against Zod schema
    const parseResult = ERPMetadataSchema.safeParse(rawPayload);

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

    const data = parseResult.data as ERPMetadata;

    // Check temporal bounds
    const temporalResult = this.checkTemporalBounds(data.extractTimestamp, ingestedAt);
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

    // Additional validation: check for entity hierarchy consistency
    const hierarchyWarnings = this.validateEntityHierarchy(data);
    warnings.push(...hierarchyWarnings);

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
          `ERP extract timestamp ${dataTimestamp} is in the future (current: ${currentTimestamp})`,
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
        warning: `ERP metadata is stale (${ageHours} hours old). Extract timestamp: ${dataTimestamp}`,
      };
    }

    return {};
  }

  /**
   * Validate entity hierarchy consistency.
   * Checks that parent references are valid.
   */
  private validateEntityHierarchy(data: ERPMetadata): string[] {
    const warnings: string[] = [];
    const entityIds = new Set(data.entities.map((e) => e.erpEntityId));

    for (const entity of data.entities) {
      if (entity.parentId !== null && !entityIds.has(entity.parentId)) {
        warnings.push(
          `Entity ${entity.erpEntityId} references non-existent parent ${entity.parentId}`
        );
      }
    }

    // Check cost center hierarchy
    const costCenterIds = new Set(data.costCenters.map((cc) => cc.costCenterId));
    for (const costCenter of data.costCenters) {
      if (costCenter.parentCostCenterId !== null && !costCenterIds.has(costCenter.parentCostCenterId)) {
        warnings.push(
          `Cost center ${costCenter.costCenterId} references non-existent parent ${costCenter.parentCostCenterId}`
        );
      }
    }

    return warnings;
  }
}
