/**
 * RiskAttributor
 * Assigns risk weights based on confidence intervals and decision categories.
 * Calculates composite risk factors using base weight, confidence decay,
 * and volatility adjustments.
 */

import {
  CanonicalDecisionRecord,
  RiskComponents,
} from '../contracts';
import { RiskWeightMatrix, DEFAULT_RISK_MATRIX } from '../contracts/costops';
import {
  toDecimal,
  Decimal,
} from '../lib/financial';

/**
 * Risk attribution result
 */
export interface RiskAttribution {
  readonly decisionRecordId: string;
  readonly riskCategoryId: string;
  readonly compositeRiskFactor: number;
  readonly riskComponents: RiskComponents;
  readonly isCapped: boolean;
  readonly matrixUsed: string;
}

/**
 * RiskAttributor class for calculating risk-adjusted factors
 */
export class RiskAttributor {
  private readonly riskMatrixMap: Map<string, RiskWeightMatrix>;
  private readonly defaultMatrix: RiskWeightMatrix;

  constructor(
    riskMatrices: readonly RiskWeightMatrix[],
    defaultMatrix: RiskWeightMatrix = DEFAULT_RISK_MATRIX
  ) {
    // Build risk matrix lookup by category ID
    this.riskMatrixMap = new Map(
      riskMatrices.map(rm => [rm.categoryId, rm])
    );

    this.defaultMatrix = defaultMatrix;
  }

  /**
   * Calculates the composite risk factor for a decision.
   *
   * Formula:
   * - Base Weight: From risk matrix
   * - Confidence Decay: (1 - confidence) * decay rate
   * - Volatility Adjustment: volatility * volatility multiplier
   * - Composite = Base Weight + Confidence Decay + Volatility Adjustment
   * - Final = min(Composite, Max Weight)
   */
  public calculateRiskFactor(decision: CanonicalDecisionRecord): RiskAttribution {
    const {
      recordId,
      riskCategoryId,
      confidenceScore,
      volatilityScore,
    } = decision;

    // Look up risk matrix, fall back to default
    const matrix = this.getRiskMatrix(riskCategoryId);

    // Calculate risk components
    const riskComponents = this.computeRiskComponents(
      matrix,
      confidenceScore,
      volatilityScore
    );

    // Calculate composite risk factor
    const rawComposite = this.computeCompositeRisk(riskComponents);

    // Cap at max weight
    const { cappedFactor, isCapped } = this.capAtMaxWeight(rawComposite, matrix.maxWeight);

    return {
      decisionRecordId: recordId,
      riskCategoryId,
      compositeRiskFactor: cappedFactor,
      riskComponents,
      isCapped,
      matrixUsed: matrix.categoryId,
    };
  }

  /**
   * Computes the individual risk components.
   */
  private computeRiskComponents(
    matrix: RiskWeightMatrix,
    confidenceScore: number,
    volatilityScore: number
  ): RiskComponents {
    // Base weight from the matrix
    const baseWeight = matrix.baseWeight;

    // Confidence decay: lower confidence = higher risk
    // Formula: (1 - confidence) * decay rate
    const confidenceFactor = (1 - confidenceScore) * matrix.confidenceDecayRate;

    // Volatility adjustment: higher volatility = higher risk
    // Formula: volatility * volatility multiplier
    const volatilityAdjustment = volatilityScore * matrix.volatilityMultiplier;

    return {
      baseWeight,
      confidenceFactor,
      volatilityAdjustment,
    };
  }

  /**
   * Computes the composite risk factor from components.
   */
  private computeCompositeRisk(components: RiskComponents): number {
    const { baseWeight, confidenceFactor, volatilityAdjustment } = components;
    return baseWeight + confidenceFactor + volatilityAdjustment;
  }

  /**
   * Caps the risk factor at the maximum allowed weight.
   */
  private capAtMaxWeight(
    rawFactor: number,
    maxWeight: number
  ): { cappedFactor: number; isCapped: boolean } {
    if (rawFactor > maxWeight) {
      return { cappedFactor: maxWeight, isCapped: true };
    }
    return { cappedFactor: rawFactor, isCapped: false };
  }

  /**
   * Gets the risk matrix for a category, falling back to default.
   */
  public getRiskMatrix(categoryId: string): RiskWeightMatrix {
    return this.riskMatrixMap.get(categoryId) ?? this.defaultMatrix;
  }

  /**
   * Checks if a category has an explicit risk matrix defined.
   */
  public hasRiskMatrix(categoryId: string): boolean {
    return this.riskMatrixMap.has(categoryId);
  }

  /**
   * Applies a risk factor to an amount for risk-adjusted valuation.
   */
  public applyRiskFactor(amount: string, riskFactor: number): string {
    // Risk factor > 1 means higher risk, so we divide by it to get risk-adjusted value
    // A risk factor of 2.0 means the value is halved due to risk
    const adjustedAmount = toDecimal(amount).dividedBy(riskFactor);
    return adjustedAmount.toFixed(4);
  }

  /**
   * Calculates the risk-adjusted amount using inverse of risk factor.
   * Higher risk = lower adjusted value.
   */
  public getRiskAdjustedAmount(amount: string, riskFactor: number): Decimal {
    const decimalAmount = toDecimal(amount);
    return decimalAmount.dividedBy(riskFactor);
  }

  /**
   * Batch calculates risk factors for multiple decisions.
   */
  public batchCalculateRiskFactors(
    decisions: readonly CanonicalDecisionRecord[]
  ): Map<string, RiskAttribution> {
    const results = new Map<string, RiskAttribution>();

    for (const decision of decisions) {
      const attribution = this.calculateRiskFactor(decision);
      results.set(decision.recordId, attribution);
    }

    return results;
  }

  /**
   * Gets summary statistics for risk attributions.
   */
  public getRiskStatistics(
    attributions: readonly RiskAttribution[]
  ): RiskStatistics {
    if (attributions.length === 0) {
      return {
        count: 0,
        averageRiskFactor: 0,
        minRiskFactor: 0,
        maxRiskFactor: 0,
        cappedCount: 0,
        categoryDistribution: new Map(),
      };
    }

    const factors = attributions.map(a => a.compositeRiskFactor);
    const cappedCount = attributions.filter(a => a.isCapped).length;

    // Calculate category distribution
    const categoryDistribution = new Map<string, number>();
    for (const attribution of attributions) {
      const current = categoryDistribution.get(attribution.riskCategoryId) ?? 0;
      categoryDistribution.set(attribution.riskCategoryId, current + 1);
    }

    return {
      count: attributions.length,
      averageRiskFactor: factors.reduce((a, b) => a + b, 0) / factors.length,
      minRiskFactor: Math.min(...factors),
      maxRiskFactor: Math.max(...factors),
      cappedCount,
      categoryDistribution,
    };
  }
}

/**
 * Summary statistics for risk attributions
 */
export interface RiskStatistics {
  readonly count: number;
  readonly averageRiskFactor: number;
  readonly minRiskFactor: number;
  readonly maxRiskFactor: number;
  readonly cappedCount: number;
  readonly categoryDistribution: Map<string, number>;
}
