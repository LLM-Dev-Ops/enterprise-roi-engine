/**
 * NormalizationOrchestrator
 * Orchestrates all normalization components to produce a NormalizedDataset.
 * Handles validation, deduplication, and referential integrity checks.
 */

import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

import {
  SimulationOutput,
  ERPMetadata,
  CostBaseline,
  NormalizedDataset,
  InputChecksums,
  CanonicalDecisionRecord,
  AllocationMethod,
} from '../contracts';

import { EntityNormalizer } from './EntityNormalizer';
import { UnitHarmonizer, ExchangeRate } from './UnitHarmonizer';
import { TemporalAligner } from './TemporalAligner';
import { DecisionNormalizer, RawDecisionInput, DecisionNormalizerConfig } from './DecisionNormalizer';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for the normalization orchestrator.
 */
export interface NormalizationOrchestratorConfig {
  readonly sourceSystem: string;
  readonly defaultCostCenterId: string;
  readonly defaultAllocationMethod: AllocationMethod;
  readonly deduplicationStrategy: DeduplicationStrategy;
  readonly validateReferentialIntegrity: boolean;
}

/**
 * Strategy for handling duplicate decisions.
 */
export enum DeduplicationStrategy {
  /** Keep first occurrence, discard duplicates */
  KEEP_FIRST = 'KEEP_FIRST',
  /** Keep last occurrence, discard earlier ones */
  KEEP_LAST = 'KEEP_LAST',
  /** Merge duplicate decisions */
  MERGE = 'MERGE',
  /** Fail if duplicates are detected */
  FAIL_ON_DUPLICATE = 'FAIL_ON_DUPLICATE',
}

/**
 * Result of normalization with detailed information.
 */
export interface NormalizationOrchestratorResult {
  readonly dataset: NormalizedDataset;
  readonly summary: NormalizationSummary;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
}

/**
 * Summary of the normalization process.
 */
export interface NormalizationSummary {
  readonly totalDecisionsProcessed: number;
  readonly decisionsNormalized: number;
  readonly decisionsSkipped: number;
  readonly duplicatesRemoved: number;
  readonly referentialIntegrityIssues: number;
  readonly processingTimeMs: number;
}

/**
 * Referential integrity validation result.
 */
interface ReferentialIntegrityResult {
  readonly isValid: boolean;
  readonly issues: readonly string[];
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: NormalizationOrchestratorConfig = {
  sourceSystem: 'enterprise-roi-engine',
  defaultCostCenterId: 'DEFAULT',
  defaultAllocationMethod: AllocationMethod.DIRECT,
  deduplicationStrategy: DeduplicationStrategy.KEEP_FIRST,
  validateReferentialIntegrity: true,
};

// ============================================================================
// NormalizationOrchestrator Class
// ============================================================================

export class NormalizationOrchestrator {
  private readonly config: NormalizationOrchestratorConfig;
  private entityNormalizer: EntityNormalizer | null = null;
  private unitHarmonizer: UnitHarmonizer | null = null;
  private temporalAligner: TemporalAligner | null = null;
  private decisionNormalizer: DecisionNormalizer | null = null;

  constructor(config: Partial<NormalizationOrchestratorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================================================
  // Main Orchestration Method
  // ============================================================================

  /**
   * Normalizes ingested data from simulation, ERP, and cost baseline sources.
   */
  normalize(
    simulationOutput: SimulationOutput,
    erpMetadata: ERPMetadata,
    costBaseline: CostBaseline
  ): NormalizationOrchestratorResult {
    const startTime = Date.now();
    const warnings: string[] = [];
    const errors: string[] = [];

    // Initialize all normalizers
    this.initializeNormalizers(simulationOutput, erpMetadata, costBaseline);

    // Validate time horizon against fiscal calendar
    const timeHorizonValidation = this.temporalAligner!.validateTimeHorizon(
      simulationOutput.metadata.timestamp,
      simulationOutput.scenario.timeHorizonMonths
    );

    if (!timeHorizonValidation.isValid) {
      errors.push(...timeHorizonValidation.errors);
    }
    warnings.push(...timeHorizonValidation.warnings);

    // Prepare raw decision inputs
    const rawInputs = this.prepareRawDecisionInputs(simulationOutput);

    // Normalize all decisions
    const normalizationResults = this.decisionNormalizer!.normalizeDecisions(rawInputs);

    // Collect warnings from normalization
    for (const result of normalizationResults) {
      warnings.push(...result.warnings);
    }

    // Extract records
    let records = normalizationResults.map(r => r.record);

    // Deduplicate decisions
    const deduplicationResult = this.deduplicateDecisions(records);
    records = deduplicationResult.records;
    warnings.push(...deduplicationResult.warnings);

    // Validate referential integrity
    if (this.config.validateReferentialIntegrity) {
      const integrityResult = this.validateReferentialIntegrity(
        records,
        erpMetadata
      );
      if (!integrityResult.isValid) {
        warnings.push(...integrityResult.issues);
      }
    }

    // Sort records deterministically
    records = this.sortRecordsDeterministically(records);

    // Calculate checksums
    const inputChecksums = this.calculateInputChecksums(
      simulationOutput,
      erpMetadata,
      costBaseline
    );

    // Build normalized dataset
    const dataset: NormalizedDataset = {
      normalizationId: uuidv4(),
      decisions: records,
      recordCount: records.length,
      normalizationTimestamp: new Date().toISOString(),
      baseCurrency: erpMetadata.reportingCurrency,
      inputChecksums,
    };

    const endTime = Date.now();

    const summary: NormalizationSummary = {
      totalDecisionsProcessed: simulationOutput.decisions.length,
      decisionsNormalized: records.length,
      decisionsSkipped: simulationOutput.decisions.length - normalizationResults.length,
      duplicatesRemoved: deduplicationResult.duplicatesRemoved,
      referentialIntegrityIssues: this.countIntegrityIssues(records, erpMetadata),
      processingTimeMs: endTime - startTime,
    };

    return {
      dataset,
      summary,
      warnings,
      errors,
    };
  }

  // ============================================================================
  // Initializer Methods
  // ============================================================================

  private initializeNormalizers(
    _simulationOutput: SimulationOutput,
    erpMetadata: ERPMetadata,
    costBaseline: CostBaseline
  ): void {
    // Note: _simulationOutput is reserved for future use (e.g., dynamic rate determination)

    // Initialize EntityNormalizer
    this.entityNormalizer = new EntityNormalizer(
      erpMetadata.costCenters,
      erpMetadata.chartOfAccounts,
      erpMetadata.entities
    );

    // Build exchange rates from cost baseline
    const exchangeRates = this.buildExchangeRates(erpMetadata, costBaseline);

    // Initialize UnitHarmonizer
    this.unitHarmonizer = new UnitHarmonizer(
      exchangeRates,
      erpMetadata.reportingCurrency
    );

    // Initialize TemporalAligner
    this.temporalAligner = new TemporalAligner(
      erpMetadata.fiscalCalendar
    );

    // Initialize DecisionNormalizer
    const decisionConfig: DecisionNormalizerConfig = {
      baseCurrency: erpMetadata.reportingCurrency,
      sourceSystem: this.config.sourceSystem,
      defaultCostCenterId: this.config.defaultCostCenterId,
      defaultAllocationMethod: this.config.defaultAllocationMethod,
    };

    this.decisionNormalizer = new DecisionNormalizer(
      decisionConfig,
      this.entityNormalizer,
      this.unitHarmonizer,
      this.temporalAligner
    );
  }

  private buildExchangeRates(
    erpMetadata: ERPMetadata,
    costBaseline: CostBaseline
  ): ExchangeRate[] {
    const rates: ExchangeRate[] = [];
    const baseCurrency = erpMetadata.reportingCurrency;
    const seenPairs = new Set<string>();

    // Collect unique currencies from various sources
    const currencies = new Set<string>();
    currencies.add(baseCurrency);

    for (const account of erpMetadata.chartOfAccounts) {
      currencies.add(account.currency);
    }

    for (const costCenter of erpMetadata.costCenters) {
      currencies.add(costCenter.currency);
    }

    for (const rate of costBaseline.laborRates) {
      currencies.add(rate.currency);
    }

    for (const cost of costBaseline.infrastructureCosts) {
      currencies.add(cost.currency);
    }

    // Create identity rates (1:1 for same currency)
    for (const currency of Array.from(currencies)) {
      if (currency !== baseCurrency) {
        const key = `${currency}-${baseCurrency}`;
        if (!seenPairs.has(key)) {
          seenPairs.add(key);
          // Default to 1:1 rate if no specific rate available
          // In production, these would come from a rate service
          rates.push({
            sourceCurrency: currency,
            targetCurrency: baseCurrency,
            rate: '1.0000', // Placeholder - would be real rates
            effectiveDate: costBaseline.snapshotTimestamp,
          });
        }
      }
    }

    return rates;
  }

  // ============================================================================
  // Decision Processing
  // ============================================================================

  private prepareRawDecisionInputs(
    simulationOutput: SimulationOutput
  ): RawDecisionInput[] {
    const inputs: RawDecisionInput[] = [];

    // Sort decisions deterministically
    const sortedDecisions = [...simulationOutput.decisions].sort((a, b) =>
      a.nodeId.localeCompare(b.nodeId)
    );

    // Sort resource deltas deterministically
    const sortedDeltas = [...simulationOutput.resourceDeltas].sort((a, b) => {
      if (a.period !== b.period) return a.period - b.period;
      return a.resourceType.localeCompare(b.resourceType);
    });

    for (const decision of sortedDecisions) {
      // Associate resource deltas with decisions
      // In a real implementation, this would use more sophisticated matching
      inputs.push({
        decision,
        resourceDeltas: sortedDeltas,
        simulationStartDate: simulationOutput.metadata.timestamp,
      });
    }

    return inputs;
  }

  // ============================================================================
  // Deduplication
  // ============================================================================

  private deduplicateDecisions(
    records: readonly CanonicalDecisionRecord[]
  ): {
    records: CanonicalDecisionRecord[];
    duplicatesRemoved: number;
    warnings: string[];
  } {
    const warnings: string[] = [];
    const seen = new Map<string, CanonicalDecisionRecord>();
    const duplicateKeys = new Set<string>();

    for (const record of records) {
      const key = this.generateDeduplicationKey(record);

      if (seen.has(key)) {
        duplicateKeys.add(key);

        switch (this.config.deduplicationStrategy) {
          case DeduplicationStrategy.KEEP_FIRST:
            // Keep existing, skip this one
            warnings.push(
              `Duplicate decision detected: ${record.sourceDecisionId} ` +
              `(keeping first occurrence)`
            );
            break;

          case DeduplicationStrategy.KEEP_LAST:
            // Replace with this one
            seen.set(key, record);
            warnings.push(
              `Duplicate decision detected: ${record.sourceDecisionId} ` +
              `(keeping last occurrence)`
            );
            break;

          case DeduplicationStrategy.MERGE:
            // Merge records
            const existing = seen.get(key)!;
            const merged = this.mergeRecords(existing, record);
            seen.set(key, merged);
            warnings.push(
              `Duplicate decision detected: ${record.sourceDecisionId} ` +
              `(merged with existing)`
            );
            break;

          case DeduplicationStrategy.FAIL_ON_DUPLICATE:
            throw new Error(
              `Duplicate decision detected: ${record.sourceDecisionId}`
            );
        }
      } else {
        seen.set(key, record);
      }
    }

    return {
      records: Array.from(seen.values()),
      duplicatesRemoved: duplicateKeys.size,
      warnings,
    };
  }

  private generateDeduplicationKey(record: CanonicalDecisionRecord): string {
    // Create a key based on decision content, not the generated IDs
    const keyData = {
      sourceDecisionId: record.sourceDecisionId,
      decisionCategory: record.decisionCategory,
      primaryCostCenterId: record.primaryCostCenterId,
      grossImpactAmount: record.grossImpactAmount,
    };
    return createHash('md5').update(JSON.stringify(keyData)).digest('hex');
  }

  private mergeRecords(
    existing: CanonicalDecisionRecord,
    incoming: CanonicalDecisionRecord
  ): CanonicalDecisionRecord {
    // Merge strategy: keep higher confidence, combine allocations
    const mergedAllocations = this.mergeAllocations(
      existing.secondaryCostCenters,
      incoming.secondaryCostCenters
    );

    return {
      ...existing,
      confidenceScore: Math.max(existing.confidenceScore, incoming.confidenceScore),
      secondaryCostCenters: mergedAllocations,
      // Use the later normalization timestamp
      normalizationTimestamp: existing.normalizationTimestamp > incoming.normalizationTimestamp
        ? existing.normalizationTimestamp
        : incoming.normalizationTimestamp,
    };
  }

  private mergeAllocations(
    existing: readonly { costCenterId: string; allocationPercentage: number; allocationMethod: AllocationMethod }[],
    incoming: readonly { costCenterId: string; allocationPercentage: number; allocationMethod: AllocationMethod }[]
  ): readonly { costCenterId: string; allocationPercentage: number; allocationMethod: AllocationMethod }[] {
    const merged = new Map<string, { costCenterId: string; allocationPercentage: number; allocationMethod: AllocationMethod }>();

    for (const alloc of existing) {
      merged.set(alloc.costCenterId, alloc);
    }

    for (const alloc of incoming) {
      const existing = merged.get(alloc.costCenterId);
      if (existing) {
        // Average the percentages
        merged.set(alloc.costCenterId, {
          ...existing,
          allocationPercentage: (existing.allocationPercentage + alloc.allocationPercentage) / 2,
        });
      } else {
        merged.set(alloc.costCenterId, alloc);
      }
    }

    // Normalize to 100%
    const allocations = Array.from(merged.values());
    const total = allocations.reduce((sum, a) => sum + a.allocationPercentage, 0);

    if (total > 0) {
      return allocations.map(a => ({
        ...a,
        allocationPercentage: (a.allocationPercentage / total) * 100,
      }));
    }

    return allocations;
  }

  // ============================================================================
  // Referential Integrity
  // ============================================================================

  private validateReferentialIntegrity(
    records: readonly CanonicalDecisionRecord[],
    erpMetadata: ERPMetadata
  ): ReferentialIntegrityResult {
    const issues: string[] = [];
    const costCenterIds = new Set(erpMetadata.costCenters.map(cc => cc.costCenterId));
    const glAccountIds = new Set(erpMetadata.chartOfAccounts.map(a => a.accountId));

    for (const record of records) {
      // Validate primary cost center
      if (!costCenterIds.has(record.primaryCostCenterId)) {
        if (record.primaryCostCenterId !== this.config.defaultCostCenterId) {
          issues.push(
            `Record ${record.recordId}: Unknown cost center ${record.primaryCostCenterId}`
          );
        }
      }

      // Validate secondary cost centers
      for (const alloc of record.secondaryCostCenters) {
        if (!costCenterIds.has(alloc.costCenterId)) {
          issues.push(
            `Record ${record.recordId}: Unknown secondary cost center ${alloc.costCenterId}`
          );
        }
      }

      // Validate GL accounts
      for (const impact of record.glAccountImpacts) {
        if (!glAccountIds.has(impact.glAccountId)) {
          issues.push(
            `Record ${record.recordId}: Unknown GL account ${impact.glAccountId}`
          );
        }
      }

      // Validate allocation percentages sum
      if (record.secondaryCostCenters.length > 0) {
        const totalPct = record.secondaryCostCenters.reduce(
          (sum, a) => sum + a.allocationPercentage,
          0
        );
        if (Math.abs(totalPct - 100) > 0.01 && totalPct !== 0) {
          issues.push(
            `Record ${record.recordId}: Allocation percentages sum to ${totalPct}%, expected 100%`
          );
        }
      }
    }

    return {
      isValid: issues.length === 0,
      issues,
    };
  }

  private countIntegrityIssues(
    records: readonly CanonicalDecisionRecord[],
    erpMetadata: ERPMetadata
  ): number {
    const result = this.validateReferentialIntegrity(records, erpMetadata);
    return result.issues.length;
  }

  // ============================================================================
  // Deterministic Sorting
  // ============================================================================

  private sortRecordsDeterministically(
    records: readonly CanonicalDecisionRecord[]
  ): CanonicalDecisionRecord[] {
    return [...records].sort((a, b) => {
      // Primary sort by source decision ID
      const idCompare = a.sourceDecisionId.localeCompare(b.sourceDecisionId);
      if (idCompare !== 0) return idCompare;

      // Secondary sort by normalization timestamp
      return a.normalizationTimestamp.localeCompare(b.normalizationTimestamp);
    });
  }

  // ============================================================================
  // Checksum Calculation
  // ============================================================================

  private calculateInputChecksums(
    simulationOutput: SimulationOutput,
    erpMetadata: ERPMetadata,
    costBaseline: CostBaseline
  ): InputChecksums {
    return {
      simulationChecksum: this.hashObject(simulationOutput),
      erpMetadataChecksum: this.hashObject(erpMetadata),
      costBaselineChecksum: this.hashObject(costBaseline),
    };
  }

  private hashObject(obj: unknown): string {
    const sortedJson = JSON.stringify(obj, this.sortedReplacer);
    return createHash('sha256').update(sortedJson).digest('hex');
  }

  private sortedReplacer(_key: string, value: unknown): unknown {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.keys(value as Record<string, unknown>)
        .sort()
        .reduce((sorted, key) => {
          sorted[key] = (value as Record<string, unknown>)[key];
          return sorted;
        }, {} as Record<string, unknown>);
    }
    return value;
  }

  // ============================================================================
  // Accessors
  // ============================================================================

  /**
   * Gets the entity normalizer (after initialization).
   */
  getEntityNormalizer(): EntityNormalizer | null {
    return this.entityNormalizer;
  }

  /**
   * Gets the unit harmonizer (after initialization).
   */
  getUnitHarmonizer(): UnitHarmonizer | null {
    return this.unitHarmonizer;
  }

  /**
   * Gets the temporal aligner (after initialization).
   */
  getTemporalAligner(): TemporalAligner | null {
    return this.temporalAligner;
  }

  /**
   * Gets the decision normalizer (after initialization).
   */
  getDecisionNormalizer(): DecisionNormalizer | null {
    return this.decisionNormalizer;
  }

  /**
   * Gets the current configuration.
   */
  getConfig(): NormalizationOrchestratorConfig {
    return this.config;
  }
}
