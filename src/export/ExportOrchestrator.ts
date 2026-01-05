/**
 * Export Orchestrator
 * Coordinates the generation of complete artifact bundles.
 *
 * SPARC: Produces validated, CFO-grade financial artifact bundles.
 */

import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

import {
  FinancialArtifact,
  ArtifactBundle,
  Artifact,
  ArtifactType,
  FinancialDeltaResult,
  AttributionResult,
  NormalizedDataset,
  GovernancePayload,
} from '../contracts';

import {
  ArtifactBuilder,
  ArtifactBuilderConfig,
  createArtifactBuilder,
} from './ArtifactBuilder';

import {
  AuditTrailGenerator,
  createAuditTrailGenerator,
} from './AuditTrailGenerator';

import {
  SchemaValidator,
  SchemaValidationError,
  ValidationResult,
  createSchemaValidator,
} from './SchemaValidator';

import {
  SummaryGenerator,
  createSummaryGenerator,
} from './SummaryGenerator';

// ============================================================================
// Types
// ============================================================================

export interface ExportOrchestratorConfig {
  readonly engineVersion: string;
  readonly schemaVersion: string;
  readonly baseCurrency: string;
  readonly discountRate: number;
  readonly confidenceLevels: readonly number[];
  readonly timeHorizonMonths: number;
  readonly riskToleranceLevel: string;
  readonly strictValidation?: boolean;
}

export interface ExportInputs {
  readonly deltaResult: FinancialDeltaResult;
  readonly attributionResult: AttributionResult;
  readonly normalizedDataset: NormalizedDataset;
  readonly simulationId: string;
  readonly governancePayload?: GovernancePayload;
}

export interface ExportResult {
  readonly bundle: ArtifactBundle;
  readonly validationResult: ValidationResult;
  readonly processingTimeMs: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Computes SHA-256 checksum of bundle contents
 */
function computeBundleChecksum(artifacts: readonly Artifact[]): string {
  const content = JSON.stringify(artifacts, Object.keys(artifacts as object).sort());
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

// ============================================================================
// Export Orchestrator Class
// ============================================================================

export class ExportOrchestrator {
  private readonly config: ExportOrchestratorConfig;
  private readonly artifactBuilder: ArtifactBuilder;
  private readonly auditTrailGenerator: AuditTrailGenerator;
  private readonly schemaValidator: SchemaValidator;
  private readonly summaryGenerator: SummaryGenerator;

  constructor(config: ExportOrchestratorConfig) {
    this.config = config;

    // Initialize sub-components
    const builderConfig: ArtifactBuilderConfig = {
      engineVersion: config.engineVersion,
      baseCurrency: config.baseCurrency,
      discountRate: config.discountRate,
      confidenceLevels: config.confidenceLevels,
      timeHorizonMonths: config.timeHorizonMonths,
      riskToleranceLevel: config.riskToleranceLevel,
    };

    this.artifactBuilder = createArtifactBuilder(builderConfig);
    this.auditTrailGenerator = createAuditTrailGenerator({ includeFullData: false });
    this.schemaValidator = createSchemaValidator({
      strictMode: config.strictValidation ?? true,
      validateChecksums: true,
    });
    this.summaryGenerator = createSummaryGenerator({
      currency: config.baseCurrency,
      includeConfidenceInterval: true,
      confidenceLevel: 90,
    });
  }

  /**
   * Generates a complete, validated ArtifactBundle
   */
  public async generateBundle(inputs: ExportInputs): Promise<ExportResult> {
    const startTime = Date.now();

    // Reset audit trail for new generation
    this.auditTrailGenerator.reset();

    // Step 1: Record ingestion in audit trail
    this.auditTrailGenerator.recordIngestion(
      'simulation_engine',
      { simulationId: inputs.simulationId },
      inputs.normalizedDataset
    );

    // Step 2: Record normalization
    this.auditTrailGenerator.recordNormalization(
      inputs.normalizedDataset.decisions,
      inputs.normalizedDataset.decisions,
      inputs.normalizedDataset.recordCount
    );

    // Step 3: Record delta calculation
    this.auditTrailGenerator.recordDeltaCalculation(
      inputs.normalizedDataset,
      inputs.deltaResult,
      'risk-adjusted-time-discounted'
    );

    // Step 4: Record attribution
    const firstChain = inputs.attributionResult.attributionChains[0];
    this.auditTrailGenerator.recordAttribution(
      inputs.deltaResult,
      inputs.attributionResult,
      firstChain ? firstChain.attributionMethod : 'direct'
    );

    // Step 5: Generate human-readable summary
    const summary = this.artifactBuilder.buildFinancialSummary(inputs.deltaResult);
    const humanReadableSummary = this.summaryGenerator.generateHeadlineSummary(summary);

    // Step 6: Record confidence calculation
    this.auditTrailGenerator.recordConfidenceCalculation(
      inputs.deltaResult,
      summary.confidenceInterval,
      this.config.confidenceLevels
    );

    // Step 7: Get audit trail before artifact assembly
    const auditTrail = this.auditTrailGenerator.getAuditTrail();

    // Step 8: Build the financial artifact
    const financialArtifact = this.artifactBuilder.buildFinancialArtifact(
      inputs.deltaResult,
      inputs.attributionResult,
      inputs.normalizedDataset,
      auditTrail,
      humanReadableSummary
    );

    // Step 9: Record artifact assembly in a new audit step
    this.auditTrailGenerator.recordArtifactAssembly(
      {
        deltaResult: inputs.deltaResult.calculationId,
        attributionResult: inputs.attributionResult.attributionId,
        normalizedDataset: inputs.normalizedDataset.normalizationId,
      },
      financialArtifact,
      financialArtifact.artifactId
    );

    // Step 10: Validate the artifact
    const validationResult = this.schemaValidator.validateFinancialArtifact(financialArtifact);

    // Step 11: Record validation
    this.auditTrailGenerator.recordValidation(
      financialArtifact,
      validationResult,
      validationResult.valid
    );

    // Step 12: Handle validation failure in strict mode
    if (!validationResult.valid && this.config.strictValidation !== false) {
      throw new SchemaValidationError(validationResult);
    }

    // Step 13: Build artifacts array
    const artifacts: Artifact[] = [
      {
        artifactType: ArtifactType.FINANCIAL_ARTIFACT,
        content: financialArtifact,
        format: 'JSON',
        schemaVersion: this.config.schemaVersion,
      },
      {
        artifactType: ArtifactType.EXECUTIVE_SUMMARY,
        content: this.summaryGenerator.generateFromSummary(summary),
        format: 'JSON',
        schemaVersion: this.config.schemaVersion,
      },
      {
        artifactType: ArtifactType.AUDIT_TRAIL,
        content: this.auditTrailGenerator.getAuditTrail(),
        format: 'JSON',
        schemaVersion: this.config.schemaVersion,
      },
    ];

    // Add governance payload if provided
    if (inputs.governancePayload) {
      artifacts.push({
        artifactType: ArtifactType.RISK_DELTA_REPORT,
        content: inputs.governancePayload,
        format: 'JSON',
        schemaVersion: this.config.schemaVersion,
      });
    }

    // Step 14: Compute bundle checksum
    const checksum = computeBundleChecksum(artifacts);

    // Step 15: Create the bundle
    const bundle: ArtifactBundle = {
      bundleId: uuidv4(),
      artifacts,
      generationTimestamp: new Date().toISOString(),
      sourceSimulationId: inputs.simulationId,
      schemaVersion: this.config.schemaVersion,
      checksum,
    };

    // Step 16: Validate the complete bundle
    const bundleValidation = this.schemaValidator.validateArtifactBundle(bundle);
    if (!bundleValidation.valid && this.config.strictValidation !== false) {
      throw new SchemaValidationError(bundleValidation);
    }

    const processingTimeMs = Date.now() - startTime;

    return {
      bundle,
      validationResult: bundleValidation,
      processingTimeMs,
    };
  }

  /**
   * Generates only the FinancialArtifact without bundling
   */
  public generateFinancialArtifact(inputs: ExportInputs): FinancialArtifact {
    // Reset audit trail
    this.auditTrailGenerator.reset();

    // Record processing steps
    this.auditTrailGenerator.recordIngestion(
      'simulation_engine',
      { simulationId: inputs.simulationId },
      inputs.normalizedDataset
    );

    this.auditTrailGenerator.recordDeltaCalculation(
      inputs.normalizedDataset,
      inputs.deltaResult,
      'risk-adjusted-time-discounted'
    );

    this.auditTrailGenerator.recordAttribution(
      inputs.deltaResult,
      inputs.attributionResult,
      'activity-based'
    );

    // Generate summary
    const summary = this.artifactBuilder.buildFinancialSummary(inputs.deltaResult);
    const humanReadableSummary = this.summaryGenerator.generateHeadlineSummary(summary);

    // Build artifact
    const artifact = this.artifactBuilder.buildFinancialArtifact(
      inputs.deltaResult,
      inputs.attributionResult,
      inputs.normalizedDataset,
      this.auditTrailGenerator.getAuditTrail(),
      humanReadableSummary
    );

    // Validate
    const validationResult = this.schemaValidator.validateFinancialArtifact(artifact);
    if (!validationResult.valid && this.config.strictValidation !== false) {
      throw new SchemaValidationError(validationResult);
    }

    return artifact;
  }

  /**
   * Validates an existing artifact bundle
   */
  public validateBundle(bundle: ArtifactBundle): ValidationResult {
    return this.schemaValidator.validateArtifactBundle(bundle);
  }

  /**
   * Validates an existing financial artifact
   */
  public validateArtifact(artifact: FinancialArtifact): ValidationResult {
    return this.schemaValidator.validateFinancialArtifact(artifact);
  }

  /**
   * Generates a human-readable summary from a financial artifact
   */
  public generateSummary(artifact: FinancialArtifact): string {
    return this.summaryGenerator.generateExecutiveSummary(artifact.summary);
  }

  /**
   * Computes checksum for data verification
   */
  public computeChecksum(data: unknown): string {
    const content = JSON.stringify(data, null, 0);
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  }

  /**
   * Gets the current audit trail
   */
  public getAuditTrail(): ReturnType<AuditTrailGenerator['getAuditTrail']> {
    return this.auditTrailGenerator.getAuditTrail();
  }

  /**
   * Verifies the integrity of an artifact bundle's checksum
   */
  public verifyBundleIntegrity(bundle: ArtifactBundle): boolean {
    const computedChecksum = computeBundleChecksum(bundle.artifacts);
    return computedChecksum === bundle.checksum;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createExportOrchestrator(
  config: ExportOrchestratorConfig
): ExportOrchestrator {
  return new ExportOrchestrator(config);
}

// ============================================================================
// Convenience Function
// ============================================================================

/**
 * Quick generation of an artifact bundle with default configuration
 */
export async function generateArtifactBundle(
  inputs: ExportInputs,
  options: Partial<ExportOrchestratorConfig> = {}
): Promise<ArtifactBundle> {
  const config: ExportOrchestratorConfig = {
    engineVersion: options.engineVersion ?? '1.0.0',
    schemaVersion: options.schemaVersion ?? '1.0.0',
    baseCurrency: options.baseCurrency ?? 'USD',
    discountRate: options.discountRate ?? 0.1,
    confidenceLevels: options.confidenceLevels ?? [10, 50, 90],
    timeHorizonMonths: options.timeHorizonMonths ?? 12,
    riskToleranceLevel: options.riskToleranceLevel ?? 'MODERATE',
    strictValidation: options.strictValidation ?? true,
  };

  const orchestrator = createExportOrchestrator(config);
  const result = await orchestrator.generateBundle(inputs);
  return result.bundle;
}
