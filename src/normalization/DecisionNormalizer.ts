/**
 * DecisionNormalizer
 * Transforms raw decisions from simulation output into CanonicalDecisionRecord.
 * Maps decision types to categories, resolves cost centers, and builds GL impacts.
 */

import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';

import {
  DecisionCategory,
  AllocationMethod,
  ImpactType,
  AccountType,
  CanonicalDecisionRecord,
  CostCenterAllocation,
  GLAccountImpact,
  DecisionNode,
  ResourceDelta,
  DeltaDirection,
  ResourceType,
  GLAccount,
} from '../contracts';

import { EntityNormalizer } from './EntityNormalizer';
import { UnitHarmonizer } from './UnitHarmonizer';
import { TemporalAligner } from './TemporalAligner';
import {
  toDecimal,
  toString,
  multiply,
  add,
  divide,
  Decimal,
  zero,
} from '../lib/financial';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for decision normalization.
 */
export interface DecisionNormalizerConfig {
  readonly baseCurrency: string;
  readonly sourceSystem: string;
  readonly defaultCostCenterId: string;
  readonly defaultAllocationMethod: AllocationMethod;
}

/**
 * Raw decision with associated resource deltas.
 */
export interface RawDecisionInput {
  readonly decision: DecisionNode;
  readonly resourceDeltas: readonly ResourceDelta[];
  readonly simulationStartDate: string;
}

/**
 * Result of decision type mapping.
 */
export interface DecisionTypeMapping {
  readonly decisionCategory: DecisionCategory;
  readonly riskCategoryId: string;
  readonly glAccountTypes: readonly AccountType[];
}

/**
 * Decision normalization result.
 */
export interface NormalizationResult {
  readonly record: CanonicalDecisionRecord;
  readonly warnings: readonly string[];
}

// ============================================================================
// Decision Type Mappings
// ============================================================================

/**
 * Maps decision text patterns to decision categories.
 * Order matters - first match wins.
 */
const DECISION_TYPE_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  category: DecisionCategory;
  riskCategoryId: string;
  glAccountTypes: readonly AccountType[];
}> = [
  {
    pattern: /resource.*alloc|allocat.*resource|headcount|fte|staffing/i,
    category: DecisionCategory.RESOURCE_ALLOCATION,
    riskCategoryId: 'RESOURCE_ALLOC',
    glAccountTypes: [AccountType.EXPENSE],
  },
  {
    pattern: /process.*optim|optim.*process|workflow.*improv|efficien|automat/i,
    category: DecisionCategory.PROCESS_OPTIMIZATION,
    riskCategoryId: 'PROCESS_OPT',
    glAccountTypes: [AccountType.EXPENSE],
  },
  {
    pattern: /vendor|supplier|contract|procurement|sourc/i,
    category: DecisionCategory.VENDOR_SELECTION,
    riskCategoryId: 'VENDOR_SEL',
    glAccountTypes: [AccountType.EXPENSE, AccountType.LIABILITY],
  },
  {
    pattern: /capacity|scale|growth|expansion|infra/i,
    category: DecisionCategory.CAPACITY_PLANNING,
    riskCategoryId: 'CAPACITY_PLAN',
    glAccountTypes: [AccountType.ASSET, AccountType.EXPENSE],
  },
  {
    pattern: /risk|mitigat|contingenc|compliance|security/i,
    category: DecisionCategory.RISK_MITIGATION,
    riskCategoryId: 'RISK_MIT',
    glAccountTypes: [AccountType.EXPENSE],
  },
  {
    pattern: /cost.*reduc|reduc.*cost|savings|cut|eliminat|consolid/i,
    category: DecisionCategory.COST_REDUCTION,
    riskCategoryId: 'COST_RED',
    glAccountTypes: [AccountType.EXPENSE],
  },
];

/**
 * Default mapping when no pattern matches.
 */
const DEFAULT_DECISION_MAPPING: DecisionTypeMapping = {
  decisionCategory: DecisionCategory.RESOURCE_ALLOCATION,
  riskCategoryId: 'DEFAULT',
  glAccountTypes: [AccountType.EXPENSE],
};

// ============================================================================
// DecisionNormalizer Class
// ============================================================================

export class DecisionNormalizer {
  private readonly config: DecisionNormalizerConfig;
  private readonly entityNormalizer: EntityNormalizer;
  private readonly unitHarmonizer: UnitHarmonizer;
  private readonly temporalAligner: TemporalAligner;
  private readonly glAccountsByType: Map<AccountType, readonly GLAccount[]>;

  constructor(
    config: DecisionNormalizerConfig,
    entityNormalizer: EntityNormalizer,
    unitHarmonizer: UnitHarmonizer,
    temporalAligner: TemporalAligner
  ) {
    this.config = config;
    this.entityNormalizer = entityNormalizer;
    this.unitHarmonizer = unitHarmonizer;
    this.temporalAligner = temporalAligner;
    this.glAccountsByType = this.buildGLAccountTypeMap();
  }

  // ============================================================================
  // Public Methods
  // ============================================================================

  /**
   * Normalizes a raw decision into a CanonicalDecisionRecord.
   */
  normalizeDecision(input: RawDecisionInput): NormalizationResult {
    const warnings: string[] = [];
    const { decision, resourceDeltas, simulationStartDate } = input;

    // Map decision type to category
    const typeMapping = this.mapDecisionType(decision.decision);

    // Resolve cost centers from decision context
    const costCenterResolution = this.resolveCostCenters(decision, resourceDeltas);
    if (costCenterResolution.warnings.length > 0) {
      warnings.push(...costCenterResolution.warnings);
    }

    // Calculate gross impact amount from resource deltas
    const grossImpact = this.calculateGrossImpact(resourceDeltas);

    // Determine impact horizon from resource deltas
    const impactHorizonMonths = this.calculateImpactHorizon(resourceDeltas);

    // Build GL account impacts
    const glAccountImpacts = this.buildGLAccountImpacts(
      typeMapping.glAccountTypes,
      grossImpact.amount,
      simulationStartDate,
      impactHorizonMonths
    );

    // Normalize allocation percentages
    const normalizedAllocations = this.normalizeAllocations(
      costCenterResolution.secondaryCostCenters
    );

    // Calculate volatility score from decision probability
    const volatilityScore = this.calculateVolatilityScore(decision.probability);

    // Generate checksum of raw input
    const rawChecksum = this.generateChecksum(decision, resourceDeltas);

    const record: CanonicalDecisionRecord = {
      recordId: uuidv4(),
      sourceDecisionId: decision.nodeId,
      decisionTimestamp: new Date().toISOString(),
      decisionCategory: typeMapping.decisionCategory,
      primaryCostCenterId: costCenterResolution.primaryCostCenterId,
      secondaryCostCenters: normalizedAllocations,
      glAccountImpacts,
      grossImpactAmount: grossImpact.amount,
      confidenceScore: decision.probability,
      impactHorizonMonths,
      riskCategoryId: typeMapping.riskCategoryId,
      volatilityScore,
      sourceSystem: this.config.sourceSystem,
      normalizationTimestamp: new Date().toISOString(),
      rawChecksum,
    };

    return { record, warnings };
  }

  /**
   * Normalizes multiple decisions, maintaining deterministic order.
   */
  normalizeDecisions(inputs: readonly RawDecisionInput[]): readonly NormalizationResult[] {
    // Sort inputs deterministically by decision ID then by timestamp
    const sorted = [...inputs].sort((a, b) => {
      const idCompare = a.decision.nodeId.localeCompare(b.decision.nodeId);
      if (idCompare !== 0) return idCompare;
      return 0; // Same ID means same decision
    });

    return sorted.map(input => this.normalizeDecision(input));
  }

  /**
   * Maps a decision text to its category.
   */
  mapDecisionType(decisionText: string): DecisionTypeMapping {
    for (const mapping of DECISION_TYPE_PATTERNS) {
      if (mapping.pattern.test(decisionText)) {
        return {
          decisionCategory: mapping.category,
          riskCategoryId: mapping.riskCategoryId,
          glAccountTypes: mapping.glAccountTypes,
        };
      }
    }
    return DEFAULT_DECISION_MAPPING;
  }

  /**
   * Gets the decision category enum value from a string.
   */
  parseDecisionCategory(categoryString: string): DecisionCategory {
    const normalized = categoryString.toUpperCase().replace(/[- ]/g, '_');
    const category = DecisionCategory[normalized as keyof typeof DecisionCategory];
    if (!category) {
      return DecisionCategory.RESOURCE_ALLOCATION; // Default
    }
    return category;
  }

  /**
   * Gets the unit harmonizer for currency conversion operations.
   */
  getUnitHarmonizer(): UnitHarmonizer {
    return this.unitHarmonizer;
  }

  // ============================================================================
  // Cost Center Resolution
  // ============================================================================

  private resolveCostCenters(
    decision: DecisionNode,
    resourceDeltas: readonly ResourceDelta[]
  ): {
    primaryCostCenterId: string;
    secondaryCostCenters: CostCenterAllocation[];
    warnings: string[];
  } {
    const warnings: string[] = [];
    const costCenterIds = new Set<string>();

    // Extract cost center hints from decision outcome metrics
    const metrics = decision.outcomeMetrics;
    for (const [key, value] of Object.entries(metrics)) {
      if (key.toLowerCase().includes('costcenter') && typeof value === 'string') {
        const cc = this.entityNormalizer.getCostCenter(value);
        if (cc && cc.isActive) {
          costCenterIds.add(value);
        }
      }
    }

    // Extract from resource delta context
    for (const delta of resourceDeltas) {
      // Check if resourceType maps to a known cost center
      const entityCostCenters = this.entityNormalizer.resolveEntityToCostCenters(
        delta.resourceType
      );
      for (const ccId of entityCostCenters) {
        costCenterIds.add(ccId);
      }
    }

    // If no cost centers found, use default
    if (costCenterIds.size === 0) {
      warnings.push(
        `No cost centers found for decision ${decision.nodeId}, using default: ${this.config.defaultCostCenterId}`
      );
      costCenterIds.add(this.config.defaultCostCenterId);
    }

    // Sort deterministically
    const sortedIds = Array.from(costCenterIds).sort();

    // First one is primary
    const primaryCostCenterId = sortedIds[0] as string;

    // Rest are secondary with equal allocation
    const secondaryCount = sortedIds.length - 1;
    const secondaryCostCenters: CostCenterAllocation[] = [];

    if (secondaryCount > 0) {
      const allocationPercentage = 100 / sortedIds.length;

      for (let i = 1; i < sortedIds.length; i++) {
        const ccId = sortedIds[i];
        if (ccId !== undefined) {
          secondaryCostCenters.push({
            costCenterId: ccId,
            allocationPercentage,
            allocationMethod: this.config.defaultAllocationMethod,
          });
        }
      }
    }

    return {
      primaryCostCenterId,
      secondaryCostCenters,
      warnings,
    };
  }

  // ============================================================================
  // Impact Calculation
  // ============================================================================

  private calculateGrossImpact(resourceDeltas: readonly ResourceDelta[]): {
    amount: string;
    direction: 'savings' | 'cost';
  } {
    let totalAmount = zero();
    let savingsAmount = zero();
    let costAmount = zero();

    for (const delta of resourceDeltas) {
      const quantity = toDecimal(delta.quantity);
      const unitCost = this.getResourceUnitCost(delta.resourceType, delta.unit);

      const amount = multiply(quantity, unitCost);

      if (delta.direction === DeltaDirection.DECREASE) {
        savingsAmount = add(savingsAmount, amount);
      } else {
        costAmount = add(costAmount, amount);
      }
    }

    // Net amount (positive = savings, negative = cost)
    totalAmount = add(savingsAmount, toDecimal('-1').times(costAmount));

    const direction = totalAmount.isPositive() || totalAmount.isZero()
      ? 'savings'
      : 'cost';

    return {
      amount: toString(totalAmount.abs()),
      direction,
    };
  }

  private getResourceUnitCost(resourceType: ResourceType | string, _unit: string): Decimal {
    // Default unit costs for different resource types
    // In practice, these would come from the CostBaseline
    // The _unit parameter is reserved for future unit-based cost lookup
    const defaultCosts: Record<string, string> = {
      [ResourceType.FTE]: '150.00', // Per hour, fully loaded
      [ResourceType.COMPUTE]: '0.10', // Per compute hour
      [ResourceType.LICENSE]: '100.00', // Per license per month
      [ResourceType.CUSTOM]: '1.00', // Generic unit
    };

    const cost = defaultCosts[resourceType] ?? '1.00';
    return toDecimal(cost);
  }

  private calculateImpactHorizon(resourceDeltas: readonly ResourceDelta[]): number {
    if (resourceDeltas.length === 0) {
      return 12; // Default to 12 months
    }

    // Find the maximum period from resource deltas
    let maxPeriod = 0;
    for (const delta of resourceDeltas) {
      if (delta.period > maxPeriod) {
        maxPeriod = delta.period;
      }
    }

    // Add 1 because periods are 0-indexed
    return Math.max(1, maxPeriod + 1);
  }

  // ============================================================================
  // GL Account Impact Building
  // ============================================================================

  private buildGLAccountImpacts(
    accountTypes: readonly AccountType[],
    amount: string,
    startDate: string,
    horizonMonths: number
  ): readonly GLAccountImpact[] {
    const impacts: GLAccountImpact[] = [];

    // Get fiscal periods for the impact horizon
    const alignment = this.temporalAligner.alignTimeHorizon(startDate, horizonMonths);

    // Distribute amount across periods
    const amountPerPeriod = divide(amount, horizonMonths.toString());

    for (const period of alignment.fiscalPeriods) {
      for (const accountType of accountTypes) {
        const accounts = this.glAccountsByType.get(accountType) ?? [];
        if (accounts.length === 0) continue;

        // Use first active account of the type
        const account = accounts.find(a => a.isActive);
        if (!account) continue;

        // Determine impact type based on account type
        const impactType = this.determineImpactType(accountType, amountPerPeriod);

        impacts.push({
          glAccountId: account.accountId,
          impactType,
          amount: toString(amountPerPeriod.abs()),
          period,
        });
      }
    }

    // Sort deterministically
    return impacts.sort((a, b) => {
      if (a.period.year !== b.period.year) return a.period.year - b.period.year;
      if (a.period.period !== b.period.period) return a.period.period - b.period.period;
      return a.glAccountId.localeCompare(b.glAccountId);
    });
  }

  private determineImpactType(
    accountType: AccountType,
    amount: Decimal
  ): ImpactType {
    const isPositive = amount.isPositive();

    switch (accountType) {
      case AccountType.EXPENSE:
        // Positive amount = debit to expense (cost)
        return isPositive ? ImpactType.DEBIT : ImpactType.CREDIT;
      case AccountType.ASSET:
        // Positive amount = debit to asset (increase)
        return isPositive ? ImpactType.DEBIT : ImpactType.CREDIT;
      case AccountType.LIABILITY:
        // Positive amount = credit to liability (increase)
        return isPositive ? ImpactType.CREDIT : ImpactType.DEBIT;
      case AccountType.REVENUE:
        // Positive amount = credit to revenue (increase)
        return isPositive ? ImpactType.CREDIT : ImpactType.DEBIT;
      case AccountType.EQUITY:
        // Positive amount = credit to equity (increase)
        return isPositive ? ImpactType.CREDIT : ImpactType.DEBIT;
      default:
        return ImpactType.DEBIT;
    }
  }

  // ============================================================================
  // Allocation Normalization
  // ============================================================================

  /**
   * Normalizes allocation percentages to sum to 100%.
   */
  normalizeAllocations(
    allocations: readonly CostCenterAllocation[]
  ): readonly CostCenterAllocation[] {
    if (allocations.length === 0) {
      return [];
    }

    // Canonicalize before assigning the rounding remainder, including the
    // already-normalized path. Never mutate the caller's readonly input.
    const sorted = [...allocations].sort((a, b) => a.costCenterId.localeCompare(b.costCenterId));
    const total = sorted.reduce((sum, a) => sum + a.allocationPercentage, 0);

    // If already 100%, return as-is
    if (Math.abs(total - 100) < 0.001) {
      return sorted;
    }

    // Normalize to 100%
    const factor = 100 / total;
    let runningTotal = 0;

    const normalized = sorted.map((allocation, index) => {
      if (index === sorted.length - 1) {
        // Last allocation gets the remainder to ensure exact 100%
        return {
          ...allocation,
          allocationPercentage: 100 - runningTotal,
        };
      }

      const normalizedPct = Math.round(allocation.allocationPercentage * factor * 100) / 100;
      runningTotal += normalizedPct;

      return {
        ...allocation,
        allocationPercentage: normalizedPct,
      };
    });

    // Sort deterministically
    return normalized.sort((a, b) =>
      a.costCenterId.localeCompare(b.costCenterId)
    );
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  private calculateVolatilityScore(probability: number): number {
    // Volatility is inversely related to confidence
    // Higher probability = lower volatility
    // Score from 0 (stable) to 1 (volatile)
    return Math.max(0, Math.min(1, 1 - probability));
  }

  private generateChecksum(
    decision: DecisionNode,
    resourceDeltas: readonly ResourceDelta[]
  ): string {
    const data = JSON.stringify({
      decision: {
        nodeId: decision.nodeId,
        parentId: decision.parentId,
        decision: decision.decision,
        probability: decision.probability,
        outcomeMetrics: Object.fromEntries(
          Object.entries(decision.outcomeMetrics).sort(([a], [b]) => a.localeCompare(b))
        ),
      },
      resourceDeltas: [...resourceDeltas]
        .sort((a, b) => a.period - b.period)
        .map(d => ({
          period: d.period,
          resourceType: d.resourceType,
          quantity: d.quantity,
          unit: d.unit,
          direction: d.direction,
        })),
    });

    return createHash('sha256').update(data).digest('hex');
  }

  private buildGLAccountTypeMap(): Map<AccountType, readonly GLAccount[]> {
    const map = new Map<AccountType, readonly GLAccount[]>();

    for (const accountType of Object.values(AccountType)) {
      const accounts = this.entityNormalizer.getGLAccountsByType(accountType);
      map.set(accountType, accounts);
    }

    return map;
  }
}
