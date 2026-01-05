/**
 * NPV Engine
 * Calculates Net Present Value with configurable discount rates.
 *
 * Implements monthly discounting using the formula:
 * - monthlyRate = annualRate / 12
 * - discountFactor = 1 / (1 + monthlyRate)^month
 * - NPV = sum of (monthlyDelta * discountFactor) for each month
 *
 * All calculations use decimal.js for precision.
 * Pure functions ensure deterministic output: same inputs = same outputs.
 */

import {
  TimeAdjustedDelta,
  UUID,
} from '../contracts';
import {
  Decimal,
  toDecimal,
  add,
  subtract,
  divide,
  multiply,
  pow,
  toCurrency,
  zero,
  one,
  isZero,
} from '../lib/financial';

/**
 * Configuration for NPV calculation.
 */
export interface NPVConfig {
  /** Annual discount rate as a decimal (0.10 = 10%) */
  readonly annualDiscountRate: number;
  /** Whether to compound monthly (true) or use simple division (false) */
  readonly useMonthlyCompounding?: boolean;
}

/**
 * Represents a single period's cash flow.
 */
export interface CashFlow {
  /** Period number (1-indexed, representing months) */
  readonly period: number;
  /** Net cash flow for this period (positive = inflow, negative = outflow) */
  readonly amount: string;
}

/**
 * Result of an NPV calculation.
 */
export interface NPVResult {
  /** The calculated Net Present Value */
  readonly npv: string;
  /** The annual discount rate used */
  readonly annualDiscountRate: number;
  /** The monthly discount rate derived from annual rate */
  readonly monthlyDiscountRate: number;
  /** Total number of periods */
  readonly totalPeriods: number;
  /** Sum of undiscounted cash flows */
  readonly undiscountedTotal: string;
  /** Average discount factor across all periods */
  readonly averageDiscountFactor: number;
}

/**
 * Result of a single period's present value calculation.
 */
export interface PeriodPresentValue {
  readonly period: number;
  readonly nominalAmount: string;
  readonly discountFactor: number;
  readonly presentValue: string;
}

/**
 * Calculate the monthly discount rate from an annual rate.
 *
 * @param annualRate - Annual discount rate as a decimal (0.10 = 10%)
 * @returns Monthly discount rate as a Decimal
 */
export function calculateMonthlyRate(annualRate: number): Decimal {
  // Simple monthly rate: annualRate / 12
  return divide(toDecimal(annualRate), '12');
}

/**
 * Calculate the effective monthly rate from an annual rate using compound interest.
 *
 * @param annualRate - Annual discount rate as a decimal
 * @returns Effective monthly rate as a Decimal
 */
export function calculateEffectiveMonthlyRate(annualRate: number): Decimal {
  // (1 + annualRate)^(1/12) - 1
  const onePlusRate = add(one(), toDecimal(annualRate));
  const monthlyCompound = onePlusRate.pow(1 / 12);
  return subtract(monthlyCompound, '1');
}

/**
 * Calculate the discount factor for a given period.
 *
 * discountFactor = 1 / (1 + monthlyRate)^period
 *
 * @param monthlyRate - Monthly discount rate as a Decimal
 * @param period - Period number (1-indexed)
 * @returns Discount factor as a Decimal
 */
export function calculateDiscountFactor(monthlyRate: Decimal, period: number): Decimal {
  if (period < 0) {
    throw new Error('Period must be non-negative');
  }
  if (period === 0) {
    return one();
  }

  // (1 + monthlyRate)^period
  const onePlusRate = add(one(), monthlyRate);
  const compoundFactor = pow(onePlusRate, period);

  // 1 / compoundFactor
  return divide(one(), compoundFactor);
}

/**
 * Calculate the present value of a single cash flow.
 *
 * @param amount - Cash flow amount as a decimal string
 * @param discountFactor - Discount factor for this period
 * @returns Present value as a Decimal
 */
export function calculatePresentValue(amount: string, discountFactor: Decimal): Decimal {
  return multiply(toDecimal(amount), discountFactor);
}

/**
 * Calculate NPV for a series of monthly cash flows.
 *
 * @param cashFlows - Array of cash flows with period and amount
 * @param config - NPV configuration including discount rate
 * @returns Complete NPV result
 */
export function calculateNPV(cashFlows: readonly CashFlow[], config: NPVConfig): NPVResult {
  if (cashFlows.length === 0) {
    return {
      npv: toCurrency(zero()),
      annualDiscountRate: config.annualDiscountRate,
      monthlyDiscountRate: 0,
      totalPeriods: 0,
      undiscountedTotal: toCurrency(zero()),
      averageDiscountFactor: 1,
    };
  }

  const useCompounding = config.useMonthlyCompounding !== false;
  const monthlyRate = useCompounding
    ? calculateEffectiveMonthlyRate(config.annualDiscountRate)
    : calculateMonthlyRate(config.annualDiscountRate);

  let totalPV = zero();
  let totalNominal = zero();
  let totalDiscountFactor = zero();

  for (const cashFlow of cashFlows) {
    const discountFactor = calculateDiscountFactor(monthlyRate, cashFlow.period);
    const pv = calculatePresentValue(cashFlow.amount, discountFactor);

    totalPV = add(totalPV, pv);
    totalNominal = add(totalNominal, cashFlow.amount);
    totalDiscountFactor = add(totalDiscountFactor, discountFactor);
  }

  const averageDiscountFactor = divide(totalDiscountFactor, toDecimal(cashFlows.length)).toNumber();

  return {
    npv: toCurrency(totalPV),
    annualDiscountRate: config.annualDiscountRate,
    monthlyDiscountRate: monthlyRate.toNumber(),
    totalPeriods: cashFlows.length,
    undiscountedTotal: toCurrency(totalNominal),
    averageDiscountFactor,
  };
}

/**
 * Calculate the present value for each period in a cash flow series.
 *
 * @param cashFlows - Array of cash flows
 * @param config - NPV configuration
 * @returns Array of per-period present value calculations
 */
export function calculatePeriodPresentValues(
  cashFlows: readonly CashFlow[],
  config: NPVConfig
): PeriodPresentValue[] {
  const useCompounding = config.useMonthlyCompounding !== false;
  const monthlyRate = useCompounding
    ? calculateEffectiveMonthlyRate(config.annualDiscountRate)
    : calculateMonthlyRate(config.annualDiscountRate);

  return cashFlows.map((cashFlow) => {
    const discountFactor = calculateDiscountFactor(monthlyRate, cashFlow.period);
    const pv = calculatePresentValue(cashFlow.amount, discountFactor);

    return {
      period: cashFlow.period,
      nominalAmount: cashFlow.amount,
      discountFactor: discountFactor.toNumber(),
      presentValue: toCurrency(pv),
    };
  });
}

/**
 * Calculate time-adjusted delta for a decision.
 *
 * @param decisionRecordId - The decision record ID
 * @param undiscountedDelta - The undiscounted net delta
 * @param horizonMonths - The time horizon in months
 * @param annualDiscountRate - Annual discount rate
 * @returns TimeAdjustedDelta result
 */
export function calculateTimeAdjustedDelta(
  decisionRecordId: UUID,
  undiscountedDelta: string,
  horizonMonths: number,
  annualDiscountRate: number
): TimeAdjustedDelta {
  const monthlyRate = calculateMonthlyRate(annualDiscountRate);

  // Create uniform cash flows across the horizon
  const monthlyDelta = divide(toDecimal(undiscountedDelta), toDecimal(horizonMonths));
  const cashFlows: CashFlow[] = [];

  for (let month = 1; month <= horizonMonths; month++) {
    cashFlows.push({
      period: month,
      amount: toCurrency(monthlyDelta),
    });
  }

  const npvResult = calculateNPV(cashFlows, { annualDiscountRate, useMonthlyCompounding: true });

  // Calculate the overall discount factor (PV / undiscounted)
  const undiscountedDecimal = toDecimal(undiscountedDelta);
  const pvDecimal = toDecimal(npvResult.npv);
  const overallDiscountFactor = isZero(undiscountedDecimal)
    ? 1
    : divide(pvDecimal, undiscountedDecimal).toNumber();

  // Annualize the present value
  const annualizedValue = horizonMonths > 0
    ? multiply(divide(pvDecimal, toDecimal(horizonMonths)), '12')
    : zero();

  return {
    decisionRecordId,
    undiscountedDelta: toCurrency(undiscountedDecimal),
    presentValue: npvResult.npv,
    discountFactor: overallDiscountFactor,
    horizonMonths,
    monthlyDiscountRate: monthlyRate.toNumber(),
    annualizedValue: toCurrency(annualizedValue),
  };
}

/**
 * Calculate NPV for a single lump sum at a future period.
 *
 * @param amount - Future value amount
 * @param period - Period at which the amount is received
 * @param annualDiscountRate - Annual discount rate
 * @returns Present value as a string
 */
export function calculateSinglePeriodNPV(
  amount: string,
  period: number,
  annualDiscountRate: number
): string {
  const monthlyRate = calculateMonthlyRate(annualDiscountRate);
  const discountFactor = calculateDiscountFactor(monthlyRate, period);
  const pv = calculatePresentValue(amount, discountFactor);
  return toCurrency(pv);
}

/**
 * Calculate cumulative present values over time.
 *
 * @param cashFlows - Array of cash flows
 * @param config - NPV configuration
 * @returns Array of cumulative present values at each period
 */
export function calculateCumulativeNPV(
  cashFlows: readonly CashFlow[],
  config: NPVConfig
): { period: number; cumulativePV: string }[] {
  const periodPVs = calculatePeriodPresentValues(cashFlows, config);
  let cumulative = zero();
  const results: { period: number; cumulativePV: string }[] = [];

  // Sort by period to ensure correct cumulative calculation
  const sorted = [...periodPVs].sort((a, b) => a.period - b.period);

  for (const pv of sorted) {
    cumulative = add(cumulative, pv.presentValue);
    results.push({
      period: pv.period,
      cumulativePV: toCurrency(cumulative),
    });
  }

  return results;
}

/**
 * NPVEngine class providing a stateful interface for NPV calculations.
 */
export class NPVEngine {
  private readonly config: NPVConfig;

  constructor(config: NPVConfig) {
    this.config = config;
  }

  /**
   * Get the configured annual discount rate.
   */
  get annualRate(): number {
    return this.config.annualDiscountRate;
  }

  /**
   * Get the derived monthly discount rate.
   */
  get monthlyRate(): number {
    return calculateMonthlyRate(this.config.annualDiscountRate).toNumber();
  }

  /**
   * Calculate NPV for a series of cash flows.
   */
  npv(cashFlows: readonly CashFlow[]): NPVResult {
    return calculateNPV(cashFlows, this.config);
  }

  /**
   * Calculate the discount factor for a specific period.
   */
  discountFactor(period: number): number {
    const monthlyRate = calculateMonthlyRate(this.config.annualDiscountRate);
    return calculateDiscountFactor(monthlyRate, period).toNumber();
  }

  /**
   * Calculate present value for each period.
   */
  periodPresentValues(cashFlows: readonly CashFlow[]): PeriodPresentValue[] {
    return calculatePeriodPresentValues(cashFlows, this.config);
  }

  /**
   * Calculate time-adjusted delta for a decision.
   */
  timeAdjustedDelta(
    decisionRecordId: UUID,
    undiscountedDelta: string,
    horizonMonths: number
  ): TimeAdjustedDelta {
    return calculateTimeAdjustedDelta(
      decisionRecordId,
      undiscountedDelta,
      horizonMonths,
      this.config.annualDiscountRate
    );
  }

  /**
   * Calculate cumulative NPV over time.
   */
  cumulativeNPV(cashFlows: readonly CashFlow[]): { period: number; cumulativePV: string }[] {
    return calculateCumulativeNPV(cashFlows, this.config);
  }

  /**
   * Create a new engine with a different discount rate.
   */
  withDiscountRate(annualDiscountRate: number): NPVEngine {
    return new NPVEngine({
      ...this.config,
      annualDiscountRate,
    });
  }
}
