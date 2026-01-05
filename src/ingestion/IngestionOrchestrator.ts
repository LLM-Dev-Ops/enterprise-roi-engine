/**
 * IngestionOrchestrator
 * Coordinates all ingestors to load data from multiple sources.
 * Executes ingestors in parallel and aggregates results.
 */

import {
  SimulationOutput,
  ERPMetadata,
  CostBaseline,
  IngestionError,
  IngestionStatus,
  SHA256Hash,
} from '../contracts';
import {
  SimulationIngestor,
  SimulationEndpoint,
  SimulationIngestionResult,
} from './SimulationIngestor';
import {
  ERPMetadataIngestor,
  ERPSurfaceEndpoint,
  ERPMetadataIngestionResult,
} from './ERPMetadataIngestor';
import {
  CostBaselineIngestor,
  CostOpsEndpoint,
  CostBaselineIngestionResult,
} from './CostBaselineIngestor';

// ============================================================================
// Configuration Types
// ============================================================================

export interface IngestionEndpointConfig {
  readonly simulation: SimulationEndpoint;
  readonly erpSurface: ERPSurfaceEndpoint;
  readonly costOps: CostOpsEndpoint;
}

export interface IngestionOptions {
  /**
   * Optional baseline ID to fetch from CostOps.
   * If not provided, fetches the default/latest baseline.
   */
  readonly baselineId?: string;

  /**
   * Whether to fail fast on first error or collect all errors.
   * Default: false (collect all errors)
   */
  readonly failFast?: boolean;
}

// ============================================================================
// Result Types
// ============================================================================

export interface IngestionChecksum {
  readonly simulation: SHA256Hash;
  readonly erpMetadata: SHA256Hash;
  readonly costBaseline: SHA256Hash;
}

export interface IngestedData {
  readonly simulation: SimulationOutput;
  readonly erpMetadata: ERPMetadata;
  readonly costBaseline: CostBaseline;
}

export interface IngestionResult {
  readonly status: IngestionStatus;
  readonly data: IngestedData | null;
  readonly checksums: IngestionChecksum;
  readonly warnings: readonly string[];
  readonly errors: readonly IngestionError[];
  readonly ingestedAt: string;
  readonly individualResults: {
    readonly simulation: SimulationIngestionResult | null;
    readonly erpMetadata: ERPMetadataIngestionResult | null;
    readonly costBaseline: CostBaselineIngestionResult | null;
  };
}

// ============================================================================
// IngestionOrchestrator Class
// ============================================================================

export class IngestionOrchestrator {
  private readonly simulationIngestor: SimulationIngestor;
  private readonly erpMetadataIngestor: ERPMetadataIngestor;
  private readonly costBaselineIngestor: CostBaselineIngestor;

  constructor(config: IngestionEndpointConfig) {
    this.simulationIngestor = new SimulationIngestor(config.simulation);
    this.erpMetadataIngestor = new ERPMetadataIngestor(config.erpSurface);
    this.costBaselineIngestor = new CostBaselineIngestor(config.costOps);
  }

  /**
   * Execute all ingestors in parallel and aggregate results.
   * Returns combined data if all succeed, or collected errors on failure.
   */
  async ingestAll(options: IngestionOptions = {}): Promise<IngestionResult> {
    const ingestedAt = new Date().toISOString();
    const allWarnings: string[] = [];
    const allErrors: IngestionError[] = [];

    // Execute all ingestors in parallel
    const [simulationResult, erpResult, costBaselineResult] = await Promise.all([
      this.simulationIngestor.ingest(),
      this.erpMetadataIngestor.ingest(),
      this.costBaselineIngestor.ingest(options.baselineId),
    ]);

    // Collect warnings from all results
    allWarnings.push(...simulationResult.warnings);
    allWarnings.push(...erpResult.warnings);
    allWarnings.push(...costBaselineResult.warnings);

    // Collect errors from all results
    allErrors.push(...simulationResult.errors);
    allErrors.push(...erpResult.errors);
    allErrors.push(...costBaselineResult.errors);

    // Build checksums object
    const checksums: IngestionChecksum = {
      simulation: simulationResult.checksum,
      erpMetadata: erpResult.checksum,
      costBaseline: costBaselineResult.checksum,
    };

    // Determine overall status
    const hasAnyError =
      simulationResult.status === IngestionStatus.FAILED ||
      erpResult.status === IngestionStatus.FAILED ||
      costBaselineResult.status === IngestionStatus.FAILED;

    const hasAnyPartial =
      simulationResult.status === IngestionStatus.PARTIAL ||
      erpResult.status === IngestionStatus.PARTIAL ||
      costBaselineResult.status === IngestionStatus.PARTIAL;

    // If any ingestor failed, we cannot proceed
    if (hasAnyError) {
      return {
        status: IngestionStatus.FAILED,
        data: null,
        checksums,
        warnings: allWarnings,
        errors: allErrors,
        ingestedAt,
        individualResults: {
          simulation: simulationResult,
          erpMetadata: erpResult,
          costBaseline: costBaselineResult,
        },
      };
    }

    // All ingestors succeeded (possibly with warnings)
    const data: IngestedData = {
      simulation: simulationResult.data as SimulationOutput,
      erpMetadata: erpResult.data as ERPMetadata,
      costBaseline: costBaselineResult.data as CostBaseline,
    };

    // Cross-validation: ensure baseline ID referenced in simulation exists
    const crossValidationWarnings = this.crossValidate(data);
    allWarnings.push(...crossValidationWarnings);

    return {
      status: hasAnyPartial || crossValidationWarnings.length > 0
        ? IngestionStatus.PARTIAL
        : IngestionStatus.SUCCESS,
      data,
      checksums,
      warnings: allWarnings,
      errors: [],
      ingestedAt,
      individualResults: {
        simulation: simulationResult,
        erpMetadata: erpResult,
        costBaseline: costBaselineResult,
      },
    };
  }

  /**
   * Validate data from raw payloads without fetching from endpoints.
   * Useful for testing or when data is already available.
   */
  validateAll(
    simulationPayload: unknown,
    erpPayload: unknown,
    costBaselinePayload: unknown
  ): IngestionResult {
    const ingestedAt = new Date().toISOString();
    const allWarnings: string[] = [];
    const allErrors: IngestionError[] = [];

    // Validate all payloads
    const simulationResult = this.simulationIngestor.validatePayload(simulationPayload);
    const erpResult = this.erpMetadataIngestor.validatePayload(erpPayload);
    const costBaselineResult = this.costBaselineIngestor.validatePayload(costBaselinePayload);

    // Collect warnings from all results
    allWarnings.push(...simulationResult.warnings);
    allWarnings.push(...erpResult.warnings);
    allWarnings.push(...costBaselineResult.warnings);

    // Collect errors from all results
    allErrors.push(...simulationResult.errors);
    allErrors.push(...erpResult.errors);
    allErrors.push(...costBaselineResult.errors);

    // Build checksums object
    const checksums: IngestionChecksum = {
      simulation: simulationResult.checksum,
      erpMetadata: erpResult.checksum,
      costBaseline: costBaselineResult.checksum,
    };

    // Determine overall status
    const hasAnyError =
      simulationResult.status === IngestionStatus.FAILED ||
      erpResult.status === IngestionStatus.FAILED ||
      costBaselineResult.status === IngestionStatus.FAILED;

    const hasAnyPartial =
      simulationResult.status === IngestionStatus.PARTIAL ||
      erpResult.status === IngestionStatus.PARTIAL ||
      costBaselineResult.status === IngestionStatus.PARTIAL;

    // If any validation failed, return errors
    if (hasAnyError) {
      return {
        status: IngestionStatus.FAILED,
        data: null,
        checksums,
        warnings: allWarnings,
        errors: allErrors,
        ingestedAt,
        individualResults: {
          simulation: simulationResult,
          erpMetadata: erpResult,
          costBaseline: costBaselineResult,
        },
      };
    }

    // All validations succeeded (possibly with warnings)
    const data: IngestedData = {
      simulation: simulationResult.data as SimulationOutput,
      erpMetadata: erpResult.data as ERPMetadata,
      costBaseline: costBaselineResult.data as CostBaseline,
    };

    // Cross-validation
    const crossValidationWarnings = this.crossValidate(data);
    allWarnings.push(...crossValidationWarnings);

    return {
      status: hasAnyPartial || crossValidationWarnings.length > 0
        ? IngestionStatus.PARTIAL
        : IngestionStatus.SUCCESS,
      data,
      checksums,
      warnings: allWarnings,
      errors: [],
      ingestedAt,
      individualResults: {
        simulation: simulationResult,
        erpMetadata: erpResult,
        costBaseline: costBaselineResult,
      },
    };
  }

  /**
   * Cross-validate data across different sources.
   * Checks referential integrity between simulation, ERP, and cost baseline.
   */
  private crossValidate(data: IngestedData): string[] {
    const warnings: string[] = [];

    // Check that the baseline ID referenced in simulation matches the loaded baseline
    if (data.simulation.scenario.baselineId !== data.costBaseline.baselineId) {
      warnings.push(
        `Simulation references baseline ${data.simulation.scenario.baselineId} ` +
        `but loaded baseline is ${data.costBaseline.baselineId}`
      );
    }

    // Check that reporting currency is consistent
    // Note: Cost baseline doesn't have a single reporting currency, so we check labor rates
    const laborCurrencies = new Set(data.costBaseline.laborRates.map((r) => r.currency));
    if (!laborCurrencies.has(data.erpMetadata.reportingCurrency)) {
      warnings.push(
        `ERP reporting currency ${data.erpMetadata.reportingCurrency} ` +
        `is not represented in cost baseline labor rates`
      );
    }

    // Validate cost center references between ERP and cost baseline overhead factors
    const erpCostCenterIds = new Set(data.erpMetadata.costCenters.map((cc) => cc.costCenterId));
    for (const overhead of data.costBaseline.overheadFactors) {
      if (!erpCostCenterIds.has(overhead.costCenterId)) {
        warnings.push(
          `Cost baseline overhead references cost center ${overhead.costCenterId} ` +
          `which is not present in ERP metadata`
        );
      }
    }

    return warnings;
  }
}
