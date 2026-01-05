/**
 * Summary Generator
 * Generates human-readable summaries for financial artifacts.
 *
 * SPARC: Produces CFO-grade narrative summaries for executive consumption.
 */

import { toDecimal, toString, isNegative, isPositive, abs } from '../lib/financial';
import {
  FinancialSummary,
  FinancialDeltaResult,
  PortfolioMetrics,
} from '../contracts';

// ============================================================================
// Types
// ============================================================================

export interface SummaryGeneratorOptions {
  readonly currency: string;
  readonly locale?: string;
  readonly precision?: number;
  readonly includeConfidenceInterval?: boolean;
  readonly confidenceLevel?: number;
}

export interface GeneratedSummary {
  readonly headline: string;
  readonly detailed: string;
  readonly bullets: readonly string[];
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Formats a monetary amount for display with currency symbol
 */
function formatCurrency(
  amount: string,
  currency: string,
  locale: string = 'en-US'
): string {
  const numericAmount = parseFloat(amount);

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numericAmount);
  } catch {
    // Fallback for unsupported currencies
    return `${currency} ${formatNumber(numericAmount, 2)}`;
  }
}

/**
 * Formats a number with thousand separators
 */
function formatNumber(value: number, precision: number = 2): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
}

/**
 * Formats a percentage for display
 */
function formatPercentage(value: number, precision: number = 1): string {
  return `${(value * 100).toFixed(precision)}%`;
}

/**
 * Formats a duration in months to a human-readable string
 */
function formatDuration(months: number | null): string {
  if (months === null) {
    return 'N/A';
  }

  if (months < 1) {
    return 'less than 1 month';
  }

  if (months === 1) {
    return '1 month';
  }

  if (months < 12) {
    return `${Math.round(months)} months`;
  }

  const years = Math.floor(months / 12);
  const remainingMonths = Math.round(months % 12);

  if (remainingMonths === 0) {
    return years === 1 ? '1 year' : `${years} years`;
  }

  const yearText = years === 1 ? '1 year' : `${years} years`;
  const monthText = remainingMonths === 1 ? '1 month' : `${remainingMonths} months`;

  return `${yearText} and ${monthText}`;
}

/**
 * Determines the outcome type based on net benefit
 */
function getOutcomeType(netBenefit: string): 'positive' | 'negative' | 'neutral' {
  const value = toDecimal(netBenefit);
  if (isPositive(value)) return 'positive';
  if (isNegative(value)) return 'negative';
  return 'neutral';
}

// ============================================================================
// Summary Generator Class
// ============================================================================

export class SummaryGenerator {
  private readonly options: Required<SummaryGeneratorOptions>;

  constructor(options: SummaryGeneratorOptions) {
    this.options = {
      currency: options.currency,
      locale: options.locale ?? 'en-US',
      precision: options.precision ?? 2,
      includeConfidenceInterval: options.includeConfidenceInterval ?? true,
      confidenceLevel: options.confidenceLevel ?? 90,
    };
  }

  /**
   * Generates the primary human-readable summary string
   * Format: "This decision would save $X.XX per year (90% CI: $Y.YY - $Z.ZZ)"
   */
  public generateHeadlineSummary(summary: FinancialSummary): string {
    const netBenefitAmount = summary.netBenefit.amount;
    const outcomeType = getOutcomeType(netBenefitAmount);
    const ci = summary.confidenceInterval;

    // Annualize if needed (assuming summary values are for the full horizon)
    const annualizedBenefit = this.annualizeBenefit(netBenefitAmount, summary.paybackPeriodMonths);

    const formattedBenefit = formatCurrency(
      toString(abs(annualizedBenefit)),
      this.options.currency,
      this.options.locale
    );

    let headline: string;

    if (outcomeType === 'positive') {
      headline = `This decision would save ${formattedBenefit} per year`;
    } else if (outcomeType === 'negative') {
      headline = `This decision would cost ${formattedBenefit} per year`;
    } else {
      headline = `This decision would have a neutral financial impact`;
    }

    // Add confidence interval if enabled
    if (this.options.includeConfidenceInterval && outcomeType !== 'neutral') {
      const lowerBound = formatCurrency(ci.lowerBound, this.options.currency, this.options.locale);
      const upperBound = formatCurrency(ci.upperBound, this.options.currency, this.options.locale);
      headline += ` (${ci.confidenceLevel}% CI: ${lowerBound} - ${upperBound})`;
    }

    return headline;
  }

  /**
   * Generates a complete summary from FinancialDeltaResult
   */
  public generateFromDeltaResult(deltaResult: FinancialDeltaResult): GeneratedSummary {
    const metrics = deltaResult.portfolioMetrics;
    const currency = this.options.currency;
    const locale = this.options.locale;

    // Generate headline
    const totalPV = metrics.totalPresentValue;
    const outcomeType = getOutcomeType(totalPV);

    const formattedPV = formatCurrency(
      toString(abs(toDecimal(totalPV))),
      currency,
      locale
    );

    let headline: string;
    if (outcomeType === 'positive') {
      headline = `This portfolio of ${metrics.decisionCount} decisions would generate ${formattedPV} in net present value`;
    } else if (outcomeType === 'negative') {
      headline = `This portfolio of ${metrics.decisionCount} decisions would result in ${formattedPV} net cost`;
    } else {
      headline = `This portfolio of ${metrics.decisionCount} decisions would have neutral financial impact`;
    }

    // Generate detailed summary
    const detailed = this.generateDetailedSummary(metrics);

    // Generate bullet points
    const bullets = this.generateBulletPoints(metrics);

    return { headline, detailed, bullets };
  }

  /**
   * Generates a summary from FinancialSummary
   */
  public generateFromSummary(summary: FinancialSummary): GeneratedSummary {
    const currency = this.options.currency;
    const locale = this.options.locale;

    // Generate headline
    const headline = this.generateHeadlineSummary(summary);

    // Generate detailed summary
    const totalInvestment = formatCurrency(summary.totalInvestment.amount, currency, locale);
    const totalBenefit = formatCurrency(summary.totalBenefit.amount, currency, locale);
    const netBenefit = formatCurrency(summary.netBenefit.amount, currency, locale);
    const npv = formatCurrency(summary.npv.amount, currency, locale);
    const roi = formatPercentage(summary.roi);
    const payback = formatDuration(summary.paybackPeriodMonths);

    const detailed = [
      `Total Investment: ${totalInvestment}`,
      `Total Benefit: ${totalBenefit}`,
      `Net Benefit: ${netBenefit}`,
      `NPV: ${npv}`,
      `ROI: ${roi}`,
      `Payback Period: ${payback}`,
      summary.irr !== null ? `IRR: ${formatPercentage(summary.irr)}` : '',
    ].filter(Boolean).join('. ');

    // Generate bullet points
    const bullets: string[] = [
      `Net present value of ${npv} at ${formatPercentage(summary.discountRate)} discount rate`,
      `Return on investment of ${roi}`,
      `Payback period of ${payback}`,
    ];

    if (summary.irr !== null) {
      bullets.push(`Internal rate of return of ${formatPercentage(summary.irr)}`);
    }

    const ci = summary.confidenceInterval;
    const lowerBound = formatCurrency(ci.lowerBound, currency, locale);
    const upperBound = formatCurrency(ci.upperBound, currency, locale);
    bullets.push(`${ci.confidenceLevel}% confidence range: ${lowerBound} to ${upperBound}`);

    return { headline, detailed, bullets };
  }

  /**
   * Generates executive summary for a financial artifact
   */
  public generateExecutiveSummary(summary: FinancialSummary): string {
    const result = this.generateFromSummary(summary);

    const lines = [
      '## Executive Summary',
      '',
      result.headline,
      '',
      '### Key Metrics',
      '',
      ...result.bullets.map(b => `- ${b}`),
      '',
      '### Details',
      '',
      result.detailed,
    ];

    return lines.join('\n');
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private annualizeBenefit(amount: string, paybackMonths: number | null): ReturnType<typeof toDecimal> {
    const benefit = toDecimal(amount);

    // If we have payback info, use it to estimate annual rate
    // Otherwise assume the amount is already annualized
    if (paybackMonths !== null && paybackMonths > 0) {
      // This is a rough estimation
      return benefit.dividedBy(paybackMonths).times(12);
    }

    return benefit;
  }

  private generateDetailedSummary(metrics: PortfolioMetrics): string {
    const currency = this.options.currency;
    const locale = this.options.locale;

    const grossSavings = formatCurrency(metrics.totalGrossSavings, currency, locale);
    const riskAdjusted = formatCurrency(metrics.totalRiskAdjustedSavings, currency, locale);
    const presentValue = formatCurrency(metrics.totalPresentValue, currency, locale);
    const avgRisk = formatPercentage(metrics.averageRiskAdjustmentFactor);
    const avgDiscount = formatPercentage(metrics.averageDiscountFactor);

    return [
      `This analysis covers ${metrics.decisionCount} decisions`,
      `${metrics.positiveNPVCount} with positive NPV.`,
      `Gross savings total ${grossSavings}.`,
      `After risk adjustment (avg factor: ${avgRisk}), savings are ${riskAdjusted}.`,
      `Present value at avg discount factor ${avgDiscount} is ${presentValue}.`,
    ].join(' ');
  }

  private generateBulletPoints(metrics: PortfolioMetrics): readonly string[] {
    const currency = this.options.currency;
    const locale = this.options.locale;

    return [
      `${metrics.decisionCount} decisions analyzed`,
      `${metrics.positiveNPVCount} decisions with positive NPV`,
      `Gross savings: ${formatCurrency(metrics.totalGrossSavings, currency, locale)}`,
      `Risk-adjusted savings: ${formatCurrency(metrics.totalRiskAdjustedSavings, currency, locale)}`,
      `Total present value: ${formatCurrency(metrics.totalPresentValue, currency, locale)}`,
      `Average risk adjustment: ${formatPercentage(metrics.averageRiskAdjustmentFactor)}`,
      `Uncertainty factor: ${formatPercentage(metrics.weightedUncertaintyFactor)}`,
    ];
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createSummaryGenerator(options: SummaryGeneratorOptions): SummaryGenerator {
  return new SummaryGenerator(options);
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick generation of headline summary from financial summary
 */
export function generateQuickSummary(
  summary: FinancialSummary,
  currency: string = 'USD'
): string {
  const generator = new SummaryGenerator({ currency });
  return generator.generateHeadlineSummary(summary);
}

/**
 * Quick generation of headline from delta result
 */
export function generateQuickDeltaSummary(
  deltaResult: FinancialDeltaResult,
  currency: string = 'USD'
): string {
  const generator = new SummaryGenerator({ currency });
  return generator.generateFromDeltaResult(deltaResult).headline;
}
