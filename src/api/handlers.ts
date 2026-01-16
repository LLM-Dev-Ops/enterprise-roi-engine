/**
 * API Request Handlers
 * Framework-agnostic request handlers for the Enterprise ROI Engine API.
 * These handlers contain the business logic and can be adapted to any HTTP framework.
 *
 * IMPORTANT: Contract validation is enforced at the request entry boundary (server.ts).
 * Handlers receive pre-validated data and do not perform redundant validation.
 * All responses include execution proof demonstrating platform participation.
 */

import { v4 as uuidv4 } from 'uuid';

import {
  ArtifactBundle,
  ExecutionStatus,
  ValidationStatus,
  FinancialArtifact,
  getContractValidator,
  ExecutionProof,
} from '../contracts';

import {
  NormalizationOrchestrator,
} from '../normalization/NormalizationOrchestrator';

import {
  AttributionOrchestrator,
  AttributionConfig,
} from '../attribution/AttributionOrchestrator';

import {
  CalculationOrchestrator,
} from '../calculation/CalculationOrchestrator';

import {
  ExportOrchestrator,
  ExportOrchestratorConfig,
} from '../export/ExportOrchestrator';

import {
  createSynthesisResponseBuilder,
  PhaseTimings,
} from '../export/SynthesisResponseBuilder';

import {
  ROIEngineRequest,
  ROIEngineResponse,
  ValidationRequest,
  ValidationResponse,
  HealthCheckResponse,
  ExecutionMetrics,
  APIError,
  APIErrorCode,
  ValidationIssue,
  CorrelationId,
} from './types';

// ============================================================================
// Engine Configuration
// ============================================================================

/**
 * Configuration for the ROI Engine handlers.
 */
export interface HandlerConfig {
  readonly engineVersion: string;
  readonly schemaVersion: string;
  readonly defaultCurrency: string;
  readonly defaultDiscountRate: number;
  readonly defaultHorizonMonths: number;
  readonly defaultConfidenceLevels: readonly number[];
  readonly defaultRiskTolerance: 'LOW' | 'MODERATE' | 'HIGH';
  readonly strictValidation: boolean;
}

/**
 * Default handler configuration.
 */
export const DEFAULT_HANDLER_CONFIG: HandlerConfig = {
  engineVersion: '1.0.0',
  schemaVersion: '1.0.0',
  defaultCurrency: 'USD',
  defaultDiscountRate: 0.1,
  defaultHorizonMonths: 12,
  defaultConfidenceLevels: [10, 50, 90],
  defaultRiskTolerance: 'MODERATE',
  strictValidation: true,
};

// ============================================================================
// Artifact Storage Interface
// ============================================================================

/**
 * Interface for artifact storage.
 * Implementations can use in-memory, file system, or database storage.
 */
export interface ArtifactStore {
  /**
   * Stores an artifact bundle.
   */
  save(bundle: ArtifactBundle): Promise<void>;

  /**
   * Retrieves an artifact bundle by ID.
   */
  retrieve(bundleId: string): Promise<ArtifactBundle | null>;

  /**
   * Checks if an artifact exists.
   */
  exists(bundleId: string): Promise<boolean>;
}

/**
 * In-memory artifact store for development/testing.
 */
export class InMemoryArtifactStore implements ArtifactStore {
  private readonly storage = new Map<string, ArtifactBundle>();

  async save(bundle: ArtifactBundle): Promise<void> {
    this.storage.set(bundle.bundleId, bundle);
  }

  async retrieve(bundleId: string): Promise<ArtifactBundle | null> {
    return this.storage.get(bundleId) ?? null;
  }

  async exists(bundleId: string): Promise<boolean> {
    return this.storage.has(bundleId);
  }
}

// ============================================================================
// Handler Context
// ============================================================================

/**
 * Context passed to handlers.
 */
export interface HandlerContext {
  readonly config: HandlerConfig;
  readonly artifactStore: ArtifactStore;
  readonly startTime: number;
}

/**
 * Creates a default handler context.
 */
export function createHandlerContext(
  config: Partial<HandlerConfig> = {},
  artifactStore?: ArtifactStore
): HandlerContext {
  return {
    config: { ...DEFAULT_HANDLER_CONFIG, ...config },
    artifactStore: artifactStore ?? new InMemoryArtifactStore(),
    startTime: Date.now(),
  };
}

// ============================================================================
// Calculate ROI Handler
// ============================================================================

/**
 * Handles the POST /api/v1/calculate endpoint.
 * Performs end-to-end ROI calculation.
 *
 * NOTE: Input validation is performed at the request boundary (server.ts).
 * This handler receives pre-validated data from contract enforcement.
 */
export async function handleCalculateROI(
  request: ROIEngineRequest,
  context: HandlerContext,
  executionProof?: ExecutionProof
): Promise<ROIEngineResponse> {
  const correlationId = request.correlationId ?? uuidv4();
  const startTime = Date.now();
  const contractValidator = getContractValidator();

  const phaseTimings: {
    ingestionMs: number;
    normalizationMs: number;
    attributionMs: number;
    calculationMs: number;
    exportMs: number;
  } = {
    ingestionMs: 0,
    normalizationMs: 0,
    attributionMs: 0,
    calculationMs: 0,
    exportMs: 0,
  };

  try {
    const { config } = context;
    const options = request.options ?? {};

    // Phase 1: Ingestion - Data already validated at boundary
    // No manual validation needed - contract enforced at entry
    const ingestionStart = Date.now();
    phaseTimings.ingestionMs = Date.now() - ingestionStart;

    // Phase 2: Normalization
    const normalizationStart = Date.now();
    const normalizationOrchestrator = new NormalizationOrchestrator({
      sourceSystem: 'enterprise-roi-engine',
      defaultCostCenterId: 'DEFAULT',
      validateReferentialIntegrity: true,
    });

    const normalizationResult = normalizationOrchestrator.normalize(
      request.simulation,
      request.erpMetadata,
      request.costBaseline
    );

    if (normalizationResult.errors.length > 0) {
      return createErrorResponse(
        correlationId,
        APIErrorCode.NORMALIZATION_ERROR,
        'Normalization failed',
        { errors: normalizationResult.errors },
        executionProof
      );
    }

    phaseTimings.normalizationMs = Date.now() - normalizationStart;

    // Phase 3: Attribution
    const attributionStart = Date.now();
    // Use first fiscal period from ERP metadata - no fallback
    const fiscalPeriod = request.erpMetadata.fiscalCalendar[0];
    if (!fiscalPeriod) {
      return createErrorResponse(
        correlationId,
        APIErrorCode.VALIDATION_ERROR,
        'No fiscal period defined in ERP metadata',
        { field: 'erpMetadata.fiscalCalendar' },
        executionProof
      );
    }

    const attributionConfig: AttributionConfig = {
      erpMetadata: request.erpMetadata,
      costBaseline: request.costBaseline,
      defaultFiscalPeriod: fiscalPeriod,
    };

    const attributionOrchestrator = new AttributionOrchestrator(attributionConfig);
    const attributionResult = attributionOrchestrator.processDataset(
      normalizationResult.dataset
    );

    phaseTimings.attributionMs = Date.now() - attributionStart;

    // Phase 4: Calculation
    const calculationStart = Date.now();
    const calculationConfig: {
      defaultHorizonMonths: number;
      includeSensitivity: boolean;
      confidenceLevels: readonly number[];
      discountRateOverride?: number;
    } = {
      defaultHorizonMonths: options.defaultHorizonMonths ?? config.defaultHorizonMonths,
      includeSensitivity: options.includeSensitivity ?? true,
      confidenceLevels: options.confidenceLevels ?? config.defaultConfidenceLevels,
    };
    if (options.discountRateOverride !== undefined) {
      calculationConfig.discountRateOverride = options.discountRateOverride;
    }
    const calculationOrchestrator = new CalculationOrchestrator(calculationConfig);

    const deltaResult = calculationOrchestrator.calculate(
      attributionResult,
      request.costBaseline
    );

    phaseTimings.calculationMs = Date.now() - calculationStart;

    // Phase 5: Export
    const exportStart = Date.now();
    const exportConfig: ExportOrchestratorConfig = {
      engineVersion: config.engineVersion,
      schemaVersion: config.schemaVersion,
      baseCurrency: request.erpMetadata.reportingCurrency,
      discountRate: options.discountRateOverride ?? request.costBaseline.discountRate,
      confidenceLevels: options.confidenceLevels ?? config.defaultConfidenceLevels,
      timeHorizonMonths: options.defaultHorizonMonths ?? config.defaultHorizonMonths,
      riskToleranceLevel: options.riskToleranceLevel ?? config.defaultRiskTolerance,
      strictValidation: options.strictValidation ?? config.strictValidation,
    };

    const exportOrchestrator = new ExportOrchestrator(exportConfig);
    const exportResult = await exportOrchestrator.generateBundle({
      deltaResult,
      attributionResult,
      normalizedDataset: normalizationResult.dataset,
      simulationId: request.simulation.metadata.simulationId,
    });

    phaseTimings.exportMs = Date.now() - exportStart;

    // Store the artifact bundle
    await context.artifactStore.save(exportResult.bundle);

    // Extract financial artifact from bundle
    const financialArtifact = extractFinancialArtifact(exportResult.bundle);

    // Build metrics
    const executionDurationMs = Date.now() - startTime;
    const metrics: ExecutionMetrics = {
      decisionsProcessed: normalizationResult.summary.decisionsNormalized,
      totalSavingsIdentified: deltaResult.portfolioMetrics.totalGrossSavings,
      executionDurationMs,
      phasesCompleted: 5,
      phaseBreakdown: phaseTimings,
    };

    // Build executive synthesis-compatible output
    let quantifyReference;
    if (financialArtifact) {
      const synthesisBuilder = createSynthesisResponseBuilder();
      const synthesisTimings: PhaseTimings = {
        ingestionMs: phaseTimings.ingestionMs,
        normalizationMs: phaseTimings.normalizationMs,
        attributionMs: phaseTimings.attributionMs,
        calculationMs: phaseTimings.calculationMs,
        exportMs: phaseTimings.exportMs,
      };

      // Determine report type from risk tolerance level
      const reportType = mapRiskToleranceToReportType(
        options.riskToleranceLevel ?? config.defaultRiskTolerance
      );

      quantifyReference = synthesisBuilder.build({
        financialArtifact,
        bundle: exportResult.bundle,
        deltaResult,
        phaseTimings: synthesisTimings,
        reportType,
        simulationId: request.simulation.metadata.simulationId,
        traceId: correlationId,
        startTime: new Date(startTime),
        endTime: new Date(),
      });
    }

    // Finalize execution proof if provided
    let finalProof = executionProof;
    if (finalProof) {
      finalProof = contractValidator.finalizeExecutionProof(
        finalProof,
        exportResult.bundle,
        executionDurationMs
      );
    }

    const response: ROIEngineResponse = {
      correlationId,
      timestamp: new Date().toISOString(),
      apiVersion: 'v1',
      status: ExecutionStatus.SUCCESS,
      artifactBundle: exportResult.bundle,
      metrics,
      ...(financialArtifact && { financialArtifact }),
      ...(quantifyReference && { quantifyReference }),
      ...(finalProof && { executionProof: finalProof }),
    };
    return response;
  } catch (error) {
    return createErrorResponse(
      correlationId,
      APIErrorCode.CALCULATION_ERROR,
      error instanceof Error ? error.message : 'Unknown error during calculation',
      { stack: error instanceof Error ? error.stack : 'Unknown' },
      executionProof
    );
  }
}

// ============================================================================
// Validate Input Handler
// ============================================================================

/**
 * Handles the POST /api/v1/validate endpoint.
 * Uses contract validation to validate inputs without performing calculation.
 * This provides a preview of whether a full calculate request would pass validation.
 */
export async function handleValidateInput(
  request: ValidationRequest,
  _context: HandlerContext,
  executionProof?: ExecutionProof
): Promise<ValidationResponse> {
  const correlationId = request.correlationId ?? uuidv4();
  const contractValidator = getContractValidator();
  const inputsValidated: string[] = [];

  // Build a full request object for contract validation
  const fullRequest = {
    simulation: request.simulation,
    erpMetadata: request.erpMetadata,
    costBaseline: request.costBaseline,
  };

  if (request.simulation) {
    inputsValidated.push('simulation');
  }
  if (request.erpMetadata) {
    inputsValidated.push('erpMetadata');
  }
  if (request.costBaseline) {
    inputsValidated.push('costBaseline');
  }

  // Use contract validation
  const validationResult = contractValidator.validate(fullRequest);

  const errors: ValidationIssue[] = validationResult.errors.map(error => ({
    path: error.path,
    message: error.message,
    code: `SCHEMA_${error.keyword.toUpperCase()}`,
    severity: 'error' as const,
  }));

  const allValid = validationResult.valid;

  // Build results object conditionally
  const results: {
    simulation?: { valid: boolean; errors: readonly ValidationIssue[]; warnings: readonly ValidationIssue[]; schemaVersion: string };
    erpMetadata?: { valid: boolean; errors: readonly ValidationIssue[]; warnings: readonly ValidationIssue[]; schemaVersion: string };
    costBaseline?: { valid: boolean; errors: readonly ValidationIssue[]; warnings: readonly ValidationIssue[]; schemaVersion: string };
  } = {};

  if (request.simulation) {
    results.simulation = {
      valid: !errors.some(e => e.path.startsWith('/simulation')),
      errors: errors.filter(e => e.path.startsWith('/simulation')),
      warnings: [],
      schemaVersion: contractValidator.getSchemaVersion(),
    };
  }
  if (request.erpMetadata) {
    results.erpMetadata = {
      valid: !errors.some(e => e.path.startsWith('/erpMetadata')),
      errors: errors.filter(e => e.path.startsWith('/erpMetadata')),
      warnings: [],
      schemaVersion: contractValidator.getSchemaVersion(),
    };
  }
  if (request.costBaseline) {
    results.costBaseline = {
      valid: !errors.some(e => e.path.startsWith('/costBaseline')),
      errors: errors.filter(e => e.path.startsWith('/costBaseline')),
      warnings: [],
      schemaVersion: contractValidator.getSchemaVersion(),
    };
  }

  const response: ValidationResponse = {
    correlationId,
    timestamp: new Date().toISOString(),
    apiVersion: 'v1',
    status: allValid ? ValidationStatus.PASSED : ValidationStatus.FAILED,
    valid: allValid,
    results,
    summary: {
      errorCount: errors.length,
      warningCount: 0,
      allValid,
      inputsValidated,
    },
    ...(executionProof && { executionProof }),
  };

  return response;
}

// ============================================================================
// Health Check Handler
// ============================================================================

/**
 * Handles the GET /api/v1/health endpoint.
 * Includes contract schema information for service discovery.
 */
export function handleHealthCheck(context: HandlerContext): HealthCheckResponse {
  const now = new Date();
  const uptimeMs = Date.now() - context.startTime;
  const contractValidator = getContractValidator();

  return {
    status: 'healthy',
    version: context.config.engineVersion,
    timestamp: now.toISOString(),
    uptimeMs,
    components: {
      engine: {
        status: 'healthy',
        message: 'Engine operational',
        lastCheck: now.toISOString(),
      },
      validation: {
        status: 'healthy',
        message: `Contract validation enabled - ${contractValidator.getSchemaId()}`,
        lastCheck: now.toISOString(),
      },
    },
    build: {
      contractSchemaId: contractValidator.getSchemaId(),
      contractSchemaVersion: contractValidator.getSchemaVersion(),
    },
  };
}

// ============================================================================
// Get Artifact Handler
// ============================================================================

/**
 * Handles the GET /api/v1/artifacts/:id endpoint.
 */
export async function handleGetArtifact(
  artifactId: string,
  context: HandlerContext
): Promise<ArtifactBundle | null> {
  return context.artifactStore.retrieve(artifactId);
}

// ============================================================================
// Helper Functions
// ============================================================================

// NOTE: Manual validation functions removed.
// Contract validation is enforced at the request boundary (server.ts).
// No fallback logic - requests must conform to the contract schema.

/**
 * Maps risk tolerance level to report type for synthesis.
 * CFO-grade reports are generated for enterprise/high-risk scenarios.
 */
function mapRiskToleranceToReportType(
  riskTolerance: 'LOW' | 'MODERATE' | 'HIGH'
): 'cfo-grade' | 'executive-summary' | 'technical-deep-dive' {
  switch (riskTolerance) {
    case 'HIGH':
      return 'cfo-grade';
    case 'MODERATE':
      return 'executive-summary';
    case 'LOW':
      return 'technical-deep-dive';
    default:
      return 'executive-summary';
  }
}

/**
 * Extracts the financial artifact from a bundle.
 */
function extractFinancialArtifact(bundle: ArtifactBundle): FinancialArtifact | undefined {
  for (const artifact of bundle.artifacts) {
    if (artifact.artifactType === 'FINANCIAL_ARTIFACT') {
      return artifact.content as FinancialArtifact;
    }
  }
  return undefined;
}

/**
 * Creates an error response with optional execution proof.
 */
function createErrorResponse(
  correlationId: CorrelationId,
  code: APIErrorCode,
  message: string,
  details: Record<string, unknown>,
  executionProof?: ExecutionProof
): ROIEngineResponse {
  const error: APIError = {
    code,
    message,
    details,
  };

  return {
    correlationId,
    timestamp: new Date().toISOString(),
    apiVersion: 'v1',
    status: ExecutionStatus.FAILED,
    error,
    ...(executionProof && { executionProof }),
  };
}
