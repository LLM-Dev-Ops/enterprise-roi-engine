/**
 * Contract Validation Module
 * Provides strict JSON Schema validation using Ajv in strict mode.
 * This is the single boundary for all incoming ROI request validation.
 */

import Ajv, { ValidateFunction, ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import { createHash } from 'crypto';

import roiRequestSchema from './schemas/roi-v1-request.schema.json';

// ============================================================================
// Validation Error Types
// ============================================================================

/**
 * Structured validation error with detailed path information.
 */
export interface ContractValidationError {
  readonly path: string;
  readonly message: string;
  readonly keyword: string;
  readonly params: Record<string, unknown>;
}

/**
 * Result of contract validation.
 */
export interface ContractValidationResult {
  readonly valid: boolean;
  readonly errors: readonly ContractValidationError[];
  readonly schemaId: string;
  readonly schemaVersion: string;
  readonly validatedAt: string;
}

/**
 * Execution proof demonstrating platform participation.
 */
export interface ExecutionProof {
  readonly proofId: string;
  readonly platformId: string;
  readonly platformVersion: string;
  readonly contractSchemaId: string;
  readonly contractSchemaVersion: string;
  readonly inputHash: string;
  readonly validationTimestamp: string;
  readonly validationDurationMs: number;
  readonly executionTimestamp: string;
  readonly executionDurationMs?: number;
  readonly outputHash?: string;
  readonly signature: string;
}

// ============================================================================
// Contract Validator
// ============================================================================

/**
 * Contract validator using Ajv in strict mode.
 * Enforces JSON Schema validation at the request entry boundary.
 */
export class ContractValidator {
  private readonly ajv: Ajv;
  private readonly validateROIRequest: ValidateFunction;
  private readonly schemaId: string;
  private readonly schemaVersion: string;
  private readonly platformId: string;
  private readonly platformVersion: string;

  constructor(config?: {
    platformId?: string;
    platformVersion?: string;
  }) {
    // Initialize Ajv in strict mode with all validations enabled
    // Using draft-07 compatible settings
    this.ajv = new Ajv({
      strict: true,
      allErrors: true,
      verbose: true,
      validateFormats: true,
    });

    // Add format validators (uuid, date-time, etc.)
    addFormats(this.ajv);

    // Compile the ROI request schema (cast to unknown first to avoid type issues)
    this.validateROIRequest = this.ajv.compile(roiRequestSchema as unknown as object);

    this.schemaId = (roiRequestSchema as { $id: string }).$id;
    this.schemaVersion = '1.0.0';
    this.platformId = config?.platformId ?? 'enterprise-roi-engine';
    this.platformVersion = config?.platformVersion ?? '1.0.0';
  }

  /**
   * Validates an incoming ROI request against the contract schema.
   * This is the single validation boundary - no bypass paths allowed.
   *
   * @param data The request data to validate
   * @returns Validation result with detailed errors if invalid
   */
  validate(data: unknown): ContractValidationResult {
    const validatedAt = new Date().toISOString();

    const valid = this.validateROIRequest(data);

    const errors: ContractValidationError[] = valid
      ? []
      : this.formatErrors(this.validateROIRequest.errors ?? []);

    return {
      valid,
      errors,
      schemaId: this.schemaId,
      schemaVersion: this.schemaVersion,
      validatedAt,
    };
  }

  /**
   * Validates request and throws if invalid.
   * Use this at the entry boundary to reject invalid requests immediately.
   *
   * @param data The request data to validate
   * @throws ContractValidationException if validation fails
   */
  validateOrThrow(data: unknown): void {
    const result = this.validate(data);

    if (!result.valid) {
      throw new ContractValidationException(result);
    }
  }

  /**
   * Creates execution proof for a validated request.
   * This proof demonstrates platform participation as defined by the contracts.
   *
   * @param input The validated input data
   * @param validationDurationMs Time taken for validation
   * @returns Execution proof with cryptographic signatures
   */
  createExecutionProof(
    input: unknown,
    validationDurationMs: number
  ): ExecutionProof {
    const timestamp = new Date().toISOString();
    const proofId = this.generateProofId();
    const inputHash = this.computeHash(input);

    const proofData = {
      proofId,
      platformId: this.platformId,
      platformVersion: this.platformVersion,
      contractSchemaId: this.schemaId,
      contractSchemaVersion: this.schemaVersion,
      inputHash,
      validationTimestamp: timestamp,
      validationDurationMs,
    };

    const signature = this.signProof(proofData);

    return {
      ...proofData,
      executionTimestamp: timestamp,
      signature,
    };
  }

  /**
   * Finalizes execution proof after processing completes.
   * Adds output hash and execution duration to the proof.
   *
   * @param proof Initial execution proof
   * @param output The output data
   * @param executionDurationMs Total execution time
   * @returns Finalized execution proof
   */
  finalizeExecutionProof(
    proof: ExecutionProof,
    output: unknown,
    executionDurationMs: number
  ): ExecutionProof {
    const outputHash = this.computeHash(output);
    const executionTimestamp = new Date().toISOString();

    const finalizedProof = {
      ...proof,
      outputHash,
      executionTimestamp,
      executionDurationMs,
    };

    // Re-sign with final data
    const signature = this.signProof(finalizedProof);

    return {
      ...finalizedProof,
      signature,
    };
  }

  /**
   * Gets the schema ID for the ROI request contract.
   */
  getSchemaId(): string {
    return this.schemaId;
  }

  /**
   * Gets the schema version.
   */
  getSchemaVersion(): string {
    return this.schemaVersion;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private formatErrors(errors: ErrorObject[]): ContractValidationError[] {
    return errors.map(error => ({
      path: error.instancePath || '/',
      message: error.message ?? 'Unknown validation error',
      keyword: error.keyword,
      params: error.params as Record<string, unknown>,
    }));
  }

  private generateProofId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `proof-${timestamp}-${random}`;
  }

  private computeHash(data: unknown): string {
    const serialized = JSON.stringify(data, Object.keys(data as object).sort());
    return createHash('sha256').update(serialized).digest('hex');
  }

  private signProof(proofData: Record<string, unknown>): string {
    // Create a deterministic signature based on proof contents
    // In production, this would use asymmetric cryptography
    const serialized = JSON.stringify(proofData, Object.keys(proofData).sort());
    return createHash('sha256')
      .update(`${this.platformId}:${serialized}`)
      .digest('hex');
  }
}

// ============================================================================
// Contract Validation Exception
// ============================================================================

/**
 * Exception thrown when contract validation fails.
 * Contains full validation result for error reporting.
 */
export class ContractValidationException extends Error {
  readonly validationResult: ContractValidationResult;
  readonly code: string = 'CONTRACT_VALIDATION_FAILED';

  constructor(result: ContractValidationResult) {
    const errorSummary = result.errors.length > 0
      ? result.errors.map(e => `${e.path}: ${e.message}`).join('; ')
      : 'Unknown validation error';

    super(`Contract validation failed: ${errorSummary}`);
    this.name = 'ContractValidationException';
    this.validationResult = result;
  }

  /**
   * Formats errors for API response.
   */
  toAPIErrors(): readonly { path: string; message: string; code: string }[] {
    return this.validationResult.errors.map(error => ({
      path: error.path,
      message: error.message,
      code: `SCHEMA_${error.keyword.toUpperCase()}`,
    }));
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let validatorInstance: ContractValidator | null = null;

/**
 * Gets the singleton contract validator instance.
 * Use this for consistent validation across the application.
 */
export function getContractValidator(config?: {
  platformId?: string;
  platformVersion?: string;
}): ContractValidator {
  if (!validatorInstance) {
    validatorInstance = new ContractValidator(config);
  }
  return validatorInstance;
}

/**
 * Resets the validator instance (for testing).
 */
export function resetContractValidator(): void {
  validatorInstance = null;
}
