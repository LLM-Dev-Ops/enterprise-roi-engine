/**
 * Calculation Orchestrator
 * Coordinates all financial calculations for the enterprise ROI engine.
 *
 * Takes AttributionResult and CostBaseline as inputs, then:
 * - Calculates financial deltas for each decision
 * - Computes portfolio-level metrics
 * - Returns FinancialDeltaResult
 *
 * All calculations use decimal.js for precision.
 * Deterministic: same inputs = same outputs.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  AttributionResult,
  AttributionChain,
  CostBaseline,
  RiskWeightMatrix,
  DEFAULT_RISK_MATRIX,
  FinancialDelta,
  FinancialDeltaResult,
  PortfolioMetrics,
  ISO8601,
} from '../contracts';
import {
  Decimal,
  toDecimal,
  add,
  divide,
  isPositive,
  toCurrency,
  zero,
} from '../lib/financial';
import {
  ROICalculator,
  ROIMethodology,
  calculateGrossDelta,
} from './ROICalculator';
import {
  calculateTimeAdjustedDelta,
} from './NPVEngine';
import {
  ConfidenceCalculator,
  generateConfidenceIntervals,
  calculateRiskAdjustedDelta,
  RiskWeightConfig,
} from './ConfidenceCalculator';

/**
 * Configuration for the calculation orchestrator.
 */
export interface CalculationOrchestratorConfig {
  /** Override the discount rate from cost baseline */
  readonly discountRateOverride?: number;
  /** Default time horizon in months if not specified per decision */
  readonly defaultHorizonMonths?: number;
  /** Whether to include sensitivity analysis */
  readonly includeSensitivity?: boolean;
  /** Confidence levels to calculate */
  readonly confidenceLevels?: readonly number[];
}

/**
 * Input for a single decision calculation.
 */
interface DecisionCalculationInput {
  readonly chain: AttributionChain;
  readonly riskMatrix: RiskWeightMatrix;
  readonly discountRate: number;
  readonly horizonMonths: number;
  readonly confidenceScore: number;
  readonly volatilityScore: number;
  readonly riskCategory: string;
}

/**
 * Convert a RiskWeightMatrix to RiskWeightConfig.
 */
function toRiskWeightConfig(matrix: RiskWeightMatrix): RiskWeightConfig {
  return {
    baseWeight: matrix.baseWeight,
    volatilityMultiplier: matrix.volatilityMultiplier,
    confidenceDecayRate: matrix.confidenceDecayRate,
    maxWeight: matrix.maxWeight,
  };
}

/**
 * Find the appropriate risk matrix for a category.
 */
function findRiskMatrix(
  riskWeights: readonly RiskWeightMatrix[],
  categoryId: string
): RiskWeightMatrix {
  const found = riskWeights.find((rw) => rw.categoryId === categoryId);
  return found ?? DEFAULT_RISK_MATRIX;
}

/**
 * Extract savings and costs from an attribution chain.
 *
 * Positive amounts are savings, negative amounts are costs.
 */
function extractSavingsAndCosts(chain: AttributionChain): { savings: Decimal; costs: Decimal } {
  // Parse from the primary attribution
  let savings = zero();
  let costs = zero();

  // Check the primary attribution for direction
  const primaryAmount = toDecimal(chain.primaryAttribution.attributedAmount);

  if (isPositive(primaryAmount)) {
    savings = primaryAmount;
  } else {
    costs = primaryAmount.abs();
  }

  // Also consider overhead as a cost
  const overhead = toDecimal(chain.overheadAttribution.totalOverhead);
  if (isPositive(overhead)) {
    costs = add(costs, overhead);
  }

  return { savings, costs };
}

/**
 * Calculate all financial metrics for a single decision.
 */
function calculateDecisionFinancials(
  input: DecisionCalculationInput,
  timestamp: ISO8601
): FinancialDelta {
  const { chain, riskMatrix, discountRate, horizonMonths, confidenceScore, volatilityScore, riskCategory } = input;

  // 1. Calculate Gross Delta
  const { savings, costs } = extractSavingsAndCosts(chain);
  const grossDelta = calculateGrossDelta({
    totalSavings: toCurrency(savings),
    totalCosts: toCurrency(costs),
    decisionRecordId: chain.decisionRecordId,
  });

  // 2. Calculate Risk-Adjusted Delta
  const riskConfig = toRiskWeightConfig(riskMatrix);
  const riskAdjustedDelta = calculateRiskAdjustedDelta(
    chain.decisionRecordId,
    grossDelta.netDelta,
    grossDelta.totalSavings,
    grossDelta.totalCosts,
    confidenceScore,
    volatilityScore,
    riskCategory,
    riskConfig
  );

  // 3. Calculate Time-Adjusted Delta (NPV)
  const timeAdjustedDelta = calculateTimeAdjustedDelta(
    chain.decisionRecordId,
    riskAdjustedDelta.adjustedNetDelta,
    horizonMonths,
    discountRate
  );

  // 4. Calculate Confidence Intervals
  const confidenceIntervals = generateConfidenceIntervals(
    timeAdjustedDelta.presentValue,
    {
      confidenceScore,
      volatilityScore,
    }
  );

  // 5. Determine delta type
  const netDelta = toDecimal(grossDelta.netDelta);
  let deltaType: 'SAVINGS' | 'COST' | 'NEUTRAL';
  if (isPositive(netDelta)) {
    deltaType = 'SAVINGS';
  } else if (netDelta.isNegative()) {
    deltaType = 'COST';
  } else {
    deltaType = 'NEUTRAL';
  }

  return {
    decisionRecordId: chain.decisionRecordId,
    grossDelta,
    riskAdjustedDelta,
    timeAdjustedDelta,
    confidenceIntervals,
    deltaType,
    calculationTimestamp: timestamp,
  };
}

/**
 * Calculate portfolio-level aggregated metrics.
 */
function calculatePortfolioMetrics(
  deltas: readonly FinancialDelta[],
  timestamp: ISO8601
): PortfolioMetrics {
  if (deltas.length === 0) {
    return {
      totalGrossSavings: toCurrency(zero()),
      totalRiskAdjustedSavings: toCurrency(zero()),
      totalPresentValue: toCurrency(zero()),
      averageRiskAdjustmentFactor: 1,
      averageDiscountFactor: 1,
      weightedUncertaintyFactor: 0,
      decisionCount: 0,
      positiveNPVCount: 0,
      calculationTimestamp: timestamp,
    };
  }

  let totalGrossSavings = zero();
  let totalRiskAdjustedSavings = zero();
  let totalPresentValue = zero();
  let sumRiskFactors = zero();
  let sumDiscountFactors = zero();
  let sumUncertaintyFactors = zero();
  let positiveNPVCount = 0;

  for (const delta of deltas) {
    totalGrossSavings = add(totalGrossSavings, delta.grossDelta.totalSavings);
    totalRiskAdjustedSavings = add(
      totalRiskAdjustedSavings,
      delta.riskAdjustedDelta.adjustedSavings
    );
    totalPresentValue = add(totalPresentValue, delta.timeAdjustedDelta.presentValue);
    sumRiskFactors = add(sumRiskFactors, toDecimal(delta.riskAdjustedDelta.riskFactor));
    sumDiscountFactors = add(
      sumDiscountFactors,
      toDecimal(delta.timeAdjustedDelta.discountFactor)
    );
    sumUncertaintyFactors = add(
      sumUncertaintyFactors,
      toDecimal(delta.confidenceIntervals.uncertaintyFactor)
    );

    if (isPositive(toDecimal(delta.timeAdjustedDelta.presentValue))) {
      positiveNPVCount++;
    }
  }

  const count = toDecimal(deltas.length);

  return {
    totalGrossSavings: toCurrency(totalGrossSavings),
    totalRiskAdjustedSavings: toCurrency(totalRiskAdjustedSavings),
    totalPresentValue: toCurrency(totalPresentValue),
    averageRiskAdjustmentFactor: divide(sumRiskFactors, count).toNumber(),
    averageDiscountFactor: divide(sumDiscountFactors, count).toNumber(),
    weightedUncertaintyFactor: divide(sumUncertaintyFactors, count).toNumber(),
    decisionCount: deltas.length,
    positiveNPVCount,
    calculationTimestamp: timestamp,
  };
}

/**
 * Calculate financial deltas for all decisions in an attribution result.
 *
 * @param attributionResult - The attribution result from the attribution layer
 * @param costBaseline - The cost baseline with risk weights and discount rate
 * @param config - Optional configuration overrides
 * @returns Complete financial delta result with portfolio metrics
 */
export function calculateFinancialDeltas(
  attributionResult: AttributionResult,
  costBaseline: CostBaseline,
  config: CalculationOrchestratorConfig = {}
): FinancialDeltaResult {
  const timestamp = new Date().toISOString();
  const calculationId = uuidv4();

  const discountRate = config.discountRateOverride ?? costBaseline.discountRate;
  const defaultHorizon = config.defaultHorizonMonths ?? 12;

  const deltas: FinancialDelta[] = [];

  for (const chain of attributionResult.attributionChains) {
    // Find risk matrix for this decision's category
    // We'll use the primary attribution's cost center to derive risk category
    // In a real implementation, the decision would have an explicit risk category
    const riskMatrix = findRiskMatrix(
      costBaseline.riskWeights,
      chain.primaryAttribution.costCenterId
    );

    // Extract confidence and volatility from the attribution chain
    // In practice, these would come from the original decision record
    // For now, we use defaults that can be overridden
    const confidenceScore = 0.8; // Default high confidence
    const volatilityScore = 0.3; // Default moderate volatility

    // Calculate horizon months from attribution
    // If not specified, use the default
    const horizonMonths = defaultHorizon;

    const input: DecisionCalculationInput = {
      chain,
      riskMatrix,
      discountRate,
      horizonMonths,
      confidenceScore,
      volatilityScore,
      riskCategory: riskMatrix.categoryId,
    };

    const financialDelta = calculateDecisionFinancials(input, timestamp);
    deltas.push(financialDelta);
  }

  const portfolioMetrics = calculatePortfolioMetrics(deltas, timestamp);

  return {
    calculationId,
    deltas,
    portfolioMetrics,
    timestamp,
  };
}

/**
 * CalculationOrchestrator class providing a stateful interface for orchestrating calculations.
 */
export class CalculationOrchestrator {
  private readonly config: CalculationOrchestratorConfig;
  public readonly roiCalculator: ROICalculator;
  public readonly confidenceCalculator: ConfidenceCalculator;

  constructor(config: CalculationOrchestratorConfig = {}) {
    this.config = {
      defaultHorizonMonths: 12,
      includeSensitivity: true,
      confidenceLevels: [50, 75, 90, 95, 99],
      ...config,
    };

    this.roiCalculator = new ROICalculator({
      methodology: ROIMethodology.SIMPLE,
    });

    this.confidenceCalculator = new ConfidenceCalculator(
      this.config.confidenceLevels
        ? { confidenceLevels: this.config.confidenceLevels }
        : undefined
    );
  }

  /**
   * Calculate financial deltas for an attribution result.
   */
  calculate(
    attributionResult: AttributionResult,
    costBaseline: CostBaseline
  ): FinancialDeltaResult {
    return calculateFinancialDeltas(attributionResult, costBaseline, this.config);
  }

  /**
   * Calculate financials for a single decision.
   */
  calculateSingle(
    chain: AttributionChain,
    costBaseline: CostBaseline
  ): FinancialDelta {
    const timestamp = new Date().toISOString();
    const discountRate = this.config.discountRateOverride ?? costBaseline.discountRate;
    const horizonMonths = this.config.defaultHorizonMonths ?? 12;

    const riskMatrix = findRiskMatrix(
      costBaseline.riskWeights,
      chain.primaryAttribution.costCenterId
    );

    const input: DecisionCalculationInput = {
      chain,
      riskMatrix,
      discountRate,
      horizonMonths,
      confidenceScore: 0.8,
      volatilityScore: 0.3,
      riskCategory: riskMatrix.categoryId,
    };

    return calculateDecisionFinancials(input, timestamp);
  }

  /**
   * Get portfolio metrics from a result.
   */
  getPortfolioMetrics(result: FinancialDeltaResult): PortfolioMetrics {
    return result.portfolioMetrics;
  }

  /**
   * Create a summary of the calculation result.
   */
  summarize(result: FinancialDeltaResult): {
    totalSavings: string;
    totalNPV: string;
    decisionCount: number;
    positiveROICount: number;
    averageRiskFactor: number;
  } {
    const { portfolioMetrics, deltas } = result;

    const positiveROICount = deltas.filter(
      (d) => d.deltaType === 'SAVINGS'
    ).length;

    return {
      totalSavings: portfolioMetrics.totalGrossSavings,
      totalNPV: portfolioMetrics.totalPresentValue,
      decisionCount: portfolioMetrics.decisionCount,
      positiveROICount,
      averageRiskFactor: portfolioMetrics.averageRiskAdjustmentFactor,
    };
  }

  /**
   * Create a new orchestrator with different configuration.
   */
  withConfig(config: Partial<CalculationOrchestratorConfig>): CalculationOrchestrator {
    return new CalculationOrchestrator({
      ...this.config,
      ...config,
    });
  }

  /**
   * Create a new orchestrator with a different discount rate.
   */
  withDiscountRate(discountRate: number): CalculationOrchestrator {
    return new CalculationOrchestrator({
      ...this.config,
      discountRateOverride: discountRate,
    });
  }

  /**
   * Create a new orchestrator with a different time horizon.
   */
  withHorizon(horizonMonths: number): CalculationOrchestrator {
    return new CalculationOrchestrator({
      ...this.config,
      defaultHorizonMonths: horizonMonths,
    });
  }
}
