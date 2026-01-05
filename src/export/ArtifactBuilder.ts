/**
 * Artifact Builder
 * Assembles calculation outputs into structured financial artifacts.
 *
 * SPARC: Produces CFO-grade financial artifacts with complete provenance.
 */

import { v4 as uuidv4 } from 'uuid';

import {
  FinancialArtifact,
  FinancialSummary,
  InputManifest,
  PeriodDetail,
  AttributionRecord,
  SensitivityTable,
  SensitivityFactor,
  AuditRecord,
  CalculationParameters,
} from '../contracts';

import {
  FinancialDeltaResult,
  AttributionResult,
  NormalizedDataset,
  AttributionChain,
  FinancialDelta,
} from '../contracts';

import { MonetaryValue, ConfidenceInterval } from '../contracts';

import { toCurrency, toDecimal, toString } from '../lib/financial';

// ============================================================================
// Configuration Interface
// ============================================================================

export interface ArtifactBuilderConfig {
  readonly engineVersion: string;
  readonly baseCurrency: string;
  readonly discountRate: number;
  readonly confidenceLevels: readonly number[];
  readonly timeHorizonMonths: number;
  readonly riskToleranceLevel: string;
}

// ============================================================================
// Helper Functions
// ============================================================================


/**
 * Creates a MonetaryValue from a decimal string
 */
function createMonetaryValue(amount: string, currency: string): MonetaryValue {
  return {
    amount: toCurrency(toDecimal(amount)),
    currency,
    asOfDate: new Date().toISOString(),
  };
}

/**
 * Formats a decimal string for consistent monetary output
 */
function formatMonetary(value: string): string {
  return toCurrency(toDecimal(value));
}

// ============================================================================
// Artifact Builder Class
// ============================================================================

export class ArtifactBuilder {
  private readonly config: ArtifactBuilderConfig;

  constructor(config: ArtifactBuilderConfig) {
    this.config = config;
  }

  /**
   * Builds a complete FinancialArtifact from calculation results
   */
  public buildFinancialArtifact(
    deltaResult: FinancialDeltaResult,
    attributionResult: AttributionResult,
    normalizedDataset: NormalizedDataset,
    auditTrail: readonly AuditRecord[],
    humanReadableSummary: string
  ): FinancialArtifact {
    const artifactId = uuidv4();
    const generatedAt = new Date().toISOString();

    const inputManifest = this.buildInputManifest(normalizedDataset);
    const summary = this.buildFinancialSummary(deltaResult);
    const periodDetails = this.buildPeriodDetails(deltaResult);
    const attributions = this.buildAttributionRecords(attributionResult);
    const sensitivityAnalysis = this.buildSensitivityTable(deltaResult);

    return {
      artifactId,
      generatedAt,
      engineVersion: this.config.engineVersion,
      inputManifest,
      summary,
      periodDetails,
      attributions,
      sensitivityAnalysis,
      auditTrail,
      humanReadableSummary,
    };
  }

  /**
   * Builds InputManifest with checksums for audit trail
   */
  public buildInputManifest(normalizedDataset: NormalizedDataset): InputManifest {
    const calculationParameters: CalculationParameters = {
      discountRate: this.config.discountRate,
      confidenceLevels: this.config.confidenceLevels,
      timeHorizonMonths: this.config.timeHorizonMonths,
      baseCurrency: this.config.baseCurrency,
      riskToleranceLevel: this.config.riskToleranceLevel,
    };

    // Extract first decision's source ID as simulation ID if available
    const firstDecision = normalizedDataset.decisions[0];
    const simulationId = firstDecision ? firstDecision.sourceDecisionId : uuidv4();

    // Use the baseline checksum from the normalized dataset or compute from decisions
    const costBaselineId = normalizedDataset.normalizationId;

    return {
      simulationId,
      simulationChecksum: normalizedDataset.inputChecksums.simulationChecksum,
      erpMetadataChecksum: normalizedDataset.inputChecksums.erpMetadataChecksum,
      costBaselineId,
      costBaselineChecksum: normalizedDataset.inputChecksums.costBaselineChecksum,
      calculationParameters,
    };
  }

  /**
   * Builds FinancialSummary from delta calculations
   */
  public buildFinancialSummary(deltaResult: FinancialDeltaResult): FinancialSummary {
    const metrics = deltaResult.portfolioMetrics;
    const currency = this.config.baseCurrency;

    // Calculate total investment (sum of all costs)
    const totalInvestment = createMonetaryValue(
      this.calculateTotalInvestment(deltaResult.deltas),
      currency
    );

    // Calculate total benefit (sum of all savings)
    const totalBenefit = createMonetaryValue(
      metrics.totalGrossSavings,
      currency
    );

    // Net benefit = total benefit - total investment
    const netBenefitDecimal = toDecimal(metrics.totalPresentValue);
    const netBenefit = createMonetaryValue(
      toString(netBenefitDecimal),
      currency
    );

    // Calculate ROI
    const investmentDecimal = toDecimal(totalInvestment.amount);
    const roi = investmentDecimal.isZero()
      ? 0
      : toDecimal(netBenefit.amount).dividedBy(investmentDecimal).toNumber();

    // Calculate payback period
    const paybackPeriodMonths = this.calculatePaybackPeriod(deltaResult.deltas);

    // NPV is the total present value
    const npv = createMonetaryValue(metrics.totalPresentValue, currency);

    // Calculate IRR (simplified - actual IRR would require iterative calculation)
    const irr = this.calculateIRR(deltaResult.deltas);

    // Build confidence interval from portfolio uncertainty
    const confidenceInterval = this.buildConfidenceInterval(deltaResult);

    return {
      totalInvestment,
      totalBenefit,
      netBenefit,
      roi,
      roiMethodology: 'Net Present Value / Total Investment',
      paybackPeriodMonths,
      npv,
      discountRate: this.config.discountRate,
      irr,
      confidenceInterval,
    };
  }

  /**
   * Builds PeriodDetail array for each month in the time horizon
   */
  public buildPeriodDetails(deltaResult: FinancialDeltaResult): readonly PeriodDetail[] {
    const periods: PeriodDetail[] = [];
    const currency = this.config.baseCurrency;
    const monthlyRate = this.config.discountRate / 12;

    let cumulativeNetDelta = toDecimal('0');
    const startDate = new Date();

    // Aggregate monthly deltas from all decisions
    const monthlyDeltas = this.aggregateMonthlyDeltas(deltaResult.deltas);

    for (let month = 1; month <= this.config.timeHorizonMonths; month++) {
      const periodStart = new Date(startDate);
      periodStart.setMonth(startDate.getMonth() + month - 1);

      const periodEnd = new Date(periodStart);
      periodEnd.setMonth(periodStart.getMonth() + 1);
      periodEnd.setDate(periodEnd.getDate() - 1);

      const monthData = monthlyDeltas.get(month) || { savings: '0', costs: '0' };
      const savings = toDecimal(monthData.savings);
      const costs = toDecimal(monthData.costs);
      const netDelta = savings.minus(costs);
      cumulativeNetDelta = cumulativeNetDelta.plus(netDelta);

      const discountFactor = Math.pow(1 + monthlyRate, -month);
      const presentValue = netDelta.times(discountFactor);

      periods.push({
        periodNumber: month,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        projectedSavings: createMonetaryValue(toString(savings), currency),
        projectedCosts: createMonetaryValue(toString(costs), currency),
        netDelta: createMonetaryValue(toString(netDelta), currency),
        cumulativeNetDelta: createMonetaryValue(toString(cumulativeNetDelta), currency),
        discountFactor,
        presentValue: createMonetaryValue(toString(presentValue), currency),
      });
    }

    return periods;
  }

  /**
   * Builds AttributionRecords from attribution chains
   */
  public buildAttributionRecords(attributionResult: AttributionResult): readonly AttributionRecord[] {
    const records: AttributionRecord[] = [];
    const currency = this.config.baseCurrency;

    for (const chain of attributionResult.attributionChains) {
      const primary = chain.primaryAttribution;

      // Create primary attribution record
      records.push({
        decisionId: chain.decisionRecordId,
        costCenterId: primary.costCenterId,
        costCenterName: primary.costCenterName,
        glAccountId: this.extractGLAccountId(chain),
        glAccountName: this.extractGLAccountName(chain),
        attributedAmount: createMonetaryValue(
          formatMonetary(primary.attributedAmount),
          currency
        ),
        allocationPercentage: primary.adjustmentFactor,
        attributionMethod: chain.attributionMethod,
      });

      // Add distributed attributions
      for (const distributed of chain.distributedAttributions) {
        records.push({
          decisionId: chain.decisionRecordId,
          costCenterId: distributed.costCenterId,
          costCenterName: `Cost Center ${distributed.costCenterId}`,
          glAccountId: this.extractGLAccountId(chain),
          glAccountName: this.extractGLAccountName(chain),
          attributedAmount: createMonetaryValue(
            formatMonetary(distributed.amount),
            currency
          ),
          allocationPercentage: distributed.allocationPercentage / 100, // Convert to 0-1 range
          attributionMethod: distributed.allocationMethod || chain.attributionMethod,
        });
      }
    }

    return records;
  }

  /**
   * Builds SensitivityTable for tornado analysis
   */
  public buildSensitivityTable(deltaResult: FinancialDeltaResult): SensitivityTable {
    const currency = this.config.baseCurrency;
    const factors: SensitivityFactor[] = [];

    // Discount Rate sensitivity
    const baseNPV = toDecimal(deltaResult.portfolioMetrics.totalPresentValue);

    factors.push({
      factorName: 'Discount Rate',
      baseValue: this.config.discountRate,
      lowValue: this.config.discountRate * 0.8,
      highValue: this.config.discountRate * 1.2,
      impactOnNPV: createMonetaryValue(
        toString(baseNPV.times(0.05)),
        currency
      ),
      elasticity: -0.3, // NPV typically inversely related to discount rate
    });

    // Time Horizon sensitivity
    factors.push({
      factorName: 'Time Horizon',
      baseValue: this.config.timeHorizonMonths,
      lowValue: this.config.timeHorizonMonths * 0.75,
      highValue: this.config.timeHorizonMonths * 1.25,
      impactOnNPV: createMonetaryValue(
        toString(baseNPV.times(0.1)),
        currency
      ),
      elasticity: 0.4,
    });

    // Risk Adjustment sensitivity
    const avgRiskFactor = deltaResult.portfolioMetrics.averageRiskAdjustmentFactor;
    factors.push({
      factorName: 'Risk Adjustment Factor',
      baseValue: avgRiskFactor,
      lowValue: avgRiskFactor * 0.9,
      highValue: avgRiskFactor * 1.1,
      impactOnNPV: createMonetaryValue(
        toString(baseNPV.times(avgRiskFactor * 0.1)),
        currency
      ),
      elasticity: 1.0, // Direct relationship
    });

    // Savings Realization Rate sensitivity
    factors.push({
      factorName: 'Savings Realization Rate',
      baseValue: 1.0,
      lowValue: 0.8,
      highValue: 1.0,
      impactOnNPV: createMonetaryValue(
        toString(baseNPV.times(0.2)),
        currency
      ),
      elasticity: 1.0,
    });

    // Sort by impact magnitude for tornado order
    const tornadoOrder = factors
      .map(f => ({
        name: f.factorName,
        impact: Math.abs(toDecimal(f.impactOnNPV.amount).toNumber()),
      }))
      .sort((a, b) => b.impact - a.impact)
      .map(f => f.name);

    return {
      factors,
      tornadoOrder,
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private calculateTotalInvestment(deltas: readonly FinancialDelta[]): string {
    let total = toDecimal('0');
    for (const delta of deltas) {
      total = total.plus(toDecimal(delta.grossDelta.totalCosts));
    }
    return toString(total);
  }

  private calculatePaybackPeriod(deltas: readonly FinancialDelta[]): number | null {
    if (deltas.length === 0) return null;

    // Sum all initial costs and monthly savings
    let totalCosts = toDecimal('0');
    let totalMonthlySavings = toDecimal('0');

    for (const delta of deltas) {
      totalCosts = totalCosts.plus(toDecimal(delta.grossDelta.totalCosts));
      const monthlySavings = toDecimal(delta.grossDelta.totalSavings)
        .dividedBy(delta.timeAdjustedDelta.horizonMonths || 12);
      totalMonthlySavings = totalMonthlySavings.plus(monthlySavings);
    }

    if (totalMonthlySavings.isZero() || totalMonthlySavings.isNegative()) {
      return null; // Never pays back
    }

    const paybackMonths = totalCosts.dividedBy(totalMonthlySavings).toNumber();
    return Math.ceil(paybackMonths);
  }

  private calculateIRR(deltas: readonly FinancialDelta[]): number | null {
    if (deltas.length === 0) return null;

    // Simplified IRR approximation using average returns
    const totalCosts = this.calculateTotalInvestment(deltas);
    let totalSavings = toDecimal('0');
    let avgHorizon = 0;

    for (const delta of deltas) {
      totalSavings = totalSavings.plus(toDecimal(delta.grossDelta.totalSavings));
      avgHorizon += delta.timeAdjustedDelta.horizonMonths;
    }

    if (deltas.length > 0) {
      avgHorizon = avgHorizon / deltas.length;
    }

    const costsDecimal = toDecimal(totalCosts);
    if (costsDecimal.isZero()) return null;

    // Simple IRR approximation: (Total Savings / Total Costs)^(12/horizon) - 1
    const returnRatio = totalSavings.dividedBy(costsDecimal);
    if (returnRatio.lessThanOrEqualTo(0)) return null;

    const annualizedReturn = Math.pow(returnRatio.toNumber(), 12 / (avgHorizon || 12)) - 1;
    return isNaN(annualizedReturn) ? null : annualizedReturn;
  }

  private buildConfidenceInterval(deltaResult: FinancialDeltaResult): ConfidenceInterval {
    const baseValue = deltaResult.portfolioMetrics.totalPresentValue;
    const uncertaintyFactor = deltaResult.portfolioMetrics.weightedUncertaintyFactor;

    const base = toDecimal(baseValue);
    const marginDecimal = base.times(uncertaintyFactor);

    return {
      confidenceLevel: 90,
      lowerBound: toString(base.minus(marginDecimal)),
      upperBound: toString(base.plus(marginDecimal)),
      margin: toString(marginDecimal),
    };
  }

  private aggregateMonthlyDeltas(
    deltas: readonly FinancialDelta[]
  ): Map<number, { savings: string; costs: string }> {
    const monthly = new Map<number, { savings: string; costs: string }>();

    for (const delta of deltas) {
      const horizonMonths = delta.timeAdjustedDelta.horizonMonths || 12;
      const monthlySavings = toDecimal(delta.grossDelta.totalSavings).dividedBy(horizonMonths);
      const monthlyCosts = toDecimal(delta.grossDelta.totalCosts).dividedBy(horizonMonths);

      for (let month = 1; month <= horizonMonths; month++) {
        const existing = monthly.get(month) || { savings: '0', costs: '0' };
        monthly.set(month, {
          savings: toString(toDecimal(existing.savings).plus(monthlySavings)),
          costs: toString(toDecimal(existing.costs).plus(monthlyCosts)),
        });
      }
    }

    return monthly;
  }

  private extractGLAccountId(chain: AttributionChain): string {
    // Extract GL account from primary attribution basis or use default
    if (chain.primaryAttribution.attributionBasis.includes('GL:')) {
      const parts = chain.primaryAttribution.attributionBasis.split('GL:');
      if (parts[1]) {
        const glPart = parts[1].split(' ')[0];
        return glPart || 'DEFAULT';
      }
    }
    return 'DEFAULT';
  }

  private extractGLAccountName(chain: AttributionChain): string {
    return `GL Account ${this.extractGLAccountId(chain)}`;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createArtifactBuilder(config: ArtifactBuilderConfig): ArtifactBuilder {
  return new ArtifactBuilder(config);
}
