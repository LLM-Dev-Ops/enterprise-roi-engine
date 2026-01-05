/**
 * ROI Calculator
 * Computes Return on Investment using attributed costs and benefits.
 *
 * All calculations use decimal.js for precision - no floating point for currency.
 * Pure functions ensure deterministic output: same inputs = same outputs.
 */

import {
  GrossDelta,
  AttributionChain,
  UUID,
} from '../contracts';
import {
  Decimal,
  toDecimal,
  add,
  subtract,
  divide,
  multiply,
  isZero,
  isPositive,
  toCurrency,
  zero,
} from '../lib/financial';

/**
 * ROI methodology types supported by the calculator.
 */
export enum ROIMethodology {
  /** Simple ROI: (Benefit - Cost) / Cost */
  SIMPLE = 'SIMPLE',
  /** Annualized ROI: ((1 + Simple ROI) ^ (1/years)) - 1 */
  ANNUALIZED = 'ANNUALIZED',
}

/**
 * Configuration for ROI calculation.
 */
export interface ROICalculationConfig {
  readonly methodology: ROIMethodology;
  readonly horizonMonths?: number; // Required for annualized ROI
}

/**
 * Result of an ROI calculation.
 */
export interface ROIResult {
  readonly methodology: ROIMethodology;
  readonly roi: number; // Percentage as decimal (0.15 = 15%)
  readonly roiPercentage: string; // Human-readable percentage string
  readonly grossDelta: GrossDelta;
  readonly isPositiveReturn: boolean;
}

/**
 * Input for calculating gross delta from attribution chain.
 */
export interface DeltaInput {
  readonly totalSavings: string; // Decimal string
  readonly totalCosts: string; // Decimal string
  readonly decisionRecordId: UUID;
}

/**
 * Calculate the gross delta (net savings minus costs).
 *
 * @param input - The savings and costs values
 * @returns GrossDelta with net delta and savings-to-cost ratio
 */
export function calculateGrossDelta(input: DeltaInput): GrossDelta {
  const savings = toDecimal(input.totalSavings);
  const costs = toDecimal(input.totalCosts);
  const netDelta = subtract(savings, costs);

  // Calculate savings-to-cost ratio (null if costs are zero)
  let savingsToCostRatio: number | null = null;
  if (!isZero(costs)) {
    const ratio = divide(savings, costs);
    savingsToCostRatio = ratio.toNumber();
  }

  return {
    decisionRecordId: input.decisionRecordId,
    totalSavings: toCurrency(savings),
    totalCosts: toCurrency(costs),
    netDelta: toCurrency(netDelta),
    savingsToCostRatio,
  };
}

/**
 * Calculate simple ROI: (Total Benefit - Total Cost) / Total Cost
 *
 * @param grossDelta - The gross delta containing savings and costs
 * @returns ROI as a decimal (0.25 = 25% return)
 */
export function calculateSimpleROI(grossDelta: GrossDelta): Decimal {
  const costs = toDecimal(grossDelta.totalCosts);

  if (isZero(costs)) {
    // If costs are zero, ROI is undefined (but we return 0 for safety)
    return zero();
  }

  const netDelta = toDecimal(grossDelta.netDelta);
  return divide(netDelta, costs);
}

/**
 * Calculate annualized ROI using the formula:
 * ((1 + Simple ROI) ^ (12 / horizonMonths)) - 1
 *
 * This converts a cumulative ROI over a given period to an annual rate.
 *
 * @param simpleROI - The simple ROI as a decimal
 * @param horizonMonths - The time horizon in months
 * @returns Annualized ROI as a decimal
 */
export function calculateAnnualizedROI(simpleROI: Decimal, horizonMonths: number): Decimal {
  if (horizonMonths <= 0) {
    throw new Error('Horizon months must be positive');
  }

  // Annual periods = 12 / horizonMonths
  const annualPeriods = 12 / horizonMonths;

  // (1 + simpleROI) ^ annualPeriods - 1
  const onePlusROI = add(simpleROI, '1');

  // For negative values (loss), we need special handling
  if (onePlusROI.isNegative()) {
    // Can't take fractional power of negative number
    // Return the simple ROI annualized linearly
    return multiply(simpleROI, toDecimal(annualPeriods));
  }

  const compounded = onePlusROI.pow(annualPeriods);
  return subtract(compounded, '1');
}

/**
 * Calculate ROI using the specified methodology.
 *
 * @param grossDelta - The gross delta from cost/benefit analysis
 * @param config - Configuration specifying methodology and parameters
 * @returns Complete ROI result including the methodology used
 */
export function calculateROI(grossDelta: GrossDelta, config: ROICalculationConfig): ROIResult {
  const simpleROI = calculateSimpleROI(grossDelta);

  let finalROI: Decimal;

  switch (config.methodology) {
    case ROIMethodology.ANNUALIZED:
      if (!config.horizonMonths || config.horizonMonths <= 0) {
        throw new Error('Horizon months required for annualized ROI calculation');
      }
      finalROI = calculateAnnualizedROI(simpleROI, config.horizonMonths);
      break;

    case ROIMethodology.SIMPLE:
    default:
      finalROI = simpleROI;
      break;
  }

  const roiNumber = finalROI.toNumber();
  const roiPercentage = multiply(finalROI, '100').toFixed(2) + '%';

  return {
    methodology: config.methodology,
    roi: roiNumber,
    roiPercentage,
    grossDelta,
    isPositiveReturn: isPositive(finalROI),
  };
}

/**
 * Calculate gross delta from an attribution chain.
 * Extracts savings and costs from the chain's primary attribution.
 *
 * @param chain - The attribution chain
 * @returns Gross delta calculated from the chain
 */
export function calculateGrossDeltaFromChain(chain: AttributionChain): GrossDelta {
  // The totalAttributedAmount represents the net impact
  // We need to derive savings and costs from the attributions
  const totalAmount = toDecimal(chain.totalAttributedAmount);

  // If positive, it's a savings; if negative, it's a cost
  const isNetSavings = isPositive(totalAmount) || isZero(totalAmount);

  const savings = isNetSavings ? totalAmount : zero();
  const costs = isNetSavings ? zero() : totalAmount.abs();

  return calculateGrossDelta({
    totalSavings: toCurrency(savings),
    totalCosts: toCurrency(costs),
    decisionRecordId: chain.decisionRecordId,
  });
}

/**
 * Aggregate multiple gross deltas into a portfolio-level delta.
 *
 * @param deltas - Array of gross deltas to aggregate
 * @param portfolioId - Identifier for the aggregated portfolio
 * @returns Combined gross delta for the portfolio
 */
export function aggregateGrossDeltas(deltas: readonly GrossDelta[], portfolioId: UUID): GrossDelta {
  let totalSavings = zero();
  let totalCosts = zero();

  for (const delta of deltas) {
    totalSavings = add(totalSavings, delta.totalSavings);
    totalCosts = add(totalCosts, delta.totalCosts);
  }

  return calculateGrossDelta({
    totalSavings: toCurrency(totalSavings),
    totalCosts: toCurrency(totalCosts),
    decisionRecordId: portfolioId,
  });
}

/**
 * ROICalculator class providing a stateful interface for ROI calculations.
 * Maintains configuration and provides method chaining.
 */
export class ROICalculator {
  private readonly config: ROICalculationConfig;

  constructor(config: ROICalculationConfig = { methodology: ROIMethodology.SIMPLE }) {
    this.config = config;
  }

  /**
   * Calculate gross delta from savings and costs.
   */
  grossDelta(input: DeltaInput): GrossDelta {
    return calculateGrossDelta(input);
  }

  /**
   * Calculate ROI from a gross delta.
   */
  roi(grossDelta: GrossDelta): ROIResult {
    return calculateROI(grossDelta, this.config);
  }

  /**
   * Calculate ROI directly from savings and costs.
   */
  calculateFromValues(input: DeltaInput): ROIResult {
    const delta = this.grossDelta(input);
    return this.roi(delta);
  }

  /**
   * Aggregate multiple deltas and calculate portfolio ROI.
   */
  portfolioROI(deltas: readonly GrossDelta[], portfolioId: UUID): ROIResult {
    const aggregated = aggregateGrossDeltas(deltas, portfolioId);
    return this.roi(aggregated);
  }

  /**
   * Create a new calculator with different configuration.
   */
  withConfig(config: Partial<ROICalculationConfig>): ROICalculator {
    return new ROICalculator({
      ...this.config,
      ...config,
    });
  }
}
