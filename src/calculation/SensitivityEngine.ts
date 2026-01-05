/**
 * Sensitivity Engine
 * Produces sensitivity tables for financial analysis.
 *
 * Varies key parameters (discount rate, cost factors, etc.) and
 * calculates NPV impact for each variation. Computes elasticity
 * and returns tornado-ordered results.
 *
 * All calculations use decimal.js for precision.
 * Pure functions ensure deterministic output: same inputs = same outputs.
 */

import {
  SensitivityFactor,
  SensitivityTable,
  MonetaryValue,
} from '../contracts';
import {
  Decimal,
  toDecimal,
  subtract,
  divide,
  multiply,
  abs,
  isZero,
  toCurrency,
} from '../lib/financial';
import { CashFlow, calculateNPV, NPVConfig } from './NPVEngine';

/**
 * Configuration for a sensitivity factor.
 */
export interface SensitivityFactorConfig {
  /** Name of the factor being varied */
  readonly factorName: string;
  /** Base (current) value of the factor */
  readonly baseValue: number;
  /** Low scenario value */
  readonly lowValue: number;
  /** High scenario value */
  readonly highValue: number;
  /** Type of factor for calculation purposes */
  readonly factorType: SensitivityFactorType;
}

/**
 * Types of factors that can be varied in sensitivity analysis.
 */
export enum SensitivityFactorType {
  /** Discount rate - affects NPV calculation directly */
  DISCOUNT_RATE = 'DISCOUNT_RATE',
  /** Cost multiplier - scales all costs */
  COST_MULTIPLIER = 'COST_MULTIPLIER',
  /** Revenue/savings multiplier - scales all benefits */
  BENEFIT_MULTIPLIER = 'BENEFIT_MULTIPLIER',
  /** Time horizon - changes the projection period */
  TIME_HORIZON = 'TIME_HORIZON',
  /** Custom factor with user-provided calculation */
  CUSTOM = 'CUSTOM',
}

/**
 * Configuration for the entire sensitivity analysis.
 */
export interface SensitivityAnalysisConfig {
  /** Base NPV configuration */
  readonly baseNPVConfig: NPVConfig;
  /** Base cash flows for the analysis */
  readonly baseCashFlows: readonly CashFlow[];
  /** Currency code for monetary values */
  readonly currency: string;
  /** As-of date for monetary values */
  readonly asOfDate: string;
}

/**
 * Calculate the elasticity of NPV with respect to a factor.
 *
 * Elasticity = (% change in NPV) / (% change in factor)
 *
 * @param baseNPV - Base NPV value
 * @param newNPV - NPV after factor change
 * @param baseFactorValue - Original factor value
 * @param newFactorValue - Changed factor value
 * @returns Elasticity as a number
 */
export function calculateElasticity(
  baseNPV: Decimal,
  newNPV: Decimal,
  baseFactorValue: number,
  newFactorValue: number
): number {
  if (baseFactorValue === 0 || isZero(baseNPV)) {
    return 0;
  }

  const npvChange = divide(subtract(newNPV, baseNPV), baseNPV);
  const factorChange = (newFactorValue - baseFactorValue) / baseFactorValue;

  if (factorChange === 0) {
    return 0;
  }

  return npvChange.dividedBy(factorChange).toNumber();
}

/**
 * Apply a discount rate variation to cash flows and calculate NPV.
 *
 * @param cashFlows - Base cash flows
 * @param discountRate - New discount rate to apply
 * @returns NPV with the new discount rate
 */
export function calculateNPVWithDiscountRate(
  cashFlows: readonly CashFlow[],
  discountRate: number
): Decimal {
  const result = calculateNPV(cashFlows, { annualDiscountRate: discountRate });
  return toDecimal(result.npv);
}

/**
 * Apply a multiplier to all cash flows.
 *
 * @param cashFlows - Base cash flows
 * @param multiplier - Multiplier to apply
 * @returns Scaled cash flows
 */
export function applyCashFlowMultiplier(
  cashFlows: readonly CashFlow[],
  multiplier: number
): CashFlow[] {
  const multiplierDecimal = toDecimal(multiplier);

  return cashFlows.map((cf) => ({
    period: cf.period,
    amount: toCurrency(multiply(cf.amount, multiplierDecimal)),
  }));
}

/**
 * Filter cash flows to a specific time horizon.
 *
 * @param cashFlows - Base cash flows
 * @param horizonMonths - New time horizon in months
 * @returns Filtered cash flows
 */
export function filterCashFlowsByHorizon(
  cashFlows: readonly CashFlow[],
  horizonMonths: number
): CashFlow[] {
  return cashFlows.filter((cf) => cf.period <= horizonMonths);
}

/**
 * Calculate NPV for a sensitivity scenario.
 *
 * @param config - Analysis configuration
 * @param factor - Factor configuration
 * @param factorValue - Value to use for the factor
 * @returns Scenario result with NPV
 */
function calculateScenarioNPV(
  config: SensitivityAnalysisConfig,
  factor: SensitivityFactorConfig,
  factorValue: number
): Decimal {
  let cashFlows = [...config.baseCashFlows];
  let npvConfig = { ...config.baseNPVConfig };

  switch (factor.factorType) {
    case SensitivityFactorType.DISCOUNT_RATE:
      npvConfig = { ...npvConfig, annualDiscountRate: factorValue };
      break;

    case SensitivityFactorType.COST_MULTIPLIER:
      // For cost multiplier, we assume negative cash flows are costs
      cashFlows = cashFlows.map((cf) => {
        const amount = toDecimal(cf.amount);
        if (amount.isNegative()) {
          return {
            period: cf.period,
            amount: toCurrency(multiply(amount, toDecimal(factorValue))),
          };
        }
        return cf;
      });
      break;

    case SensitivityFactorType.BENEFIT_MULTIPLIER:
      // For benefit multiplier, we assume positive cash flows are benefits
      cashFlows = cashFlows.map((cf) => {
        const amount = toDecimal(cf.amount);
        if (amount.isPositive()) {
          return {
            period: cf.period,
            amount: toCurrency(multiply(amount, toDecimal(factorValue))),
          };
        }
        return cf;
      });
      break;

    case SensitivityFactorType.TIME_HORIZON:
      cashFlows = filterCashFlowsByHorizon(config.baseCashFlows, Math.floor(factorValue));
      break;

    case SensitivityFactorType.CUSTOM:
      // Custom factors use base values as-is
      // The caller should pre-compute the cash flows
      break;
  }

  const result = calculateNPV(cashFlows, npvConfig);
  return toDecimal(result.npv);
}

/**
 * Analyze sensitivity of NPV to a single factor.
 *
 * @param config - Analysis configuration
 * @param factor - Factor to analyze
 * @returns Sensitivity factor result
 */
export function analyzeSingleFactor(
  config: SensitivityAnalysisConfig,
  factor: SensitivityFactorConfig
): SensitivityFactor {
  // Calculate base NPV
  const baseNPV = calculateNPV(config.baseCashFlows, config.baseNPVConfig);
  const baseNPVDecimal = toDecimal(baseNPV.npv);

  // Calculate low scenario NPV
  const lowNPV = calculateScenarioNPV(config, factor, factor.lowValue);

  // Calculate high scenario NPV
  const highNPV = calculateScenarioNPV(config, factor, factor.highValue);

  // Impact on NPV is the range from low to high
  const impactRange = subtract(highNPV, lowNPV);

  // Calculate elasticity using high scenario
  const elasticity = calculateElasticity(
    baseNPVDecimal,
    highNPV,
    factor.baseValue,
    factor.highValue
  );

  const impactOnNPV: MonetaryValue = {
    amount: toCurrency(impactRange),
    currency: config.currency,
    asOfDate: config.asOfDate,
  };

  return {
    factorName: factor.factorName,
    baseValue: factor.baseValue,
    lowValue: factor.lowValue,
    highValue: factor.highValue,
    impactOnNPV,
    elasticity,
  };
}

/**
 * Perform a complete sensitivity analysis across multiple factors.
 *
 * @param config - Analysis configuration
 * @param factors - Array of factors to analyze
 * @returns Complete sensitivity table with tornado ordering
 */
export function performSensitivityAnalysis(
  config: SensitivityAnalysisConfig,
  factors: readonly SensitivityFactorConfig[]
): SensitivityTable {
  // Analyze each factor
  const analyzedFactors = factors.map((factor) =>
    analyzeSingleFactor(config, factor)
  );

  // Sort by absolute impact (tornado order - highest impact first)
  const sortedFactors = [...analyzedFactors].sort((a, b) => {
    const absImpactA = abs(a.impactOnNPV.amount);
    const absImpactB = abs(b.impactOnNPV.amount);
    // Sort descending by absolute impact
    return absImpactB.comparedTo(absImpactA);
  });

  // Extract tornado order (factor names in order of impact)
  const tornadoOrder = sortedFactors.map((f) => f.factorName);

  return {
    factors: sortedFactors,
    tornadoOrder,
  };
}

/**
 * Generate a standard set of sensitivity factors for common analysis.
 *
 * @param baseDiscountRate - Base discount rate
 * @param baseTimeHorizon - Base time horizon in months
 * @returns Array of standard sensitivity factor configurations
 */
export function generateStandardFactors(
  baseDiscountRate: number,
  baseTimeHorizon: number
): SensitivityFactorConfig[] {
  return [
    {
      factorName: 'Discount Rate',
      baseValue: baseDiscountRate,
      lowValue: baseDiscountRate * 0.5, // 50% lower
      highValue: baseDiscountRate * 1.5, // 50% higher
      factorType: SensitivityFactorType.DISCOUNT_RATE,
    },
    {
      factorName: 'Cost Multiplier',
      baseValue: 1.0,
      lowValue: 0.8, // 20% lower costs
      highValue: 1.2, // 20% higher costs
      factorType: SensitivityFactorType.COST_MULTIPLIER,
    },
    {
      factorName: 'Benefit Multiplier',
      baseValue: 1.0,
      lowValue: 0.8, // 20% lower benefits
      highValue: 1.2, // 20% higher benefits
      factorType: SensitivityFactorType.BENEFIT_MULTIPLIER,
    },
    {
      factorName: 'Time Horizon',
      baseValue: baseTimeHorizon,
      lowValue: Math.max(1, baseTimeHorizon * 0.5), // 50% shorter
      highValue: baseTimeHorizon * 1.5, // 50% longer
      factorType: SensitivityFactorType.TIME_HORIZON,
    },
  ];
}

/**
 * Calculate NPV at multiple discount rate points for a sensitivity curve.
 *
 * @param cashFlows - Base cash flows
 * @param ratePoints - Array of discount rates to evaluate
 * @returns Array of rate-NPV pairs
 */
export function calculateDiscountRateSensitivityCurve(
  cashFlows: readonly CashFlow[],
  ratePoints: readonly number[]
): { rate: number; npv: string }[] {
  return ratePoints.map((rate) => {
    const result = calculateNPV(cashFlows, { annualDiscountRate: rate });
    return {
      rate,
      npv: result.npv,
    };
  });
}

/**
 * SensitivityEngine class providing a stateful interface for sensitivity analysis.
 */
export class SensitivityEngine {
  private readonly config: SensitivityAnalysisConfig;

  constructor(config: SensitivityAnalysisConfig) {
    this.config = config;
  }

  /**
   * Get the base NPV configuration.
   */
  get baseConfig(): NPVConfig {
    return this.config.baseNPVConfig;
  }

  /**
   * Analyze sensitivity to a single factor.
   */
  analyzeFactor(factor: SensitivityFactorConfig): SensitivityFactor {
    return analyzeSingleFactor(this.config, factor);
  }

  /**
   * Perform full sensitivity analysis.
   */
  analyze(factors: readonly SensitivityFactorConfig[]): SensitivityTable {
    return performSensitivityAnalysis(this.config, factors);
  }

  /**
   * Perform standard sensitivity analysis with common factors.
   */
  analyzeStandard(): SensitivityTable {
    const standardFactors = generateStandardFactors(
      this.config.baseNPVConfig.annualDiscountRate,
      this.config.baseCashFlows.length
    );
    return this.analyze(standardFactors);
  }

  /**
   * Calculate discount rate sensitivity curve.
   */
  discountRateCurve(ratePoints?: readonly number[]): { rate: number; npv: string }[] {
    const defaultPoints = [0.02, 0.04, 0.06, 0.08, 0.10, 0.12, 0.15, 0.20];
    return calculateDiscountRateSensitivityCurve(
      this.config.baseCashFlows,
      ratePoints ?? defaultPoints
    );
  }

  /**
   * Calculate what-if scenario with modified cash flows.
   */
  whatIf(modifier: (cashFlows: CashFlow[]) => CashFlow[]): string {
    const modifiedCashFlows = modifier([...this.config.baseCashFlows]);
    const result = calculateNPV(modifiedCashFlows, this.config.baseNPVConfig);
    return result.npv;
  }

  /**
   * Create a new engine with different base cash flows.
   */
  withCashFlows(cashFlows: readonly CashFlow[]): SensitivityEngine {
    return new SensitivityEngine({
      ...this.config,
      baseCashFlows: cashFlows,
    });
  }

  /**
   * Create a new engine with a different discount rate.
   */
  withDiscountRate(annualDiscountRate: number): SensitivityEngine {
    return new SensitivityEngine({
      ...this.config,
      baseNPVConfig: {
        ...this.config.baseNPVConfig,
        annualDiscountRate,
      },
    });
  }
}
