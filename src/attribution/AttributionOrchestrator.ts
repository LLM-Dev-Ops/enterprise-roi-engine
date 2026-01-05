/**
 * AttributionOrchestrator
 * Coordinates the full attribution pipeline for normalized decision records.
 * Builds complete attribution chains and aggregates results by cost center and GL account.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  NormalizedDataset,
  CanonicalDecisionRecord,
  AttributionChain,
  AttributionResult,
  CostCenterSummary,
  GLAccountSummary,
  PrimaryAttribution,
  DistributedAttribution,
  FiscalPeriod,
  ImpactType,
} from '../contracts';
import { ERPMetadata } from '../contracts/erp';
import { CostBaseline } from '../contracts/costops';
import {
  toDecimal,
  add,
  subtract,
  sum,
  toCurrency,
  zero,
  isPositive,
  isNegative,
  Decimal,
} from '../lib/financial';

import { CostAttributor, PeriodAdjustment } from './CostAttributor';
import { OverheadAllocator } from './OverheadAllocator';
import { BenefitAttributor } from './BenefitAttributor';
import { RiskAttributor } from './RiskAttributor';

/**
 * Configuration for the attribution orchestrator
 */
export interface AttributionConfig {
  readonly erpMetadata: ERPMetadata;
  readonly costBaseline: CostBaseline;
  readonly periodAdjustments?: readonly PeriodAdjustment[];
  readonly defaultFiscalPeriod: FiscalPeriod;
}

/**
 * AttributionOrchestrator class for coordinating the full attribution pipeline
 */
export class AttributionOrchestrator {
  private readonly costAttributor: CostAttributor;
  private readonly overheadAllocator: OverheadAllocator;
  private readonly benefitAttributor: BenefitAttributor;
  private readonly riskAttributor: RiskAttributor;
  private readonly defaultFiscalPeriod: FiscalPeriod;

  constructor(config: AttributionConfig) {
    const { erpMetadata, costBaseline, periodAdjustments, defaultFiscalPeriod } = config;

    // Initialize component attributors
    this.costAttributor = new CostAttributor(
      erpMetadata.costCenters,
      periodAdjustments
    );

    this.overheadAllocator = new OverheadAllocator(
      costBaseline.overheadFactors,
      costBaseline.costModelVersion
    );

    this.benefitAttributor = new BenefitAttributor();

    this.riskAttributor = new RiskAttributor(
      costBaseline.riskWeights
    );

    this.defaultFiscalPeriod = defaultFiscalPeriod;
  }

  /**
   * Processes a normalized dataset and returns complete attribution results.
   * Decisions are processed in deterministic order (sorted by recordId).
   */
  public processDataset(dataset: NormalizedDataset): AttributionResult {
    const attributionId = uuidv4();
    const timestamp = new Date().toISOString();

    // Sort decisions by recordId for deterministic ordering
    const sortedDecisions = [...dataset.decisions].sort((a, b) =>
      a.recordId.localeCompare(b.recordId)
    );

    // Build attribution chains for each decision
    const attributionChains: AttributionChain[] = [];
    for (const decision of sortedDecisions) {
      const chain = this.buildAttributionChain(decision);
      attributionChains.push(chain);
    }

    // Aggregate by cost center
    const costCenterSummaries = this.aggregateByCostCenter(attributionChains);

    // Aggregate by GL account
    const glAccountSummaries = this.aggregateByGLAccount(sortedDecisions);

    // Calculate total attributed value
    const totalAttributedValue = this.calculateTotalAttributedValue(attributionChains);

    return {
      attributionId,
      attributionChains,
      costCenterSummaries,
      glAccountSummaries,
      totalAttributedValue: toCurrency(totalAttributedValue),
      timestamp,
    };
  }

  /**
   * Builds a complete attribution chain for a single decision.
   */
  private buildAttributionChain(decision: CanonicalDecisionRecord): AttributionChain {
    const timestamp = new Date().toISOString();

    // Determine fiscal period from decision or use default
    const fiscalPeriod = this.determineFiscalPeriod(decision);

    // Step 1: Compute primary attribution
    const primaryAttribution = this.costAttributor.computePrimaryAttribution(
      decision,
      fiscalPeriod
    );

    // Step 2: Apply overhead to get fully loaded amount
    const overheadAttribution = this.overheadAllocator.applyOverhead(
      decision.recordId,
      primaryAttribution.costCenterId,
      primaryAttribution.attributedAmount
    );

    // Step 3: Distribute benefits across cost centers
    const distributedAttributions = this.benefitAttributor.distributeBenefits(
      decision,
      overheadAttribution.fullyLoadedAmount
    );

    // Step 4: Calculate total attributed amount (sum of all distributions)
    const totalAttributedAmount = this.sumDistributions(distributedAttributions);

    // Determine attribution method based on how cost center was found
    const attributionMethod = this.determineAttributionMethod(primaryAttribution);

    return {
      decisionRecordId: decision.recordId,
      primaryAttribution,
      overheadAttribution,
      distributedAttributions,
      totalAttributedAmount: toCurrency(totalAttributedAmount),
      attributionMethod,
      attributionTimestamp: timestamp,
    };
  }

  /**
   * Determines the fiscal period for a decision.
   */
  private determineFiscalPeriod(decision: CanonicalDecisionRecord): FiscalPeriod {
    // If decision has GL impacts with period info, use the first one
    const firstImpact = decision.glAccountImpacts[0];
    if (firstImpact !== undefined) {
      return firstImpact.period;
    }
    return this.defaultFiscalPeriod;
  }

  /**
   * Sums all distributed attribution amounts.
   */
  private sumDistributions(
    distributions: readonly DistributedAttribution[]
  ): Decimal {
    const amounts = distributions.map(d => d.amount);
    return sum(amounts);
  }

  /**
   * Determines the attribution method based on primary attribution.
   */
  private determineAttributionMethod(primaryAttribution: PrimaryAttribution): string {
    if (primaryAttribution.attributionBasis.startsWith('DIRECT')) {
      return 'DIRECT_COST_CENTER';
    }
    if (primaryAttribution.attributionBasis.includes('HIERARCHY_ROLLUP')) {
      return 'HIERARCHY_ROLLUP';
    }
    return 'STANDARD';
  }

  /**
   * Aggregates attribution chains by cost center.
   */
  private aggregateByCostCenter(
    chains: readonly AttributionChain[]
  ): Map<string, CostCenterSummary> {
    const summaries = new Map<string, CostCenterAggregator>();

    for (const chain of chains) {
      // Process each distributed attribution
      for (const distribution of chain.distributedAttributions) {
        const { costCenterId, amount } = distribution;

        if (!summaries.has(costCenterId)) {
          summaries.set(costCenterId, {
            costCenterId,
            totalSavings: zero(),
            totalCosts: zero(),
            decisionCount: 0,
          });
        }

        const aggregator = summaries.get(costCenterId)!;
        const amountDecimal = toDecimal(amount);

        // Positive amounts are savings, negative are costs
        if (isPositive(amountDecimal)) {
          aggregator.totalSavings = add(aggregator.totalSavings, amountDecimal);
        } else if (isNegative(amountDecimal)) {
          aggregator.totalCosts = add(aggregator.totalCosts, amountDecimal.abs());
        }

        aggregator.decisionCount++;
      }
    }

    // Convert aggregators to summaries
    const result = new Map<string, CostCenterSummary>();
    for (const [id, agg] of summaries) {
      result.set(id, {
        costCenterId: agg.costCenterId,
        totalSavings: toCurrency(agg.totalSavings),
        totalCosts: toCurrency(agg.totalCosts),
        decisionCount: agg.decisionCount,
      });
    }

    return result;
  }

  /**
   * Aggregates GL account impacts across all decisions.
   */
  private aggregateByGLAccount(
    decisions: readonly CanonicalDecisionRecord[]
  ): Map<string, GLAccountSummary> {
    const summaries = new Map<string, GLAccountAggregator>();

    for (const decision of decisions) {
      for (const impact of decision.glAccountImpacts) {
        const { glAccountId, impactType, amount } = impact;

        if (!summaries.has(glAccountId)) {
          summaries.set(glAccountId, {
            glAccountId,
            totalDebits: zero(),
            totalCredits: zero(),
          });
        }

        const aggregator = summaries.get(glAccountId)!;
        const amountDecimal = toDecimal(amount);

        if (impactType === ImpactType.DEBIT) {
          aggregator.totalDebits = add(aggregator.totalDebits, amountDecimal);
        } else if (impactType === ImpactType.CREDIT) {
          aggregator.totalCredits = add(aggregator.totalCredits, amountDecimal);
        }
      }
    }

    // Convert aggregators to summaries with net amount
    const result = new Map<string, GLAccountSummary>();
    for (const [id, agg] of summaries) {
      const netAmount = subtract(agg.totalDebits, agg.totalCredits);
      result.set(id, {
        glAccountId: agg.glAccountId,
        totalDebits: toCurrency(agg.totalDebits),
        totalCredits: toCurrency(agg.totalCredits),
        netAmount: toCurrency(netAmount),
      });
    }

    return result;
  }

  /**
   * Calculates the total attributed value across all chains.
   */
  private calculateTotalAttributedValue(
    chains: readonly AttributionChain[]
  ): Decimal {
    const amounts = chains.map(c => c.totalAttributedAmount);
    return sum(amounts);
  }

  /**
   * Gets the risk attribution for a decision.
   */
  public getRiskAttribution(decision: CanonicalDecisionRecord) {
    return this.riskAttributor.calculateRiskFactor(decision);
  }

  /**
   * Gets the overhead breakdown for a cost center.
   */
  public getOverheadBreakdown(costCenterId: string, amount: string) {
    return this.overheadAllocator.calculateOverheadBreakdown(costCenterId, amount);
  }

  /**
   * Validates that all cost centers in decisions exist.
   */
  public validateCostCenters(
    decisions: readonly CanonicalDecisionRecord[]
  ): ValidationResult {
    const missingCostCenters: string[] = [];

    for (const decision of decisions) {
      if (!this.costAttributor.hasCostCenter(decision.primaryCostCenterId)) {
        missingCostCenters.push(decision.primaryCostCenterId);
      }

      for (const secondary of decision.secondaryCostCenters) {
        if (!this.costAttributor.hasCostCenter(secondary.costCenterId)) {
          missingCostCenters.push(secondary.costCenterId);
        }
      }
    }

    return {
      isValid: missingCostCenters.length === 0,
      missingCostCenters: [...new Set(missingCostCenters)],
    };
  }
}

/**
 * Internal aggregator for cost center totals
 */
interface CostCenterAggregator {
  costCenterId: string;
  totalSavings: Decimal;
  totalCosts: Decimal;
  decisionCount: number;
}

/**
 * Internal aggregator for GL account totals
 */
interface GLAccountAggregator {
  glAccountId: string;
  totalDebits: Decimal;
  totalCredits: Decimal;
}

/**
 * Validation result for cost center checks
 */
export interface ValidationResult {
  readonly isValid: boolean;
  readonly missingCostCenters: readonly string[];
}
