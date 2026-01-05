/**
 * Schema Validator
 * Final-gate validation ensuring schema conformance for financial artifacts.
 *
 * SPARC: Ensures CFO-grade artifacts meet strict schema requirements.
 */

import { ZodIssue } from 'zod';
import {
  FinancialArtifact,
  FinancialArtifactSchema,
  FinancialSummary,
  FinancialSummarySchema,
  InputManifest,
  InputManifestSchema,
  PeriodDetail,
  PeriodDetailSchema,
  AttributionRecord,
  AttributionRecordSchema,
  SensitivityTable,
  SensitivityTableSchema,
  AuditRecord,
  AuditRecordSchema,
  GovernancePayloadSchema,
} from '../contracts';

import { ArtifactBundle, ArtifactType } from '../contracts';

// ============================================================================
// Types
// ============================================================================

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly ValidationError[];
  readonly warnings: readonly ValidationWarning[];
}

export interface ValidationError {
  readonly path: string;
  readonly message: string;
  readonly code: string;
  readonly expected?: string;
  readonly received?: string;
}

export interface ValidationWarning {
  readonly path: string;
  readonly message: string;
  readonly severity: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface SchemaValidatorOptions {
  readonly strictMode?: boolean;
  readonly validateChecksums?: boolean;
  readonly warnOnMissingOptionals?: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Converts ZodIssue to ValidationError
 */
function zodIssueToValidationError(issue: ZodIssue): ValidationError {
  const base: ValidationError = {
    path: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  };

  if ('expected' in issue && issue.expected !== undefined) {
    (base as { expected?: string }).expected = String(issue.expected);
  }
  if ('received' in issue && issue.received !== undefined) {
    (base as { received?: string }).received = String(issue.received);
  }

  return base;
}

/**
 * Validates checksum format (64-character hex string)
 */
function isValidChecksum(hash: string): boolean {
  return /^[a-f0-9]{64}$/.test(hash);
}

/**
 * Validates UUID format
 */
function isValidUUID(uuid: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
}

/**
 * Validates ISO8601 datetime format
 */
function isValidISO8601(datetime: string): boolean {
  const date = new Date(datetime);
  return !isNaN(date.getTime()) && datetime.includes('T');
}

// ============================================================================
// Schema Validator Class
// ============================================================================

export class SchemaValidator {
  private readonly options: Required<SchemaValidatorOptions>;

  constructor(options: SchemaValidatorOptions = {}) {
    this.options = {
      strictMode: options.strictMode ?? true,
      validateChecksums: options.validateChecksums ?? true,
      warnOnMissingOptionals: options.warnOnMissingOptionals ?? false,
    };
  }

  /**
   * Validates a complete FinancialArtifact
   */
  public validateFinancialArtifact(artifact: unknown): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Schema validation using Zod
    const schemaResult = FinancialArtifactSchema.safeParse(artifact);
    if (!schemaResult.success) {
      errors.push(...schemaResult.error.issues.map(zodIssueToValidationError));
      return { valid: false, errors, warnings };
    }

    const validArtifact = schemaResult.data as FinancialArtifact;

    // Additional semantic validations
    this.validateArtifactSemantics(validArtifact, errors, warnings);

    // Checksum validations
    if (this.options.validateChecksums) {
      this.validateChecksums(validArtifact, errors, warnings);
    }

    // Period validations
    this.validatePeriodConsistency(validArtifact.periodDetails, errors, warnings);

    // Attribution validations
    this.validateAttributionConsistency(validArtifact.attributions, errors, warnings);

    // Audit trail validations
    this.validateAuditTrail(validArtifact.auditTrail, errors, warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validates a FinancialSummary
   */
  public validateFinancialSummary(summary: unknown): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const schemaResult = FinancialSummarySchema.safeParse(summary);
    if (!schemaResult.success) {
      errors.push(...schemaResult.error.issues.map(zodIssueToValidationError));
      return { valid: false, errors, warnings };
    }

    const validSummary = schemaResult.data as FinancialSummary;

    // Validate ROI calculation consistency
    if (validSummary.roi !== 0) {
      const expectedROI = parseFloat(validSummary.netBenefit.amount) /
        parseFloat(validSummary.totalInvestment.amount);
      const roiDiff = Math.abs(validSummary.roi - expectedROI);
      if (roiDiff > 0.01) {
        warnings.push({
          path: 'summary.roi',
          message: `ROI value ${validSummary.roi} differs from calculated value ${expectedROI.toFixed(4)}`,
          severity: 'MEDIUM',
        });
      }
    }

    // Validate confidence interval bounds
    const ci = validSummary.confidenceInterval;
    if (parseFloat(ci.lowerBound) > parseFloat(ci.upperBound)) {
      errors.push({
        path: 'summary.confidenceInterval',
        message: 'Lower bound exceeds upper bound',
        code: 'invalid_bounds',
      });
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validates an InputManifest
   */
  public validateInputManifest(manifest: unknown): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const schemaResult = InputManifestSchema.safeParse(manifest);
    if (!schemaResult.success) {
      errors.push(...schemaResult.error.issues.map(zodIssueToValidationError));
      return { valid: false, errors, warnings };
    }

    const validManifest = schemaResult.data as InputManifest;

    // Validate checksum formats
    if (this.options.validateChecksums) {
      if (!isValidChecksum(validManifest.simulationChecksum)) {
        errors.push({
          path: 'inputManifest.simulationChecksum',
          message: 'Invalid SHA-256 checksum format',
          code: 'invalid_checksum',
        });
      }
      if (!isValidChecksum(validManifest.erpMetadataChecksum)) {
        errors.push({
          path: 'inputManifest.erpMetadataChecksum',
          message: 'Invalid SHA-256 checksum format',
          code: 'invalid_checksum',
        });
      }
      if (!isValidChecksum(validManifest.costBaselineChecksum)) {
        errors.push({
          path: 'inputManifest.costBaselineChecksum',
          message: 'Invalid SHA-256 checksum format',
          code: 'invalid_checksum',
        });
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validates a PeriodDetail
   */
  public validatePeriodDetail(period: unknown): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const schemaResult = PeriodDetailSchema.safeParse(period);
    if (!schemaResult.success) {
      errors.push(...schemaResult.error.issues.map(zodIssueToValidationError));
      return { valid: false, errors, warnings };
    }

    return { valid: true, errors, warnings };
  }

  /**
   * Validates an AttributionRecord
   */
  public validateAttributionRecord(attribution: unknown): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const schemaResult = AttributionRecordSchema.safeParse(attribution);
    if (!schemaResult.success) {
      errors.push(...schemaResult.error.issues.map(zodIssueToValidationError));
      return { valid: false, errors, warnings };
    }

    const validAttribution = schemaResult.data as AttributionRecord;

    // Validate allocation percentage bounds
    if (validAttribution.allocationPercentage < 0 || validAttribution.allocationPercentage > 1) {
      errors.push({
        path: 'attributionRecord.allocationPercentage',
        message: 'Allocation percentage must be between 0 and 1',
        code: 'invalid_range',
      });
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validates a SensitivityTable
   */
  public validateSensitivityTable(table: unknown): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const schemaResult = SensitivityTableSchema.safeParse(table);
    if (!schemaResult.success) {
      errors.push(...schemaResult.error.issues.map(zodIssueToValidationError));
      return { valid: false, errors, warnings };
    }

    const validTable = schemaResult.data as SensitivityTable;

    // Validate tornado order matches factors
    const factorNames = new Set(validTable.factors.map(f => f.factorName));
    for (const name of validTable.tornadoOrder) {
      if (!factorNames.has(name)) {
        errors.push({
          path: 'sensitivityTable.tornadoOrder',
          message: `Factor "${name}" in tornado order not found in factors`,
          code: 'missing_factor',
        });
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validates an AuditRecord
   */
  public validateAuditRecord(record: unknown): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const schemaResult = AuditRecordSchema.safeParse(record);
    if (!schemaResult.success) {
      errors.push(...schemaResult.error.issues.map(zodIssueToValidationError));
      return { valid: false, errors, warnings };
    }

    const validRecord = schemaResult.data as AuditRecord;

    // Validate hash formats
    if (this.options.validateChecksums) {
      if (!isValidChecksum(validRecord.inputHash)) {
        errors.push({
          path: 'auditRecord.inputHash',
          message: 'Invalid SHA-256 hash format',
          code: 'invalid_hash',
        });
      }
      if (!isValidChecksum(validRecord.outputHash)) {
        errors.push({
          path: 'auditRecord.outputHash',
          message: 'Invalid SHA-256 hash format',
          code: 'invalid_hash',
        });
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validates a GovernancePayload
   */
  public validateGovernancePayload(payload: unknown): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const schemaResult = GovernancePayloadSchema.safeParse(payload);
    if (!schemaResult.success) {
      errors.push(...schemaResult.error.issues.map(zodIssueToValidationError));
      return { valid: false, errors, warnings };
    }

    return { valid: true, errors, warnings };
  }

  /**
   * Validates an ArtifactBundle
   */
  public validateArtifactBundle(bundle: unknown): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (!bundle || typeof bundle !== 'object') {
      errors.push({
        path: 'bundle',
        message: 'Bundle must be an object',
        code: 'invalid_type',
      });
      return { valid: false, errors, warnings };
    }

    const b = bundle as ArtifactBundle;

    // Validate bundle ID
    if (!isValidUUID(b.bundleId)) {
      errors.push({
        path: 'bundle.bundleId',
        message: 'Invalid UUID format',
        code: 'invalid_uuid',
      });
    }

    // Validate timestamp
    if (!isValidISO8601(b.generationTimestamp)) {
      errors.push({
        path: 'bundle.generationTimestamp',
        message: 'Invalid ISO8601 timestamp format',
        code: 'invalid_timestamp',
      });
    }

    // Validate checksum
    if (this.options.validateChecksums && !isValidChecksum(b.checksum)) {
      errors.push({
        path: 'bundle.checksum',
        message: 'Invalid SHA-256 checksum format',
        code: 'invalid_checksum',
      });
    }

    // Validate each artifact
    for (let i = 0; i < b.artifacts.length; i++) {
      const artifact = b.artifacts[i]!;
      if (artifact.artifactType === ArtifactType.FINANCIAL_ARTIFACT) {
        const result = this.validateFinancialArtifact(artifact.content);
        if (!result.valid) {
          errors.push(...result.errors.map(e => ({
            ...e,
            path: `bundle.artifacts[${i}].${e.path}`,
          })));
        }
        warnings.push(...result.warnings.map(w => ({
          ...w,
          path: `bundle.artifacts[${i}].${w.path}`,
        })));
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  // ============================================================================
  // Private Validation Methods
  // ============================================================================

  private validateArtifactSemantics(
    artifact: FinancialArtifact,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    // Validate artifact ID
    if (!isValidUUID(artifact.artifactId)) {
      errors.push({
        path: 'artifactId',
        message: 'Invalid UUID format',
        code: 'invalid_uuid',
      });
    }

    // Validate timestamp
    if (!isValidISO8601(artifact.generatedAt)) {
      errors.push({
        path: 'generatedAt',
        message: 'Invalid ISO8601 timestamp format',
        code: 'invalid_timestamp',
      });
    }

    // Validate engine version format
    if (!/^\d+\.\d+\.\d+/.test(artifact.engineVersion)) {
      warnings.push({
        path: 'engineVersion',
        message: 'Engine version should follow semver format',
        severity: 'LOW',
      });
    }

    // Validate human readable summary is not empty
    if (!artifact.humanReadableSummary.trim()) {
      errors.push({
        path: 'humanReadableSummary',
        message: 'Human readable summary cannot be empty',
        code: 'empty_string',
      });
    }
  }

  private validateChecksums(
    artifact: FinancialArtifact,
    errors: ValidationError[],
    _warnings: ValidationWarning[]
  ): void {
    const manifest = artifact.inputManifest;

    if (!isValidChecksum(manifest.simulationChecksum)) {
      errors.push({
        path: 'inputManifest.simulationChecksum',
        message: 'Invalid SHA-256 checksum format',
        code: 'invalid_checksum',
      });
    }

    if (!isValidChecksum(manifest.erpMetadataChecksum)) {
      errors.push({
        path: 'inputManifest.erpMetadataChecksum',
        message: 'Invalid SHA-256 checksum format',
        code: 'invalid_checksum',
      });
    }

    if (!isValidChecksum(manifest.costBaselineChecksum)) {
      errors.push({
        path: 'inputManifest.costBaselineChecksum',
        message: 'Invalid SHA-256 checksum format',
        code: 'invalid_checksum',
      });
    }
  }

  private validatePeriodConsistency(
    periods: readonly PeriodDetail[],
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    if (periods.length === 0) {
      warnings.push({
        path: 'periodDetails',
        message: 'No period details provided',
        severity: 'MEDIUM',
      });
      return;
    }

    // Check period numbers are sequential
    for (let i = 0; i < periods.length; i++) {
      const period = periods[i]!;
      if (period.periodNumber !== i + 1) {
        errors.push({
          path: `periodDetails[${i}].periodNumber`,
          message: `Expected period number ${i + 1}, got ${period.periodNumber}`,
          code: 'invalid_sequence',
        });
      }
    }

    // Check dates are sequential
    for (let i = 1; i < periods.length; i++) {
      const prevPeriod = periods[i - 1]!;
      const currPeriod = periods[i]!;
      const prevEnd = new Date(prevPeriod.periodEnd);
      const currStart = new Date(currPeriod.periodStart);
      if (currStart < prevEnd) {
        warnings.push({
          path: `periodDetails[${i}]`,
          message: 'Period start date overlaps with previous period end',
          severity: 'HIGH',
        });
      }
    }

    // Check discount factors are decreasing
    for (let i = 1; i < periods.length; i++) {
      const currPeriod = periods[i]!;
      const prevPeriod = periods[i - 1]!;
      if (currPeriod.discountFactor > prevPeriod.discountFactor) {
        warnings.push({
          path: `periodDetails[${i}].discountFactor`,
          message: 'Discount factor should decrease over time',
          severity: 'MEDIUM',
        });
      }
    }
  }

  private validateAttributionConsistency(
    attributions: readonly AttributionRecord[],
    _errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    if (attributions.length === 0) {
      warnings.push({
        path: 'attributions',
        message: 'No attribution records provided',
        severity: 'MEDIUM',
      });
      return;
    }

    // Group by decision ID and check allocation percentages
    const byDecision = new Map<string, number>();
    for (const attr of attributions) {
      const current = byDecision.get(attr.decisionId) || 0;
      byDecision.set(attr.decisionId, current + attr.allocationPercentage);
    }

    // Check that allocations sum reasonably close to 1.0
    byDecision.forEach((total, decisionId) => {
      if (Math.abs(total - 1.0) > 0.01 && total > 0) {
        warnings.push({
          path: 'attributions',
          message: `Allocations for decision ${decisionId} sum to ${total.toFixed(4)}, expected 1.0`,
          severity: 'MEDIUM',
        });
      }
    });
  }

  private validateAuditTrail(
    auditTrail: readonly AuditRecord[],
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    if (auditTrail.length === 0) {
      warnings.push({
        path: 'auditTrail',
        message: 'No audit trail records provided',
        severity: 'HIGH',
      });
      return;
    }

    // Check step numbers are sequential
    for (let i = 0; i < auditTrail.length; i++) {
      const record = auditTrail[i]!;
      if (record.stepNumber !== i + 1) {
        errors.push({
          path: `auditTrail[${i}].stepNumber`,
          message: `Expected step number ${i + 1}, got ${record.stepNumber}`,
          code: 'invalid_sequence',
        });
      }
    }

    // Check timestamps are non-decreasing
    for (let i = 1; i < auditTrail.length; i++) {
      const prevRecord = auditTrail[i - 1]!;
      const currRecord = auditTrail[i]!;
      const prev = new Date(prevRecord.timestamp);
      const curr = new Date(currRecord.timestamp);
      if (curr < prev) {
        errors.push({
          path: `auditTrail[${i}].timestamp`,
          message: 'Audit trail timestamps must be non-decreasing',
          code: 'invalid_sequence',
        });
      }
    }

    // Validate hash formats
    if (this.options.validateChecksums) {
      for (let i = 0; i < auditTrail.length; i++) {
        const record = auditTrail[i]!;
        if (!isValidChecksum(record.inputHash)) {
          errors.push({
            path: `auditTrail[${i}].inputHash`,
            message: 'Invalid SHA-256 hash format',
            code: 'invalid_hash',
          });
        }
        if (!isValidChecksum(record.outputHash)) {
          errors.push({
            path: `auditTrail[${i}].outputHash`,
            message: 'Invalid SHA-256 hash format',
            code: 'invalid_hash',
          });
        }
      }
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createSchemaValidator(options?: SchemaValidatorOptions): SchemaValidator {
  return new SchemaValidator(options);
}

// ============================================================================
// Validation Error Class
// ============================================================================

export class SchemaValidationError extends Error {
  public readonly errors: readonly ValidationError[];
  public readonly warnings: readonly ValidationWarning[];

  constructor(result: ValidationResult) {
    const message = result.errors.map(e => `${e.path}: ${e.message}`).join('; ');
    super(`Schema validation failed: ${message}`);
    this.name = 'SchemaValidationError';
    this.errors = result.errors;
    this.warnings = result.warnings;
  }
}
