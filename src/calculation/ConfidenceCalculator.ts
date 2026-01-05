/**
 * Confidence Calculator
 * Generates confidence intervals for financial projections.
 *
 * Calculates uncertainty factors from confidence and volatility scores,
 * then generates intervals at standard confidence levels (50%, 75%, 90%, 95%, 99%).
 *
 * Z-scores for confidence levels:
 * - 50%: 0.674
 * - 75%: 1.150
 * - 90%: 1.645
 * - 95%: 1.960
 * - 99%: 2.576
 *
 * margin = |baseValue| * uncertaintyFactor * zScore
 *
 * All calculations use decimal.js for precision.
 * Pure functions ensure deterministic output: same inputs = same outputs.
 */

import {
  ConfidenceIntervals,
  IntervalBounds,
  RiskAdjustedDelta,
  RiskComponents,
  UUID,
} from '../contracts';
import {
  Decimal,
  toDecimal,
  add,
  subtract,
  multiply,
  divide,
  abs,
  toCurrency,
  one,
} from '../lib/financial';

/**
 * Standard Z-scores for confidence levels.
 * These are based on the standard normal distribution.
 */
export const Z_SCORES: Record<number, number> = {
  50: 0.674,
  75: 1.150,
  90: 1.645,
  95: 1.960,
  99: 2.576,
};

/**
 * Standard confidence levels used in analysis.
 */
export const STANDARD_CONFIDENCE_LEVELS = [50, 75, 90, 95, 99] as const;

/**
 * Configuration for confidence interval calculation.
 */
export interface ConfidenceConfig {
  /** Base confidence score (0.0 to 1.0) - higher means more certain */
  readonly confidenceScore: number;
  /** Volatility score (0.0 to 1.0) - higher means more volatile */
  readonly volatilityScore: number;
  /** Custom confidence levels to calculate (defaults to standard levels) */
  readonly confidenceLevels?: readonly number[];
}

/**
 * Risk weight configuration for adjusting deltas.
 */
export interface RiskWeightConfig {
  /** Base weight multiplier */
  readonly baseWeight: number;
  /** Volatility multiplier factor */
  readonly volatilityMultiplier: number;
  /** Confidence decay rate */
  readonly confidenceDecayRate: number;
  /** Maximum allowed weight */
  readonly maxWeight: number;
}

/**
 * Calculate the uncertainty factor from confidence and volatility.
 *
 * The uncertainty factor represents how much the actual value might
 * deviate from the base value. Higher confidence reduces uncertainty,
 * while higher volatility increases it.
 *
 * Formula: uncertaintyFactor = (1 - confidenceScore) * (1 + volatilityScore)
 *
 * @param confidenceScore - Confidence score (0.0 to 1.0)
 * @param volatilityScore - Volatility score (0.0 to 1.0)
 * @returns Uncertainty factor as a Decimal
 */
export function calculateUncertaintyFactor(
  confidenceScore: number,
  volatilityScore: number
): Decimal {
  // Clamp inputs to valid range
  const clampedConfidence = Math.max(0, Math.min(1, confidenceScore));
  const clampedVolatility = Math.max(0, Math.min(1, volatilityScore));

  // (1 - confidence) * (1 + volatility)
  const confidenceUncertainty = subtract(one(), toDecimal(clampedConfidence));
  const volatilityMultiplier = add(one(), toDecimal(clampedVolatility));

  return multiply(confidenceUncertainty, volatilityMultiplier);
}

/**
 * Calculate the margin for a given confidence level.
 *
 * margin = |baseValue| * uncertaintyFactor * zScore
 *
 * @param baseValue - The base value to calculate margin for
 * @param uncertaintyFactor - The uncertainty factor
 * @param zScore - The Z-score for the confidence level
 * @returns Margin as a Decimal
 */
export function calculateMargin(
  baseValue: string | Decimal,
  uncertaintyFactor: Decimal,
  zScore: number
): Decimal {
  const absBase = abs(baseValue);
  const zScoreDecimal = toDecimal(zScore);

  return multiply(multiply(absBase, uncertaintyFactor), zScoreDecimal);
}

/**
 * Calculate interval bounds for a given confidence level.
 *
 * @param baseValue - The base value
 * @param uncertaintyFactor - The uncertainty factor
 * @param confidenceLevel - The confidence level (e.g., 90 for 90%)
 * @returns IntervalBounds with lower/upper bounds and margin
 */
export function calculateIntervalBounds(
  baseValue: string,
  uncertaintyFactor: Decimal,
  confidenceLevel: number
): IntervalBounds {
  const zScore = Z_SCORES[confidenceLevel];
  if (zScore === undefined) {
    throw new Error(`Unsupported confidence level: ${confidenceLevel}`);
  }

  const base = toDecimal(baseValue);
  const margin = calculateMargin(base, uncertaintyFactor, zScore);

  const lowerBound = subtract(base, margin);
  const upperBound = add(base, margin);

  return {
    confidenceLevel,
    lowerBound: toCurrency(lowerBound),
    upperBound: toCurrency(upperBound),
    margin: toCurrency(margin),
  };
}

/**
 * Generate confidence intervals for a base value.
 *
 * @param baseValue - The base value to generate intervals for
 * @param config - Configuration with confidence and volatility scores
 * @returns Complete ConfidenceIntervals result
 */
export function generateConfidenceIntervals(
  baseValue: string,
  config: ConfidenceConfig
): ConfidenceIntervals {
  const uncertaintyFactor = calculateUncertaintyFactor(
    config.confidenceScore,
    config.volatilityScore
  );

  const levels = config.confidenceLevels ?? STANDARD_CONFIDENCE_LEVELS;
  const intervals = new Map<number, IntervalBounds>();

  for (const level of levels) {
    const bounds = calculateIntervalBounds(baseValue, uncertaintyFactor, level);
    intervals.set(level, bounds);
  }

  // Extract p10, p50, p90 values
  // p10 is the 10th percentile (lower bound of 80% CI = 90% one-sided)
  // p50 is the median (base value)
  // p90 is the 90th percentile (upper bound of 80% CI)
  const base = toDecimal(baseValue);

  // For p10/p90, we use the 80% confidence level bounds
  // 80% CI means 10% in each tail, so lower bound is p10, upper is p90
  // p10 approximation: use slightly inside the 90% lower bound
  // p90 approximation: use slightly inside the 90% upper bound
  const p10Margin = calculateMargin(base, uncertaintyFactor, 1.282); // z for 80% one-sided
  const p90Margin = calculateMargin(base, uncertaintyFactor, 1.282);

  const p10Value = subtract(base, p10Margin);
  const p90Value = add(base, p90Margin);

  return {
    baseValue: toCurrency(base),
    intervals,
    p10Value: toCurrency(p10Value),
    p50Value: toCurrency(base), // Median is the base value
    p90Value: toCurrency(p90Value),
    uncertaintyFactor: uncertaintyFactor.toNumber(),
  };
}

/**
 * Calculate risk components for a decision.
 *
 * @param confidenceScore - Confidence score (0.0 to 1.0)
 * @param volatilityScore - Volatility score (0.0 to 1.0)
 * @param riskConfig - Risk weight configuration
 * @returns RiskComponents with individual factors
 */
export function calculateRiskComponents(
  confidenceScore: number,
  volatilityScore: number,
  riskConfig: RiskWeightConfig
): RiskComponents {
  // Confidence factor: higher confidence = lower adjustment
  const confidenceFactor = 1 - (1 - confidenceScore) * riskConfig.confidenceDecayRate;

  // Volatility adjustment: higher volatility = higher adjustment
  const volatilityAdjustment = volatilityScore * riskConfig.volatilityMultiplier;

  return {
    baseWeight: riskConfig.baseWeight,
    confidenceFactor: Math.max(0, Math.min(1, confidenceFactor)),
    volatilityAdjustment: Math.max(0, volatilityAdjustment),
  };
}

/**
 * Calculate the overall risk factor from components.
 *
 * riskFactor = baseWeight * confidenceFactor * (1 + volatilityAdjustment)
 * Clamped to maxWeight.
 *
 * @param components - Risk components
 * @param maxWeight - Maximum allowed risk factor
 * @returns Overall risk factor
 */
export function calculateRiskFactor(
  components: RiskComponents,
  maxWeight: number
): number {
  const rawFactor =
    components.baseWeight *
    components.confidenceFactor *
    (1 + components.volatilityAdjustment);

  return Math.min(rawFactor, maxWeight);
}

/**
 * Apply risk adjustment to a gross delta.
 *
 * @param decisionRecordId - Decision record ID
 * @param grossNetDelta - Gross net delta (savings - costs)
 * @param totalSavings - Total gross savings
 * @param totalCosts - Total gross costs
 * @param confidenceScore - Confidence score
 * @param volatilityScore - Volatility score
 * @param riskCategory - Risk category identifier
 * @param riskConfig - Risk weight configuration
 * @returns Risk-adjusted delta
 */
export function calculateRiskAdjustedDelta(
  decisionRecordId: UUID,
  grossNetDelta: string,
  totalSavings: string,
  totalCosts: string,
  confidenceScore: number,
  volatilityScore: number,
  riskCategory: string,
  riskConfig: RiskWeightConfig
): RiskAdjustedDelta {
  const components = calculateRiskComponents(
    confidenceScore,
    volatilityScore,
    riskConfig
  );

  const riskFactor = calculateRiskFactor(components, riskConfig.maxWeight);
  const riskFactorDecimal = toDecimal(riskFactor);

  // Apply risk factor to savings (reduce savings) and costs (increase costs)
  const savings = toDecimal(totalSavings);
  const costs = toDecimal(totalCosts);

  // Risk-adjusted savings = savings * (1 - (1 - riskFactor))
  // For savings, lower risk factor means less adjustment (more conservative)
  // Actually: adjusted = original * riskFactor when riskFactor < 1 reduces
  // We want: higher uncertainty = lower adjusted savings
  // So: adjustedSavings = savings * (2 - riskFactor) / riskFactor ... no
  // Simple approach: adjustedSavings = savings * (1 / riskFactor) when risk > 1
  // OR: adjustedSavings = savings / riskFactor (conservative)

  // Standard approach: For benefits, divide by risk factor (reduces them)
  // For costs, multiply by risk factor (increases them)
  const adjustedSavings = divide(savings, riskFactorDecimal);
  const adjustedCosts = multiply(costs, riskFactorDecimal);
  const adjustedNetDelta = subtract(adjustedSavings, adjustedCosts);

  return {
    decisionRecordId,
    grossNetDelta,
    adjustedSavings: toCurrency(adjustedSavings),
    adjustedCosts: toCurrency(adjustedCosts),
    adjustedNetDelta: toCurrency(adjustedNetDelta),
    riskFactor,
    riskComponents: components,
    riskCategory,
  };
}

/**
 * ConfidenceCalculator class providing a stateful interface for confidence calculations.
 */
export class ConfidenceCalculator {
  private readonly defaultConfig: ConfidenceConfig;
  private readonly riskConfig: RiskWeightConfig;

  constructor(
    defaultConfig?: Partial<ConfidenceConfig>,
    riskConfig?: Partial<RiskWeightConfig>
  ) {
    this.defaultConfig = {
      confidenceScore: 0.8,
      volatilityScore: 0.3,
      confidenceLevels: [...STANDARD_CONFIDENCE_LEVELS],
      ...defaultConfig,
    };

    this.riskConfig = {
      baseWeight: 1.0,
      volatilityMultiplier: 0.5,
      confidenceDecayRate: 0.3,
      maxWeight: 2.5,
      ...riskConfig,
    };
  }

  /**
   * Get the configured confidence levels.
   */
  get confidenceLevels(): readonly number[] {
    return this.defaultConfig.confidenceLevels ?? STANDARD_CONFIDENCE_LEVELS;
  }

  /**
   * Calculate uncertainty factor from current configuration.
   */
  uncertaintyFactor(config?: Partial<ConfidenceConfig>): number {
    const mergedConfig = { ...this.defaultConfig, ...config };
    return calculateUncertaintyFactor(
      mergedConfig.confidenceScore,
      mergedConfig.volatilityScore
    ).toNumber();
  }

  /**
   * Generate confidence intervals for a value.
   */
  intervals(baseValue: string, config?: Partial<ConfidenceConfig>): ConfidenceIntervals {
    const mergedConfig = { ...this.defaultConfig, ...config };
    return generateConfidenceIntervals(baseValue, mergedConfig);
  }

  /**
   * Calculate interval bounds for a specific confidence level.
   */
  bounds(
    baseValue: string,
    confidenceLevel: number,
    config?: Partial<ConfidenceConfig>
  ): IntervalBounds {
    const mergedConfig = { ...this.defaultConfig, ...config };
    const uncertainty = calculateUncertaintyFactor(
      mergedConfig.confidenceScore,
      mergedConfig.volatilityScore
    );
    return calculateIntervalBounds(baseValue, uncertainty, confidenceLevel);
  }

  /**
   * Calculate risk components.
   */
  riskComponents(config?: Partial<ConfidenceConfig>): RiskComponents {
    const mergedConfig = { ...this.defaultConfig, ...config };
    return calculateRiskComponents(
      mergedConfig.confidenceScore,
      mergedConfig.volatilityScore,
      this.riskConfig
    );
  }

  /**
   * Calculate risk-adjusted delta.
   */
  adjustDelta(
    decisionRecordId: UUID,
    grossNetDelta: string,
    totalSavings: string,
    totalCosts: string,
    riskCategory: string,
    config?: Partial<ConfidenceConfig>
  ): RiskAdjustedDelta {
    const mergedConfig = { ...this.defaultConfig, ...config };
    return calculateRiskAdjustedDelta(
      decisionRecordId,
      grossNetDelta,
      totalSavings,
      totalCosts,
      mergedConfig.confidenceScore,
      mergedConfig.volatilityScore,
      riskCategory,
      this.riskConfig
    );
  }

  /**
   * Create a new calculator with different configuration.
   */
  withConfig(config: Partial<ConfidenceConfig>): ConfidenceCalculator {
    return new ConfidenceCalculator(
      { ...this.defaultConfig, ...config },
      this.riskConfig
    );
  }

  /**
   * Create a new calculator with different risk configuration.
   */
  withRiskConfig(riskConfig: Partial<RiskWeightConfig>): ConfidenceCalculator {
    return new ConfidenceCalculator(this.defaultConfig, {
      ...this.riskConfig,
      ...riskConfig,
    });
  }
}
