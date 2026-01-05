/**
 * Audit Trail Generator
 * Produces complete provenance records for financial calculations.
 *
 * SPARC: Ensures CFO-grade auditability with cryptographic verification.
 */

import * as crypto from 'crypto';
import { AuditRecord } from '../contracts';

// ============================================================================
// Types
// ============================================================================

export interface AuditStep {
  readonly operation: string;
  readonly inputData: unknown;
  readonly outputData: unknown;
  readonly details?: Record<string, unknown>;
}

export interface AuditTrailGeneratorOptions {
  readonly includeFullData?: boolean;
  readonly maxDetailSize?: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Computes SHA-256 hash of any data structure
 */
function computeSHA256(data: unknown): string {
  const json = typeof data === 'string' ? data : JSON.stringify(data, null, 0);
  return crypto.createHash('sha256').update(json, 'utf8').digest('hex');
}

/**
 * Truncates details object to maximum size
 */
function truncateDetails(
  details: Record<string, unknown>,
  maxSize: number
): Record<string, unknown> {
  const json = JSON.stringify(details);
  if (json.length <= maxSize) {
    return details;
  }

  // Create a summary version
  return {
    _truncated: true,
    _originalSize: json.length,
    _summary: Object.keys(details).slice(0, 10),
  };
}

// ============================================================================
// Audit Trail Generator Class
// ============================================================================

export class AuditTrailGenerator {
  private readonly records: AuditRecord[] = [];
  private stepCounter: number = 0;
  private readonly options: Required<AuditTrailGeneratorOptions>;

  constructor(options: AuditTrailGeneratorOptions = {}) {
    this.options = {
      includeFullData: options.includeFullData ?? false,
      maxDetailSize: options.maxDetailSize ?? 10000,
    };
  }

  /**
   * Records a transformation step in the audit trail
   */
  public recordStep(step: AuditStep): AuditRecord {
    this.stepCounter++;

    const inputHash = computeSHA256(step.inputData);
    const outputHash = computeSHA256(step.outputData);

    let details: Record<string, unknown> = step.details || {};

    // Optionally include data summaries
    if (this.options.includeFullData) {
      details = {
        ...details,
        inputDataSummary: this.summarizeData(step.inputData),
        outputDataSummary: this.summarizeData(step.outputData),
      };
    }

    // Truncate if needed
    details = truncateDetails(details, this.options.maxDetailSize);

    const record: AuditRecord = {
      stepNumber: this.stepCounter,
      timestamp: new Date().toISOString(),
      operation: step.operation,
      inputHash,
      outputHash,
      details,
    };

    this.records.push(record);
    return record;
  }

  /**
   * Records the ingestion phase
   */
  public recordIngestion(
    sourceSystem: string,
    rawData: unknown,
    normalizedData: unknown
  ): AuditRecord {
    return this.recordStep({
      operation: 'INGESTION',
      inputData: rawData,
      outputData: normalizedData,
      details: {
        sourceSystem,
        phase: 'ingestion',
        description: 'Raw data ingested and parsed from source system',
      },
    });
  }

  /**
   * Records the normalization phase
   */
  public recordNormalization(
    rawRecords: unknown,
    canonicalRecords: unknown,
    recordCount: number
  ): AuditRecord {
    return this.recordStep({
      operation: 'NORMALIZATION',
      inputData: rawRecords,
      outputData: canonicalRecords,
      details: {
        phase: 'normalization',
        recordCount,
        description: 'Records normalized to canonical decision format',
      },
    });
  }

  /**
   * Records the delta calculation phase
   */
  public recordDeltaCalculation(
    normalizedData: unknown,
    deltaResults: unknown,
    calculationMethod: string
  ): AuditRecord {
    return this.recordStep({
      operation: 'DELTA_CALCULATION',
      inputData: normalizedData,
      outputData: deltaResults,
      details: {
        phase: 'calculation',
        calculationMethod,
        description: 'Financial deltas calculated with risk and time adjustments',
      },
    });
  }

  /**
   * Records the risk adjustment phase
   */
  public recordRiskAdjustment(
    grossDeltas: unknown,
    riskAdjustedDeltas: unknown,
    riskFactors: Record<string, number>
  ): AuditRecord {
    return this.recordStep({
      operation: 'RISK_ADJUSTMENT',
      inputData: grossDeltas,
      outputData: riskAdjustedDeltas,
      details: {
        phase: 'risk_adjustment',
        riskFactors,
        description: 'Deltas adjusted for risk and uncertainty factors',
      },
    });
  }

  /**
   * Records the time value adjustment phase
   */
  public recordTimeValueAdjustment(
    riskAdjustedDeltas: unknown,
    presentValueDeltas: unknown,
    discountRate: number,
    horizonMonths: number
  ): AuditRecord {
    return this.recordStep({
      operation: 'TIME_VALUE_ADJUSTMENT',
      inputData: riskAdjustedDeltas,
      outputData: presentValueDeltas,
      details: {
        phase: 'time_value',
        discountRate,
        horizonMonths,
        description: 'Deltas discounted to present value',
      },
    });
  }

  /**
   * Records the attribution phase
   */
  public recordAttribution(
    deltaResults: unknown,
    attributionResults: unknown,
    attributionMethod: string
  ): AuditRecord {
    return this.recordStep({
      operation: 'ATTRIBUTION',
      inputData: deltaResults,
      outputData: attributionResults,
      details: {
        phase: 'attribution',
        attributionMethod,
        description: 'Deltas attributed to cost centers and GL accounts',
      },
    });
  }

  /**
   * Records the confidence interval calculation phase
   */
  public recordConfidenceCalculation(
    deltaResults: unknown,
    confidenceResults: unknown,
    confidenceLevels: readonly number[]
  ): AuditRecord {
    return this.recordStep({
      operation: 'CONFIDENCE_CALCULATION',
      inputData: deltaResults,
      outputData: confidenceResults,
      details: {
        phase: 'confidence',
        confidenceLevels: [...confidenceLevels],
        description: 'Confidence intervals calculated for projections',
      },
    });
  }

  /**
   * Records the artifact assembly phase
   */
  public recordArtifactAssembly(
    allInputs: unknown,
    artifact: unknown,
    artifactId: string
  ): AuditRecord {
    return this.recordStep({
      operation: 'ARTIFACT_ASSEMBLY',
      inputData: allInputs,
      outputData: artifact,
      details: {
        phase: 'assembly',
        artifactId,
        description: 'Financial artifact assembled from calculation results',
      },
    });
  }

  /**
   * Records the validation phase
   */
  public recordValidation(
    artifact: unknown,
    validationResult: unknown,
    passed: boolean
  ): AuditRecord {
    return this.recordStep({
      operation: 'VALIDATION',
      inputData: artifact,
      outputData: validationResult,
      details: {
        phase: 'validation',
        passed,
        description: passed
          ? 'Artifact passed schema validation'
          : 'Artifact failed schema validation',
      },
    });
  }

  /**
   * Records a custom operation
   */
  public recordCustomOperation(
    operation: string,
    inputData: unknown,
    outputData: unknown,
    details?: Record<string, unknown>
  ): AuditRecord {
    return this.recordStep({
      operation,
      inputData,
      outputData,
      details: {
        phase: 'custom',
        ...details,
      },
    });
  }

  /**
   * Returns all recorded audit records
   */
  public getAuditTrail(): readonly AuditRecord[] {
    return [...this.records];
  }

  /**
   * Returns the current step count
   */
  public getStepCount(): number {
    return this.stepCounter;
  }

  /**
   * Resets the audit trail
   */
  public reset(): void {
    this.records.length = 0;
    this.stepCounter = 0;
  }

  /**
   * Computes a checksum for the entire audit trail
   */
  public computeTrailChecksum(): string {
    return computeSHA256(this.records);
  }

  /**
   * Verifies the integrity of the audit trail
   * Checks that step numbers are sequential and timestamps are ordered
   */
  public verifyIntegrity(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (let i = 0; i < this.records.length; i++) {
      const record = this.records[i]!;

      // Check step number
      if (record.stepNumber !== i + 1) {
        errors.push(
          `Step ${i + 1} has incorrect step number: ${record.stepNumber}`
        );
      }

      // Check timestamp ordering
      if (i > 0) {
        const prevRecord = this.records[i - 1]!;
        const prevTimestamp = new Date(prevRecord.timestamp);
        const currTimestamp = new Date(record.timestamp);
        if (currTimestamp < prevTimestamp) {
          errors.push(
            `Step ${record.stepNumber} has timestamp before previous step`
          );
        }
      }

      // Verify hash format
      if (!/^[a-f0-9]{64}$/.test(record.inputHash)) {
        errors.push(`Step ${record.stepNumber} has invalid input hash format`);
      }
      if (!/^[a-f0-9]{64}$/.test(record.outputHash)) {
        errors.push(`Step ${record.stepNumber} has invalid output hash format`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private summarizeData(data: unknown): Record<string, unknown> {
    if (data === null || data === undefined) {
      return { type: 'null', value: null };
    }

    if (Array.isArray(data)) {
      return {
        type: 'array',
        length: data.length,
        firstItem: data.length > 0 ? typeof data[0] : null,
      };
    }

    if (typeof data === 'object') {
      const keys = Object.keys(data);
      return {
        type: 'object',
        keyCount: keys.length,
        keys: keys.slice(0, 10),
      };
    }

    return {
      type: typeof data,
      preview: String(data).slice(0, 100),
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createAuditTrailGenerator(
  options?: AuditTrailGeneratorOptions
): AuditTrailGenerator {
  return new AuditTrailGenerator(options);
}

// ============================================================================
// Standalone Hash Function
// ============================================================================

export function computeHash(data: unknown): string {
  return computeSHA256(data);
}
