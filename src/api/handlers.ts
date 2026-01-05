/**
 * API Request Handlers
 * Framework-agnostic request handlers for the Enterprise ROI Engine API.
 * These handlers contain the business logic and can be adapted to any HTTP framework.
 */

import { v4 as uuidv4 } from 'uuid';

import {
  SimulationOutput,
  ERPMetadata,
  CostBaseline,
  ArtifactBundle,
  ExecutionStatus,
  ValidationStatus,
  FiscalPeriod,
  SimulationOutputSchema,
  ERPMetadataSchema,
  CostBaselineSchema,
  FinancialArtifact,
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
  ROIEngineRequest,
  ROIEngineResponse,
  ValidationRequest,
  ValidationResponse,
  HealthCheckResponse,
  ExecutionMetrics,
  APIError,
  APIErrorCode,
  InputValidationResult,
  ValidationIssue,
  CrossValidationResult,
  CrossValidationIssue,
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
 */
export async function handleCalculateROI(
  request: ROIEngineRequest,
  context: HandlerContext
): Promise<ROIEngineResponse> {
  const correlationId = request.correlationId ?? uuidv4();
  const startTime = Date.now();

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
    const warnings: string[] = [];

    // Phase 1: Validate inputs (ingestion validation)
    const ingestionStart = Date.now();
    const validationResult = validateInputs(
      request.simulation,
      request.erpMetadata,
      request.costBaseline
    );

    if (!validationResult.valid) {
      return createErrorResponse(
        correlationId,
        APIErrorCode.VALIDATION_ERROR,
        'Input validation failed',
        { validationErrors: validationResult.errors }
      );
    }

    warnings.push(...validationResult.warnings);
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
        { errors: normalizationResult.errors }
      );
    }

    warnings.push(...normalizationResult.warnings);
    phaseTimings.normalizationMs = Date.now() - normalizationStart;

    // Phase 3: Attribution
    const attributionStart = Date.now();
    const defaultFiscalPeriod = getDefaultFiscalPeriod(request.erpMetadata);

    const attributionConfig: AttributionConfig = {
      erpMetadata: request.erpMetadata,
      costBaseline: request.costBaseline,
      defaultFiscalPeriod,
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
    const metrics: ExecutionMetrics = {
      decisionsProcessed: normalizationResult.summary.decisionsNormalized,
      totalSavingsIdentified: deltaResult.portfolioMetrics.totalGrossSavings,
      executionDurationMs: Date.now() - startTime,
      phasesCompleted: 5,
      phaseBreakdown: phaseTimings,
    };

    const response: ROIEngineResponse = {
      correlationId,
      timestamp: new Date().toISOString(),
      apiVersion: 'v1',
      status: ExecutionStatus.SUCCESS,
      artifactBundle: exportResult.bundle,
      metrics,
    };
    if (financialArtifact) {
      (response as { financialArtifact: FinancialArtifact }).financialArtifact = financialArtifact;
    }
    if (warnings.length > 0) {
      (response as { warnings: readonly string[] }).warnings = warnings;
    }
    return response;
  } catch (error) {
    return createErrorResponse(
      correlationId,
      APIErrorCode.CALCULATION_ERROR,
      error instanceof Error ? error.message : 'Unknown error during calculation',
      { stack: error instanceof Error ? error.stack : 'Unknown' }
    );
  }
}

// ============================================================================
// Validate Input Handler
// ============================================================================

/**
 * Handles the POST /api/v1/validate endpoint.
 * Validates inputs without performing calculation.
 */
export async function handleValidateInput(
  request: ValidationRequest,
  _context: HandlerContext
): Promise<ValidationResponse> {
  const correlationId = request.correlationId ?? uuidv4();
  const inputsValidated: string[] = [];

  let totalErrors = 0;
  let totalWarnings = 0;

  // Build results object
  const resultsBuilder: {
    simulation?: InputValidationResult;
    erpMetadata?: InputValidationResult;
    costBaseline?: InputValidationResult;
    crossValidation?: CrossValidationResult;
  } = {};

  // Validate simulation if provided
  if (request.simulation) {
    inputsValidated.push('simulation');
    const result = validateSimulation(request.simulation);
    resultsBuilder.simulation = result;
    totalErrors += result.errors.length;
    totalWarnings += result.warnings.length;
  }

  // Validate ERP metadata if provided
  if (request.erpMetadata) {
    inputsValidated.push('erpMetadata');
    const result = validateERPMetadata(request.erpMetadata);
    resultsBuilder.erpMetadata = result;
    totalErrors += result.errors.length;
    totalWarnings += result.warnings.length;
  }

  // Validate cost baseline if provided
  if (request.costBaseline) {
    inputsValidated.push('costBaseline');
    const result = validateCostBaseline(request.costBaseline);
    resultsBuilder.costBaseline = result;
    totalErrors += result.errors.length;
    totalWarnings += result.warnings.length;
  }

  // Cross-validation if multiple inputs provided and requested
  if (
    request.crossValidate !== false &&
    request.simulation &&
    request.erpMetadata &&
    request.costBaseline
  ) {
    const crossResult = performCrossValidation(
      request.simulation,
      request.erpMetadata,
      request.costBaseline
    );
    resultsBuilder.crossValidation = crossResult;
    if (!crossResult.valid) {
      totalErrors += crossResult.issues.length;
    }
  }

  const allValid = totalErrors === 0;

  return {
    correlationId,
    timestamp: new Date().toISOString(),
    apiVersion: 'v1',
    status: allValid ? ValidationStatus.PASSED : ValidationStatus.FAILED,
    valid: allValid,
    results: resultsBuilder,
    summary: {
      errorCount: totalErrors,
      warningCount: totalWarnings,
      allValid,
      inputsValidated,
    },
  };
}

// ============================================================================
// Health Check Handler
// ============================================================================

/**
 * Handles the GET /api/v1/health endpoint.
 */
export function handleHealthCheck(context: HandlerContext): HealthCheckResponse {
  const now = new Date();
  const uptimeMs = Date.now() - context.startTime;

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
        message: 'Validation service operational',
        lastCheck: now.toISOString(),
      },
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

/**
 * Validates all inputs and returns combined result.
 */
function validateInputs(
  simulation: SimulationOutput,
  erpMetadata: ERPMetadata,
  costBaseline: CostBaseline
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate simulation
  const simResult = SimulationOutputSchema.safeParse(simulation);
  if (!simResult.success) {
    errors.push(`Simulation validation failed: ${simResult.error.message}`);
  }

  // Validate ERP metadata
  const erpResult = ERPMetadataSchema.safeParse(erpMetadata);
  if (!erpResult.success) {
    errors.push(`ERP metadata validation failed: ${erpResult.error.message}`);
  }

  // Validate cost baseline
  const costResult = CostBaselineSchema.safeParse(costBaseline);
  if (!costResult.success) {
    errors.push(`Cost baseline validation failed: ${costResult.error.message}`);
  }

  // Cross-validation warnings
  if (simulation.scenario.baselineId !== costBaseline.baselineId) {
    warnings.push(
      `Simulation references baseline ${simulation.scenario.baselineId} ` +
      `but loaded baseline is ${costBaseline.baselineId}`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates a simulation output.
 */
function validateSimulation(simulation: SimulationOutput): InputValidationResult {
  const result = SimulationOutputSchema.safeParse(simulation);
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push({
        path: issue.path.join('.'),
        message: issue.message,
        code: 'SCHEMA_ERROR',
        severity: 'error',
      });
    }
  }

  // Additional validation checks
  if (simulation.decisions.length === 0) {
    warnings.push({
      path: 'decisions',
      message: 'No decisions provided in simulation output',
      code: 'EMPTY_DECISIONS',
      severity: 'warning',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    schemaVersion: '1.0.0',
  };
}

/**
 * Validates ERP metadata.
 */
function validateERPMetadata(erpMetadata: ERPMetadata): InputValidationResult {
  const result = ERPMetadataSchema.safeParse(erpMetadata);
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push({
        path: issue.path.join('.'),
        message: issue.message,
        code: 'SCHEMA_ERROR',
        severity: 'error',
      });
    }
  }

  // Additional checks
  if (erpMetadata.costCenters.length === 0) {
    warnings.push({
      path: 'costCenters',
      message: 'No cost centers defined in ERP metadata',
      code: 'EMPTY_COST_CENTERS',
      severity: 'warning',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    schemaVersion: '1.0.0',
  };
}

/**
 * Validates cost baseline.
 */
function validateCostBaseline(costBaseline: CostBaseline): InputValidationResult {
  const result = CostBaselineSchema.safeParse(costBaseline);
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push({
        path: issue.path.join('.'),
        message: issue.message,
        code: 'SCHEMA_ERROR',
        severity: 'error',
      });
    }
  }

  // Additional checks
  if (costBaseline.discountRate <= 0 || costBaseline.discountRate > 1) {
    warnings.push({
      path: 'discountRate',
      message: `Unusual discount rate: ${costBaseline.discountRate}`,
      code: 'UNUSUAL_DISCOUNT_RATE',
      severity: 'warning',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    schemaVersion: '1.0.0',
  };
}

/**
 * Performs cross-validation between inputs.
 */
function performCrossValidation(
  simulation: SimulationOutput,
  erpMetadata: ERPMetadata,
  costBaseline: CostBaseline
): CrossValidationResult {
  const issues: CrossValidationIssue[] = [];

  // Check baseline ID reference
  if (simulation.scenario.baselineId !== costBaseline.baselineId) {
    issues.push({
      sourceInput: 'simulation',
      targetInput: 'costBaseline',
      message: `Simulation references baseline ${simulation.scenario.baselineId} but loaded baseline is ${costBaseline.baselineId}`,
      code: 'BASELINE_ID_MISMATCH',
    });
  }

  // Check currency consistency
  const laborCurrencies = new Set(costBaseline.laborRates.map(r => r.currency));
  if (!laborCurrencies.has(erpMetadata.reportingCurrency)) {
    issues.push({
      sourceInput: 'erpMetadata',
      targetInput: 'costBaseline',
      message: `ERP reporting currency ${erpMetadata.reportingCurrency} not in cost baseline labor rates`,
      code: 'CURRENCY_MISMATCH',
    });
  }

  // Validate cost center references
  const erpCostCenterIds = new Set(erpMetadata.costCenters.map(cc => cc.costCenterId));
  for (const overhead of costBaseline.overheadFactors) {
    if (!erpCostCenterIds.has(overhead.costCenterId)) {
      issues.push({
        sourceInput: 'costBaseline',
        targetInput: 'erpMetadata',
        message: `Cost baseline overhead references unknown cost center ${overhead.costCenterId}`,
        code: 'COST_CENTER_NOT_FOUND',
      });
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Gets a default fiscal period from ERP metadata.
 */
function getDefaultFiscalPeriod(erpMetadata: ERPMetadata): FiscalPeriod {
  const firstPeriod = erpMetadata.fiscalCalendar[0];
  if (firstPeriod) {
    return firstPeriod;
  }

  // Create a default if none exists
  const now = new Date();
  const year = now.getFullYear();
  return {
    year,
    period: now.getMonth() + 1,
    startDate: new Date(year, now.getMonth(), 1).toISOString(),
    endDate: new Date(year, now.getMonth() + 1, 0).toISOString(),
  };
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
 * Creates an error response.
 */
function createErrorResponse(
  correlationId: CorrelationId,
  code: APIErrorCode,
  message: string,
  details: Record<string, unknown>
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
  };
}
