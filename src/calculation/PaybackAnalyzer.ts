/**
 * Payback Analyzer
 * Determines the payback period for investments.
 *
 * Supports both simple and discounted payback period calculations.
 * Returns null if the investment never pays back within the horizon.
 *
 * All calculations use decimal.js for precision.
 * Pure functions ensure deterministic output: same inputs = same outputs.
 */

import {
  Decimal,
  toDecimal,
  add,
  divide,
  multiply,
  isPositive,
  isNegative,
  isZero,
  toCurrency,
} from '../lib/financial';
import {
  CashFlow,
  calculateMonthlyRate,
  calculateDiscountFactor,
  calculatePresentValue,
} from './NPVEngine';

/**
 * Configuration for payback period calculation.
 */
export interface PaybackConfig {
  /** Initial investment amount (positive number) */
  readonly initialInvestment: string;
  /** Annual discount rate for discounted payback (0 for simple payback) */
  readonly annualDiscountRate?: number;
  /** Maximum periods to consider (defaults to 120 months / 10 years) */
  readonly maxPeriods?: number;
}

/**
 * Result of a payback period calculation.
 */
export interface PaybackResult {
  /** Payback period in months, null if never pays back */
  readonly paybackPeriodMonths: number | null;
  /** Payback period in years for readability */
  readonly paybackPeriodYears: number | null;
  /** Whether discounted payback was used */
  readonly isDiscounted: boolean;
  /** The discount rate used (0 if simple payback) */
  readonly discountRate: number;
  /** Cumulative cash flow at payback (or at end if no payback) */
  readonly cumulativeCashFlow: string;
  /** Whether payback was achieved */
  readonly achievesPayback: boolean;
  /** The period at which cumulative becomes positive */
  readonly breakEvenPeriod: number | null;
}

/**
 * Detailed period-by-period payback analysis.
 */
export interface PaybackAnalysis {
  /** The payback result summary */
  readonly result: PaybackResult;
  /** Period-by-period cumulative cash flows */
  readonly periodDetails: readonly PaybackPeriodDetail[];
  /** The initial investment */
  readonly initialInvestment: string;
}

/**
 * Detail for a single period in payback analysis.
 */
export interface PaybackPeriodDetail {
  readonly period: number;
  readonly cashFlow: string;
  readonly discountedCashFlow: string;
  readonly cumulativeCashFlow: string;
  readonly cumulativeDiscountedCashFlow: string;
  readonly discountFactor: number;
  readonly remainingToPayback: string;
}

/**
 * Calculate simple payback period (no discounting).
 *
 * Finds the month where cumulative net cash flow becomes positive
 * after accounting for the initial investment.
 *
 * @param cashFlows - Array of periodic cash flows
 * @param initialInvestment - Initial investment amount (positive)
 * @returns Payback period in months, or null if never achieved
 */
export function calculateSimplePaybackPeriod(
  cashFlows: readonly CashFlow[],
  initialInvestment: string
): number | null {
  const investment = toDecimal(initialInvestment);

  if (isZero(investment) || isNegative(investment)) {
    // No investment means immediate payback
    return 0;
  }

  // Sort cash flows by period
  const sorted = [...cashFlows].sort((a, b) => a.period - b.period);

  let cumulative = investment.negated(); // Start with negative investment

  for (const cf of sorted) {
    cumulative = add(cumulative, cf.amount);

    if (isPositive(cumulative) || isZero(cumulative)) {
      return cf.period;
    }
  }

  // Never paid back
  return null;
}

/**
 * Calculate discounted payback period.
 *
 * Same as simple payback but uses discounted cash flows.
 *
 * @param cashFlows - Array of periodic cash flows
 * @param initialInvestment - Initial investment amount
 * @param annualDiscountRate - Annual discount rate
 * @returns Payback period in months, or null if never achieved
 */
export function calculateDiscountedPaybackPeriod(
  cashFlows: readonly CashFlow[],
  initialInvestment: string,
  annualDiscountRate: number
): number | null {
  const investment = toDecimal(initialInvestment);
  const monthlyRate = calculateMonthlyRate(annualDiscountRate);

  if (isZero(investment) || isNegative(investment)) {
    return 0;
  }

  // Sort cash flows by period
  const sorted = [...cashFlows].sort((a, b) => a.period - b.period);

  let cumulative = investment.negated();

  for (const cf of sorted) {
    const discountFactor = calculateDiscountFactor(monthlyRate, cf.period);
    const discountedCF = calculatePresentValue(cf.amount, discountFactor);
    cumulative = add(cumulative, discountedCF);

    if (isPositive(cumulative) || isZero(cumulative)) {
      return cf.period;
    }
  }

  // Never paid back
  return null;
}

/**
 * Calculate payback period with full configuration.
 *
 * @param cashFlows - Array of periodic cash flows
 * @param config - Payback calculation configuration
 * @returns Complete payback result
 */
export function calculatePaybackPeriod(
  cashFlows: readonly CashFlow[],
  config: PaybackConfig
): PaybackResult {
  const isDiscounted = (config.annualDiscountRate ?? 0) > 0;
  const discountRate = config.annualDiscountRate ?? 0;
  const investment = toDecimal(config.initialInvestment);

  // Calculate appropriate payback period
  const paybackPeriodMonths = isDiscounted
    ? calculateDiscountedPaybackPeriod(cashFlows, config.initialInvestment, discountRate)
    : calculateSimplePaybackPeriod(cashFlows, config.initialInvestment);

  // Calculate final cumulative cash flow
  const sorted = [...cashFlows].sort((a, b) => a.period - b.period);
  let cumulative = investment.negated();
  const monthlyRate = calculateMonthlyRate(discountRate);

  for (const cf of sorted) {
    if (isDiscounted) {
      const discountFactor = calculateDiscountFactor(monthlyRate, cf.period);
      const discountedCF = calculatePresentValue(cf.amount, discountFactor);
      cumulative = add(cumulative, discountedCF);
    } else {
      cumulative = add(cumulative, cf.amount);
    }
  }

  const paybackYears = paybackPeriodMonths !== null
    ? paybackPeriodMonths / 12
    : null;

  return {
    paybackPeriodMonths,
    paybackPeriodYears: paybackYears,
    isDiscounted,
    discountRate,
    cumulativeCashFlow: toCurrency(cumulative),
    achievesPayback: paybackPeriodMonths !== null,
    breakEvenPeriod: paybackPeriodMonths,
  };
}

/**
 * Perform detailed payback analysis with period-by-period breakdown.
 *
 * @param cashFlows - Array of periodic cash flows
 * @param config - Payback calculation configuration
 * @returns Complete payback analysis with period details
 */
export function analyzePayback(
  cashFlows: readonly CashFlow[],
  config: PaybackConfig
): PaybackAnalysis {
  const isDiscounted = (config.annualDiscountRate ?? 0) > 0;
  const discountRate = config.annualDiscountRate ?? 0;
  const investment = toDecimal(config.initialInvestment);
  const monthlyRate = calculateMonthlyRate(discountRate);

  // Sort cash flows by period
  const sorted = [...cashFlows].sort((a, b) => a.period - b.period);

  let cumulativeNominal = investment.negated();
  let cumulativeDiscounted = investment.negated();

  const periodDetails: PaybackPeriodDetail[] = [];

  for (const cf of sorted) {
    const cfAmount = toDecimal(cf.amount);
    const discountFactor = calculateDiscountFactor(monthlyRate, cf.period);
    const discountedCF = multiply(cfAmount, discountFactor);

    cumulativeNominal = add(cumulativeNominal, cfAmount);
    cumulativeDiscounted = add(cumulativeDiscounted, discountedCF);

    const remaining = isDiscounted
      ? cumulativeDiscounted.negated()
      : cumulativeNominal.negated();

    periodDetails.push({
      period: cf.period,
      cashFlow: toCurrency(cfAmount),
      discountedCashFlow: toCurrency(discountedCF),
      cumulativeCashFlow: toCurrency(cumulativeNominal),
      cumulativeDiscountedCashFlow: toCurrency(cumulativeDiscounted),
      discountFactor: discountFactor.toNumber(),
      remainingToPayback: isPositive(remaining) ? toCurrency(remaining) : '0.0000',
    });
  }

  const result = calculatePaybackPeriod(cashFlows, config);

  return {
    result,
    periodDetails,
    initialInvestment: toCurrency(investment),
  };
}

/**
 * Calculate the exact payback period with interpolation.
 *
 * Instead of returning the period where payback is first achieved,
 * this interpolates to find the fractional period.
 *
 * @param cashFlows - Array of periodic cash flows
 * @param config - Payback calculation configuration
 * @returns Interpolated payback period in months
 */
export function calculateInterpolatedPaybackPeriod(
  cashFlows: readonly CashFlow[],
  config: PaybackConfig
): number | null {
  const isDiscounted = (config.annualDiscountRate ?? 0) > 0;
  const discountRate = config.annualDiscountRate ?? 0;
  const investment = toDecimal(config.initialInvestment);
  const monthlyRate = calculateMonthlyRate(discountRate);

  if (isZero(investment) || isNegative(investment)) {
    return 0;
  }

  // Sort cash flows by period
  const sorted = [...cashFlows].sort((a, b) => a.period - b.period);

  let cumulative = investment.negated();
  let previousCumulative = cumulative;
  let previousPeriod = 0;

  for (const cf of sorted) {
    const cfAmount = toDecimal(cf.amount);
    let periodCF: Decimal;

    if (isDiscounted) {
      const discountFactor = calculateDiscountFactor(monthlyRate, cf.period);
      periodCF = multiply(cfAmount, discountFactor);
    } else {
      periodCF = cfAmount;
    }

    previousCumulative = cumulative;
    cumulative = add(cumulative, periodCF);

    if (isPositive(cumulative) || isZero(cumulative)) {
      // Interpolate between previous period and this period
      if (isZero(periodCF)) {
        return cf.period;
      }

      // How much of this period's cash flow was needed?
      const neededFromThisPeriod = previousCumulative.negated();
      const fractionOfPeriod = divide(neededFromThisPeriod, periodCF);

      // Interpolated period
      const gapPeriods = cf.period - previousPeriod;
      const interpolatedPeriod = previousPeriod + (fractionOfPeriod.toNumber() * gapPeriods);

      return Math.max(0, interpolatedPeriod);
    }

    previousPeriod = cf.period;
  }

  // Never paid back
  return null;
}

/**
 * Generate uniform cash flows for a given monthly amount over a horizon.
 *
 * Utility function to create cash flows for simple scenarios.
 *
 * @param monthlyAmount - Amount per month
 * @param horizonMonths - Number of months
 * @returns Array of cash flows
 */
export function generateUniformCashFlows(
  monthlyAmount: string,
  horizonMonths: number
): CashFlow[] {
  const cashFlows: CashFlow[] = [];

  for (let period = 1; period <= horizonMonths; period++) {
    cashFlows.push({
      period,
      amount: monthlyAmount,
    });
  }

  return cashFlows;
}

/**
 * PaybackAnalyzer class providing a stateful interface for payback analysis.
 */
export class PaybackAnalyzer {
  private readonly config: PaybackConfig;

  constructor(config: PaybackConfig) {
    this.config = {
      maxPeriods: 120, // Default 10 years
      ...config,
    };
  }

  /**
   * Get the initial investment.
   */
  get investment(): string {
    return this.config.initialInvestment;
  }

  /**
   * Calculate simple (non-discounted) payback period.
   */
  simplePayback(cashFlows: readonly CashFlow[]): PaybackResult {
    return calculatePaybackPeriod(cashFlows, {
      ...this.config,
      annualDiscountRate: 0,
    });
  }

  /**
   * Calculate discounted payback period.
   */
  discountedPayback(cashFlows: readonly CashFlow[]): PaybackResult {
    return calculatePaybackPeriod(cashFlows, this.config);
  }

  /**
   * Perform detailed payback analysis.
   */
  analyze(cashFlows: readonly CashFlow[]): PaybackAnalysis {
    return analyzePayback(cashFlows, this.config);
  }

  /**
   * Calculate interpolated payback period.
   */
  interpolatedPayback(cashFlows: readonly CashFlow[]): number | null {
    return calculateInterpolatedPaybackPeriod(cashFlows, this.config);
  }

  /**
   * Determine if an investment pays back within a given number of months.
   */
  paysBackWithin(cashFlows: readonly CashFlow[], months: number): boolean {
    const result = calculatePaybackPeriod(cashFlows, this.config);
    return result.paybackPeriodMonths !== null && result.paybackPeriodMonths <= months;
  }

  /**
   * Create a new analyzer with a different investment amount.
   */
  withInvestment(initialInvestment: string): PaybackAnalyzer {
    return new PaybackAnalyzer({
      ...this.config,
      initialInvestment,
    });
  }

  /**
   * Create a new analyzer with a different discount rate.
   */
  withDiscountRate(annualDiscountRate: number): PaybackAnalyzer {
    return new PaybackAnalyzer({
      ...this.config,
      annualDiscountRate,
    });
  }
}
