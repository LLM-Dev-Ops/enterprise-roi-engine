/**
 * Enterprise ROI Engine - Main Entry Point
 *
 * Implements the execute_roi_engine function from the SPARC pseudocode specification.
 * Orchestrates the full pipeline: Ingestion -> Normalization -> Attribution -> Calculation -> Export.
 *
 * All functions are deterministic: same inputs = same outputs.
 * Uses UUID for identifiers and ISO8601 for timestamps.
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Re-export all public APIs from layers
// ============================================================================

// Ingestion layer
export {
  SimulationIngestor,
  SimulationEndpoint,
  SimulationIngestionResult,
  ERPMetadataIngestor,
  ERPSurfaceEndpoint,
  ERPMetadataIngestionResult,
  CostBaselineIngestor,
  CostOpsEndpoint,
  CostBaselineIngestionResult,
  IngestionOrchestrator,
  IngestionEndpointConfig,
  IngestionOptions,
  IngestionChecksum,
  IngestedData,
  IngestionResult,
} from './ingestion';

// Normalization layer
export {
  EntityNormalizer,
  CostCenterNode,
  EntityCostCenterMapping,
  CanonicalEntityId,
  UnitHarmonizer,
  ExchangeRate,
  TimeUnit,
  QuantityUnit,
  CurrencyConversionResult,
  TimeConversionResult,
  QuantityConversionResult,
  TemporalAligner,
  FiscalCalendarConfig,
  FiscalPeriodType,
  FiscalPeriodMapping,
  AlignedTimeHorizon,
  PeriodAdjustmentFactor,
  TimeHorizonValidation,
  DecisionNormalizer,
  DecisionNormalizerConfig,
  RawDecisionInput,
  DecisionTypeMapping,
  NormalizationResult,
  NormalizationOrchestrator,
  NormalizationOrchestratorConfig,
  NormalizationOrchestratorResult,
  NormalizationSummary,
  DeduplicationStrategy,
} from './normalization';

// Attribution layer
export {
  CostAttributor,
  PeriodAdjustment,
  BenefitAttributor,
  BenefitValidationResult,
  RiskAttributor,
  RiskAttribution,
  RiskStatistics,
  OverheadAllocator,
  OverheadBreakdown,
  AttributionOrchestrator,
  AttributionConfig,
  CostCenterValidationResult,
} from './attribution';

// Calculation layer
export {
  ROICalculator,
  ROIMethodology,
  ROICalculationConfig,
  ROIResult,
  DeltaInput,
  calculateGrossDelta,
  calculateSimpleROI,
  calculateAnnualizedROI,
  calculateROI,
  calculateGrossDeltaFromChain,
  aggregateGrossDeltas,
  NPVEngine,
  NPVConfig,
  NPVResult,
  CashFlow,
  PeriodPresentValue,
  calculateMonthlyRate,
  calculateEffectiveMonthlyRate,
  calculateDiscountFactor,
  calculatePresentValue,
  calculateNPV,
  calculatePeriodPresentValues,
  calculateTimeAdjustedDelta,
  calculateSinglePeriodNPV,
  calculateCumulativeNPV,
  PaybackAnalyzer,
  PaybackConfig,
  PaybackResult,
  PaybackAnalysis,
  PaybackPeriodDetail,
  calculateSimplePaybackPeriod,
  calculateDiscountedPaybackPeriod,
  calculatePaybackPeriod,
  analyzePayback,
  calculateInterpolatedPaybackPeriod,
  generateUniformCashFlows,
  SensitivityEngine,
  SensitivityFactorConfig,
  SensitivityFactorType,
  SensitivityAnalysisConfig,
  calculateElasticity,
  calculateNPVWithDiscountRate,
  applyCashFlowMultiplier,
  filterCashFlowsByHorizon,
  analyzeSingleFactor,
  performSensitivityAnalysis,
  generateStandardFactors,
  calculateDiscountRateSensitivityCurve,
  ConfidenceCalculator,
  ConfidenceConfig,
  RiskWeightConfig,
  Z_SCORES,
  STANDARD_CONFIDENCE_LEVELS,
  calculateUncertaintyFactor,
  calculateMargin,
  calculateIntervalBounds,
  generateConfidenceIntervals,
  calculateRiskComponents,
  calculateRiskFactor,
  calculateRiskAdjustedDelta,
  CalculationOrchestrator,
  CalculationOrchestratorConfig,
  calculateFinancialDeltas,
} from './calculation';

// Export layer
export {
  ArtifactBuilder,
  ArtifactBuilderConfig,
  createArtifactBuilder,
  AuditTrailGenerator,
  AuditTrailGeneratorOptions,
  AuditStep,
  createAuditTrailGenerator,
  computeHash,
  SchemaValidator,
  SchemaValidatorOptions,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  SchemaValidationError,
  createSchemaValidator,
  SummaryGenerator,
  SummaryGeneratorOptions,
  GeneratedSummary,
  createSummaryGenerator,
  generateQuickSummary,
  generateQuickDeltaSummary,
  ExportOrchestrator,
  ExportOrchestratorConfig,
  ExportInputs,
  ExportResult,
  createExportOrchestrator,
  generateArtifactBundle,
} from './export';

// ============================================================================
// Re-export all contracts
// ============================================================================

export * from './contracts';

// ============================================================================
// Re-export all lib utilities
// ============================================================================

export * from './lib';

// ============================================================================
// Re-export synthesis utilities
// ============================================================================

export {
  buildExecutiveSummary,
  elevateRiskForProduction,
  determineEnvironment,
  calculateSuccessRate,
  countBlockingIssues,
  extractBlockingIssues,
  isProductionTarget,
} from './synthesis';

export type {
  SynthesisEnvironment,
  SynthesisResultMetrics,
  BlockingIssue,
  DecisionPacket,
  FlaggedAssumption,
  QuantifyResult,
  CostProjection,
  ResourceProjection,
  ComparisonResult,
} from './synthesis';

// ============================================================================
// Import types needed for engine configuration
// ============================================================================

import type {
  IngestionEndpointConfig as IngestionEndpointConfigType,
  IngestionOptions as IngestionOptionsType,
} from './ingestion';

import {
  IngestionOrchestrator as IngestionOrchestratorClass,
} from './ingestion';

import type {
  NormalizationOrchestratorConfig as NormalizationOrchestratorConfigType,
} from './normalization';

import {
  NormalizationOrchestrator as NormalizationOrchestratorClass,
  DeduplicationStrategy as DeduplicationStrategyEnum,
} from './normalization';

import type {
  AttributionConfig as AttributionConfigType,
} from './attribution';

import {
  AttributionOrchestrator as AttributionOrchestratorClass,
} from './attribution';

import type {
  CalculationOrchestratorConfig as CalculationOrchestratorConfigType,
} from './calculation';

import {
  CalculationOrchestrator as CalculationOrchestratorClass,
} from './calculation';

import type {
  ExportOrchestratorConfig as ExportOrchestratorConfigType,
  ExportInputs as ExportInputsType,
} from './export';

import {
  ExportOrchestrator as ExportOrchestratorClass,
} from './export';

import type {
  ExecutionResult as ExecutionResultType,
  ExecutionMetrics as ExecutionMetricsType,
} from './contracts';

import {
  IngestionStatus,
  AllocationMethod,
} from './contracts';

import type { FiscalPeriod } from './contracts';

// ============================================================================
// Engine Configuration Types
// ============================================================================

/**
 * Configuration for ingestion endpoints.
 */
export interface IngestionConfig {
  /** Endpoint for fetching simulation output from Agentics engine */
  readonly simulation: {
    fetchSimulationOutput(): Promise<unknown>;
  };
  /** Endpoint for fetching ERP metadata from erp-surface */
  readonly erpSurface: {
    fetchERPMetadata(): Promise<unknown>;
  };
  /** Endpoint for fetching cost baseline from CostOps (read-only) */
  readonly costOps: {
    fetchCostBaseline(baselineId?: string): Promise<unknown>;
  };
}

/**
 * Configuration for the normalization phase.
 */
export interface NormalizationConfig {
  /** Source system identifier for audit trail */
  readonly sourceSystem?: string;
  /** Default cost center ID when not specified */
  readonly defaultCostCenter?: string;
  /** Strategy for handling duplicate decisions */
  readonly dedupStrategy?: DeduplicationStrategyEnum;
  /** Default allocation method */
  readonly defaultAllocationMethod?: AllocationMethod;
  /** Whether to validate referential integrity */
  readonly validateReferentialIntegrity?: boolean;
}

/**
 * Configuration for the calculation phase.
 */
export interface CalculationConfig {
  /** Override discount rate from cost baseline */
  readonly discountRateOverride?: number;
  /** Default time horizon in months */
  readonly defaultHorizon?: number;
  /** Confidence levels to calculate */
  readonly confidenceLevels?: readonly number[];
  /** Whether to include sensitivity analysis */
  readonly includeSensitivity?: boolean;
}

/**
 * Configuration for the export phase.
 */
export interface ExportConfig {
  /** Engine version for artifact metadata */
  readonly engineVersion: string;
  /** Schema version for artifact validation */
  readonly schemaVersion: string;
  /** Base currency for financial calculations */
  readonly baseCurrency: string;
  /** Discount rate for NPV calculations */
  readonly discountRate?: number;
  /** Confidence levels for intervals */
  readonly confidenceLevels?: readonly number[];
  /** Time horizon in months */
  readonly timeHorizonMonths?: number;
  /** Risk tolerance level */
  readonly riskToleranceLevel?: string;
  /** Whether to use strict validation */
  readonly strictValidation?: boolean;
}

/**
 * Complete configuration for the Enterprise ROI Engine.
 */
export interface EngineConfig {
  /** Configuration for data ingestion endpoints */
  readonly ingestionConfig: IngestionConfig;
  /** Configuration for data normalization */
  readonly normalizationConfig?: NormalizationConfig;
  /** Configuration for financial calculations */
  readonly calculationConfig?: CalculationConfig;
  /** Configuration for artifact export */
  readonly exportConfig: ExportConfig;
}

/**
 * Options for engine execution.
 */
export interface ExecutionOptions {
  /** Optional baseline ID to fetch from CostOps */
  readonly baselineId?: string;
  /** Whether to fail fast on first error */
  readonly failFast?: boolean;
  /** Default fiscal period for attribution */
  readonly defaultFiscalPeriod?: FiscalPeriod;
  /** Optional governance payload to include in bundle */
  readonly governancePayload?: unknown;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error thrown when engine execution fails.
 */
export class EngineExecutionError extends Error {
  constructor(
    message: string,
    public readonly phase: 'INGESTION' | 'NORMALIZATION' | 'ATTRIBUTION' | 'CALCULATION' | 'EXPORT',
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'EngineExecutionError';
  }
}

// ============================================================================
// EnterpriseROIEngine Class
// ============================================================================

/**
 * Enterprise ROI Engine - Main orchestration class.
 *
 * Coordinates the full pipeline from data ingestion through artifact export:
 * 1. Ingestion - Load data from simulation, ERP, and CostOps
 * 2. Normalization - Normalize and deduplicate decisions
 * 3. Attribution - Attribute costs and benefits to cost centers
 * 4. Calculation - Calculate financial deltas and metrics
 * 5. Export - Generate validated artifact bundle
 */
export class EnterpriseROIEngine {
  private readonly config: EngineConfig;
  private readonly ingestionOrchestrator: IngestionOrchestratorClass;
  private readonly normalizationOrchestrator: NormalizationOrchestratorClass;

  constructor(config: EngineConfig) {
    this.config = config;

    // Initialize ingestion orchestrator with endpoint config
    const ingestionEndpointConfig: IngestionEndpointConfigType = {
      simulation: config.ingestionConfig.simulation,
      erpSurface: config.ingestionConfig.erpSurface,
      costOps: config.ingestionConfig.costOps,
    };
    this.ingestionOrchestrator = new IngestionOrchestratorClass(ingestionEndpointConfig);

    // Initialize normalization orchestrator with config
    const normalizationConfig: Partial<NormalizationOrchestratorConfigType> = {
      sourceSystem: config.normalizationConfig?.sourceSystem ?? 'enterprise-roi-engine',
      defaultCostCenterId: config.normalizationConfig?.defaultCostCenter ?? 'DEFAULT',
      defaultAllocationMethod: config.normalizationConfig?.defaultAllocationMethod ?? AllocationMethod.DIRECT,
      deduplicationStrategy: config.normalizationConfig?.dedupStrategy ?? DeduplicationStrategyEnum.KEEP_FIRST,
      validateReferentialIntegrity: config.normalizationConfig?.validateReferentialIntegrity ?? true,
    };
    this.normalizationOrchestrator = new NormalizationOrchestratorClass(normalizationConfig);
  }

  /**
   * Execute the full ROI engine pipeline.
   *
   * Phases:
   * 1. Ingestion - Load and validate data from all sources
   * 2. Normalization - Normalize decisions to canonical format
   * 3. Attribution - Attribute to cost centers and GL accounts
   * 4. Calculation - Calculate financial deltas and portfolio metrics
   * 5. Export - Generate validated artifact bundle
   *
   * @param options Optional execution options
   * @returns ExecutionResult with artifact bundle or error
   */
  async execute(options: ExecutionOptions = {}): Promise<ExecutionResultType> {
    const executionId = uuidv4();
    const startTime = new Date().toISOString();
    let phasesCompleted = 0;

    try {
      // ========================================================================
      // Phase 1: Ingestion
      // ========================================================================
      const ingestionOptions: IngestionOptionsType = {};
      if (options.baselineId !== undefined) {
        (ingestionOptions as { baselineId?: string }).baselineId = options.baselineId;
      }
      if (options.failFast !== undefined) {
        (ingestionOptions as { failFast?: boolean }).failFast = options.failFast;
      }
      const ingestionResult = await this.ingestionOrchestrator.ingestAll(ingestionOptions);

      if (ingestionResult.status === IngestionStatus.FAILED || !ingestionResult.data) {
        const errorMessages = ingestionResult.errors.map(e => e.message).join('; ');
        throw new EngineExecutionError(
          `Ingestion failed: ${errorMessages}`,
          'INGESTION',
          { errors: ingestionResult.errors, warnings: ingestionResult.warnings }
        );
      }
      phasesCompleted = 1;

      const { simulation, erpMetadata, costBaseline } = ingestionResult.data;

      // ========================================================================
      // Phase 2: Normalization
      // ========================================================================
      const normalizationResult = this.normalizationOrchestrator.normalize(
        simulation,
        erpMetadata,
        costBaseline
      );

      if (normalizationResult.errors.length > 0 && options.failFast) {
        throw new EngineExecutionError(
          `Normalization failed: ${normalizationResult.errors.join('; ')}`,
          'NORMALIZATION',
          { errors: normalizationResult.errors, warnings: normalizationResult.warnings }
        );
      }
      phasesCompleted = 2;

      const normalizedDataset = normalizationResult.dataset;

      // ========================================================================
      // Phase 3: Attribution
      // ========================================================================
      const defaultFiscalPeriod: FiscalPeriod = options.defaultFiscalPeriod ?? {
        year: new Date().getFullYear(),
        period: new Date().getMonth() + 1,
        startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
        endDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString(),
      };

      const attributionConfig: AttributionConfigType = {
        erpMetadata,
        costBaseline,
        defaultFiscalPeriod,
      };
      const attributionOrchestrator = new AttributionOrchestratorClass(attributionConfig);

      const attributionResult = attributionOrchestrator.processDataset(normalizedDataset);
      phasesCompleted = 3;

      // ========================================================================
      // Phase 4: Calculation
      // ========================================================================
      const calculationConfig: CalculationOrchestratorConfigType = {
        defaultHorizonMonths: this.config.calculationConfig?.defaultHorizon ?? 12,
        includeSensitivity: this.config.calculationConfig?.includeSensitivity ?? true,
        confidenceLevels: this.config.calculationConfig?.confidenceLevels ?? [50, 75, 90, 95, 99],
      };
      // Only set discountRateOverride if it's defined
      if (this.config.calculationConfig?.discountRateOverride !== undefined) {
        (calculationConfig as { discountRateOverride?: number }).discountRateOverride = this.config.calculationConfig.discountRateOverride;
      }
      const calculationOrchestrator = new CalculationOrchestratorClass(calculationConfig);

      const deltaResult = calculationOrchestrator.calculate(attributionResult, costBaseline);
      phasesCompleted = 4;

      // ========================================================================
      // Phase 5: Export
      // ========================================================================
      const exportConfig: ExportOrchestratorConfigType = {
        engineVersion: this.config.exportConfig.engineVersion,
        schemaVersion: this.config.exportConfig.schemaVersion,
        baseCurrency: this.config.exportConfig.baseCurrency,
        discountRate: this.config.exportConfig.discountRate ?? costBaseline.discountRate,
        confidenceLevels: this.config.exportConfig.confidenceLevels ?? [10, 50, 90],
        timeHorizonMonths: this.config.exportConfig.timeHorizonMonths ?? 12,
        riskToleranceLevel: this.config.exportConfig.riskToleranceLevel ?? 'MODERATE',
        strictValidation: this.config.exportConfig.strictValidation ?? true,
      };
      const exportOrchestrator = new ExportOrchestratorClass(exportConfig);

      const exportInputs: ExportInputsType = {
        deltaResult,
        attributionResult,
        normalizedDataset,
        simulationId: simulation.metadata.simulationId,
        governancePayload: options.governancePayload as any,
      };

      const exportResult = await exportOrchestrator.generateBundle(exportInputs);
      phasesCompleted = 5;

      // ========================================================================
      // Build execution metrics
      // ========================================================================
      const endTime = new Date().toISOString();
      const executionDurationMs = new Date(endTime).getTime() - new Date(startTime).getTime();

      // Calculate total savings identified
      const totalSavingsIdentified = this.calculateTotalSavings(deltaResult);

      const metrics: ExecutionMetricsType = {
        decisionsProcessed: normalizedDataset.recordCount,
        totalSavingsIdentified,
        executionDurationMs,
        phasesCompleted,
      };

      return {
        executionId,
        status: 'SUCCESS',
        artifactBundle: exportResult.bundle,
        metrics,
        startTime,
        endTime,
      };

    } catch (error) {
      const endTime = new Date().toISOString();
      const executionDurationMs = new Date(endTime).getTime() - new Date(startTime).getTime();

      const metrics: ExecutionMetricsType = {
        decisionsProcessed: 0,
        totalSavingsIdentified: '0.0000',
        executionDurationMs,
        phasesCompleted,
      };

      return {
        executionId,
        status: 'FAILED',
        error: error instanceof Error ? error : new Error(String(error)),
        metrics,
        startTime,
        endTime,
      };
    }
  }

  /**
   * Calculate total savings from the delta result.
   */
  private calculateTotalSavings(deltaResult: { portfolioMetrics: { totalGrossSavings: string } }): string {
    return deltaResult.portfolioMetrics.totalGrossSavings;
  }

  /**
   * Get the current engine configuration.
   */
  getConfig(): EngineConfig {
    return this.config;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a new EnterpriseROIEngine instance with the given configuration.
 *
 * @param config Engine configuration
 * @returns Configured EnterpriseROIEngine instance
 */
export function createEngine(config: EngineConfig): EnterpriseROIEngine {
  return new EnterpriseROIEngine(config);
}

// ============================================================================
// Convenience Function for One-Shot Execution
// ============================================================================

/**
 * Execute the ROI engine pipeline in a single call.
 *
 * This is a convenience function for one-shot execution. For repeated
 * executions with the same configuration, use createEngine() to create
 * a reusable engine instance.
 *
 * @param config Engine configuration
 * @param options Optional execution options
 * @returns ExecutionResult with artifact bundle or error
 */
export async function executeROIEngine(
  config: EngineConfig,
  options?: ExecutionOptions
): Promise<ExecutionResultType> {
  const engine = createEngine(config);
  return engine.execute(options);
}

// ============================================================================
// Default Export
// ============================================================================

export default EnterpriseROIEngine;
