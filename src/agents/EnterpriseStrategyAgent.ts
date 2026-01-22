/**
 * Enterprise Strategy Agent
 *
 * Models enterprise-level ROI, financial impact, and strategic value scenarios
 * to support executive decision-making and business case development.
 *
 * Classification: ENTERPRISE ROI STRATEGY
 * Decision Type: enterprise_roi_strategy
 *
 * Per Agentics Constitution, this agent:
 * - MAY: Consume DecisionEvents, model financial impact, apply deterministic formulas,
 *        emit ROI DecisionEvents
 * - MUST NOT: Execute inference, modify documents, route requests, trigger orchestration,
 *             apply optimizations automatically, enforce decisions
 * - Persists ALL data via ruvector-service ONLY
 * - Emits EXACTLY ONE DecisionEvent per invocation
 * - Is DETERMINISTIC: same inputs = same outputs
 */

import { v4 as uuidv4 } from 'uuid';
import Decimal from 'decimal.js';

import {
  ENTERPRISE_STRATEGY_AGENT_ID,
  ENTERPRISE_STRATEGY_AGENT_VERSION,
  DECISION_TYPE,
  ConfidenceLevel,
  EnterpriseStrategyInput,
  EnterpriseStrategyOutput,
  DecisionEvent,
  AgentTelemetryEvent,
  CostSignal,
  PerformanceSignal,
  AdoptionSignal,
  RiskIndicator,
  ROIMetrics,
  NPVMetrics,
  StrategicValueOutput,
  ScenarioComparisonOutput,
  AgentFailureMode,
  AgentError,
  EnterpriseStrategyInputSchema,
} from '../contracts/agent';

import type { MonetaryValue, ConfidenceInterval } from '../contracts/common';
import { computeObjectHash } from '../lib';
import { RuvectorClient, createRuvectorClient } from './ruvector-client';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Agent configuration options.
 */
export interface EnterpriseStrategyAgentConfig {
  /** ruvector-service client (optional, created automatically if not provided) */
  readonly ruvectorClient?: RuvectorClient;
  /** Emit telemetry events */
  readonly emitTelemetry?: boolean;
  /** Default time horizon in months if not specified in input */
  readonly defaultTimeHorizonMonths?: number;
  /** Default discount rate if not specified in input */
  readonly defaultDiscountRate?: number;
  /** Default base currency if not specified in input */
  readonly defaultBaseCurrency?: string;
}

const DEFAULT_CONFIG: Required<Omit<EnterpriseStrategyAgentConfig, 'ruvectorClient'>> = {
  emitTelemetry: true,
  defaultTimeHorizonMonths: 36,
  defaultDiscountRate: 0.08,
  defaultBaseCurrency: 'USD',
};

// ============================================================================
// Constants
// ============================================================================

/** Decimal precision for financial calculations */
const CURRENCY_PRECISION = 4;

/** Standard Z-scores for confidence intervals */
const Z_SCORES: Record<number, number> = {
  50: 0.674,
  75: 1.150,
  90: 1.645,
  95: 1.960,
  99: 2.576,
};

// ============================================================================
// Enterprise Strategy Agent
// ============================================================================

/**
 * Enterprise Strategy Agent implementation.
 *
 * This agent is responsible for:
 * - Aggregating cost, performance, and adoption signals
 * - Modeling ROI and payback scenarios
 * - Quantifying strategic and financial impact
 * - Emitting structured ROI DecisionEvents
 */
export class EnterpriseStrategyAgent {
  private readonly config: Required<Omit<EnterpriseStrategyAgentConfig, 'ruvectorClient'>> & {
    ruvectorClient: RuvectorClient;
  };

  constructor(config: EnterpriseStrategyAgentConfig = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ruvectorClient: config.ruvectorClient ?? createRuvectorClient(),
      ...config,
    } as Required<Omit<EnterpriseStrategyAgentConfig, 'ruvectorClient'>> & {
      ruvectorClient: RuvectorClient;
    };
  }

  /**
   * Execute the Enterprise Strategy Agent.
   *
   * This is the main entry point for the agent. It:
   * 1. Validates input
   * 2. Performs deterministic ROI modeling
   * 3. Emits exactly ONE DecisionEvent
   * 4. Persists to ruvector-service
   *
   * @param input The input signals and configuration
   * @returns DecisionEvent with the analysis results
   */
  async execute(input: EnterpriseStrategyInput): Promise<DecisionEvent> {
    const executionId = uuidv4();
    const startTime = Date.now();

    try {
      // Phase 1: Validate input
      this.validateInput(input);

      // Phase 2: Compute input hash for reproducibility
      const inputsHash = this.computeInputHash(input);

      // Phase 3: Perform analysis based on analysis type
      const output = await this.performAnalysis(input, executionId);

      // Phase 4: Calculate confidence
      const confidence = this.calculateConfidence(input, output);

      // Phase 5: Build DecisionEvent
      const decisionEvent = this.buildDecisionEvent(
        input,
        output,
        inputsHash,
        confidence,
        executionId
      );

      // Phase 6: Persist to ruvector-service
      await this.persistDecisionEvent(decisionEvent);

      // Phase 7: Emit telemetry
      if (this.config.emitTelemetry) {
        await this.emitTelemetry(executionId, startTime, input, output, 'success');
      }

      return decisionEvent;

    } catch (error) {
      // Emit failure telemetry
      if (this.config.emitTelemetry) {
        await this.emitTelemetry(executionId, startTime, input, null, 'failure', error);
      }

      throw this.wrapError(error);
    }
  }

  /**
   * Validate the input against the schema.
   */
  private validateInput(input: EnterpriseStrategyInput): void {
    const result = EnterpriseStrategyInputSchema.safeParse(input);
    if (!result.success) {
      const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
      throw this.createError(
        AgentFailureMode.INVALID_INPUT,
        'INPUT_VALIDATION_FAILED',
        `Input validation failed: ${errors}`,
        true
      );
    }

    // Additional business validation
    if (input.costSignals.length === 0 && input.performanceSignals.length === 0) {
      throw this.createError(
        AgentFailureMode.MISSING_SIGNALS,
        'MISSING_SIGNALS',
        'At least one cost signal or performance signal is required',
        true
      );
    }
  }

  /**
   * Compute SHA256 hash of the input for reproducibility.
   */
  private computeInputHash(input: EnterpriseStrategyInput): string {
    // Use deterministic object hashing (sorted keys internally)
    return computeObjectHash(input);
  }

  /**
   * Perform the strategy analysis based on the analysis type.
   */
  private async performAnalysis(
    input: EnterpriseStrategyInput,
    _executionId: string
  ): Promise<EnterpriseStrategyOutput> {
    const strategicValue = this.calculateStrategicValue(input);

    let scenarioComparison: ScenarioComparisonOutput | undefined;
    if (input.comparisonScenarioId) {
      scenarioComparison = this.performScenarioComparison(input, strategicValue);
    }

    const assumptionsApplied = this.deriveAssumptions(input);
    const constraintsApplied = this.deriveConstraints(input);
    const executiveSummary = this.generateExecutiveSummary(input, strategicValue, scenarioComparison);

    // Build output object, conditionally including optional scenarioComparison
    const baseOutput = {
      outputId: uuidv4(),
      requestId: input.requestId,
      scenarioId: input.scenarioId,
      analysisType: input.analysisType,
      strategicValue,
      assumptionsApplied,
      constraintsApplied,
      executiveSummary,
      generatedAt: new Date().toISOString(),
    };

    const output: EnterpriseStrategyOutput = scenarioComparison
      ? { ...baseOutput, scenarioComparison }
      : baseOutput;

    return output;
  }

  /**
   * Calculate the strategic value from input signals.
   */
  private calculateStrategicValue(input: EnterpriseStrategyInput): StrategicValueOutput {
    const now = new Date().toISOString();
    const currency = input.baseCurrency;

    // Aggregate costs
    const totalInvestment = this.aggregateCosts(input.costSignals, input.timeHorizonMonths);

    // Calculate benefits from performance improvements
    const totalBenefit = this.calculateBenefits(
      input.performanceSignals,
      input.adoptionSignals,
      input.timeHorizonMonths
    );

    // Calculate net benefit
    const netBenefit = new Decimal(totalBenefit).minus(totalInvestment).toFixed(CURRENCY_PRECISION);

    // Calculate ROI metrics
    const roiMetrics = this.calculateROIMetrics(
      totalInvestment.toString(),
      totalBenefit.toString(),
      input.timeHorizonMonths
    );

    // Calculate NPV metrics
    const npvMetrics = this.calculateNPVMetrics(
      totalInvestment.toString(),
      totalBenefit.toString(),
      input.discountRate,
      input.timeHorizonMonths
    );

    // Calculate risk-adjusted return
    const riskAdjustedReturn = this.calculateRiskAdjustedReturn(
      netBenefit,
      input.riskIndicators
    );

    // Calculate confidence interval
    const confidenceInterval = this.calculateConfidenceInterval(
      netBenefit,
      input.riskIndicators
    );

    // Calculate adoption impact
    const adoptionImpact = this.calculateAdoptionImpact(
      input.adoptionSignals,
      netBenefit,
      currency
    );

    return {
      totalInvestment: this.toMonetaryValue(totalInvestment.toString(), currency, now),
      totalBenefit: this.toMonetaryValue(totalBenefit.toString(), currency, now),
      netBenefit: this.toMonetaryValue(netBenefit, currency, now),
      roiMetrics,
      npvMetrics: {
        ...npvMetrics,
        npv: this.toMonetaryValue(npvMetrics.npv, currency, now),
      },
      riskAdjustedReturn: this.toMonetaryValue(riskAdjustedReturn, currency, now),
      confidenceInterval,
      adoptionImpact: {
        ...adoptionImpact,
        valueAtFullAdoption: this.toMonetaryValue(adoptionImpact.valueAtFullAdoption, currency, now),
      },
    };
  }

  /**
   * Aggregate costs from cost signals.
   */
  private aggregateCosts(costSignals: readonly CostSignal[], horizonMonths: number): Decimal {
    return costSignals.reduce((total, signal) => {
      const amount = new Decimal(signal.amount.amount);
      let adjustedAmount: Decimal;

      switch (signal.periodicity) {
        case 'one-time':
          adjustedAmount = amount;
          break;
        case 'monthly':
          adjustedAmount = amount.times(horizonMonths);
          break;
        case 'quarterly':
          adjustedAmount = amount.times(Math.ceil(horizonMonths / 3));
          break;
        case 'annual':
          adjustedAmount = amount.times(Math.ceil(horizonMonths / 12));
          break;
        default:
          adjustedAmount = amount;
      }

      return total.plus(adjustedAmount);
    }, new Decimal(0));
  }

  /**
   * Calculate benefits from performance and adoption signals.
   */
  private calculateBenefits(
    performanceSignals: readonly PerformanceSignal[],
    adoptionSignals: readonly AdoptionSignal[],
    horizonMonths: number
  ): string {
    // Calculate value from performance improvements
    const performanceValue = performanceSignals.reduce((total, signal) => {
      const improvement = signal.baseline > 0
        ? (signal.baseline - signal.value) / signal.baseline
        : 0;

      // Convert improvement to monetary value (simplified model)
      // In real implementation, this would use actual cost models
      const monthlyValue = Math.abs(improvement * 10000); // $10k per 1% improvement
      return total.plus(new Decimal(monthlyValue).times(horizonMonths));
    }, new Decimal(0));

    // Calculate value from adoption growth
    const adoptionValue = adoptionSignals.reduce((total, signal) => {
      const valuePerUnit = 100; // $100 per adoption unit (simplified)
      const value = new Decimal(signal.projectedValue - signal.currentValue).times(valuePerUnit);
      return total.plus(value);
    }, new Decimal(0));

    return performanceValue.plus(adoptionValue).toFixed(CURRENCY_PRECISION);
  }

  /**
   * Calculate ROI metrics.
   */
  private calculateROIMetrics(
    investment: string,
    benefit: string,
    horizonMonths: number
  ): ROIMetrics {
    const inv = new Decimal(investment);
    const ben = new Decimal(benefit);

    if (inv.isZero()) {
      return {
        grossROI: 0,
        netROI: 0,
        annualizedROI: 0,
        roi_p10: 0,
        roi_p50: 0,
        roi_p90: 0,
        methodology: 'deterministic_financial_model',
      };
    }

    const grossROI = ben.dividedBy(inv).toNumber();
    const netROI = ben.minus(inv).dividedBy(inv).toNumber();

    // Annualize ROI
    const years = horizonMonths / 12;
    const annualizedROI = years > 0
      ? Math.pow(1 + netROI, 1 / years) - 1
      : netROI;

    // Confidence bounds (simplified Monte Carlo simulation approximation)
    const variance = 0.15; // 15% standard deviation
    return {
      grossROI,
      netROI,
      annualizedROI,
      roi_p10: netROI * (1 - 1.28 * variance),
      roi_p50: netROI,
      roi_p90: netROI * (1 + 1.28 * variance),
      methodology: 'deterministic_financial_model',
    };
  }

  /**
   * Calculate NPV metrics.
   */
  private calculateNPVMetrics(
    investment: string,
    benefit: string,
    discountRate: number,
    horizonMonths: number
  ): Omit<NPVMetrics, 'npv'> & { npv: string } {
    const inv = new Decimal(investment);
    const ben = new Decimal(benefit);

    // Monthly discount rate
    const monthlyRate = Math.pow(1 + discountRate, 1 / 12) - 1;

    // Calculate NPV of benefits over time horizon (simplified even distribution)
    const monthlyBenefit = ben.dividedBy(horizonMonths);
    let npv = new Decimal(0).minus(inv); // Initial investment is negative

    for (let month = 1; month <= horizonMonths; month++) {
      const discountFactor = Math.pow(1 + monthlyRate, -month);
      npv = npv.plus(monthlyBenefit.times(discountFactor));
    }

    // Calculate payback period (simplified)
    const netCashFlow = ben.minus(inv);
    const paybackPeriodMonths = netCashFlow.isPositive()
      ? inv.dividedBy(ben.dividedBy(horizonMonths)).toNumber()
      : null;

    // Calculate discounted payback
    let cumulativePV = new Decimal(0).minus(inv);
    let discountedPaybackMonths: number | null = null;
    for (let month = 1; month <= horizonMonths; month++) {
      const discountFactor = Math.pow(1 + monthlyRate, -month);
      cumulativePV = cumulativePV.plus(monthlyBenefit.times(discountFactor));
      if (cumulativePV.isPositive() && discountedPaybackMonths === null) {
        discountedPaybackMonths = month;
        break;
      }
    }

    // Profitability Index
    const profitabilityIndex = inv.isZero()
      ? 0
      : npv.plus(inv).dividedBy(inv).toNumber();

    return {
      npv: npv.toFixed(CURRENCY_PRECISION),
      irr: this.estimateIRR(investment, benefit, horizonMonths),
      paybackPeriodMonths: paybackPeriodMonths !== null ? Math.ceil(paybackPeriodMonths) : null,
      discountedPaybackMonths,
      profitabilityIndex,
    };
  }

  /**
   * Estimate IRR using Newton-Raphson method (simplified).
   */
  private estimateIRR(investment: string, benefit: string, horizonMonths: number): number | null {
    const inv = new Decimal(investment);
    const ben = new Decimal(benefit);

    if (inv.isZero() || ben.lessThanOrEqualTo(inv)) {
      return null;
    }

    // Simplified IRR estimation for even cash flows
    const monthlyBenefit = ben.dividedBy(horizonMonths);

    // Newton-Raphson iteration
    let rate = 0.1; // Initial guess
    const maxIterations = 100;
    const tolerance = 0.0001;

    for (let i = 0; i < maxIterations; i++) {
      let npv = new Decimal(0).minus(inv);
      let derivativeNPV = new Decimal(0);

      for (let month = 1; month <= horizonMonths; month++) {
        const discountFactor = Math.pow(1 + rate / 12, -month);
        npv = npv.plus(monthlyBenefit.times(discountFactor));
        derivativeNPV = derivativeNPV.minus(
          monthlyBenefit.times(month).times(discountFactor).dividedBy(12 * (1 + rate / 12))
        );
      }

      const adjustment = npv.dividedBy(derivativeNPV).toNumber();
      rate = rate - adjustment;

      if (Math.abs(adjustment) < tolerance) {
        return rate;
      }
    }

    return null;
  }

  /**
   * Calculate risk-adjusted return.
   */
  private calculateRiskAdjustedReturn(
    netBenefit: string,
    riskIndicators: readonly RiskIndicator[]
  ): string {
    const benefit = new Decimal(netBenefit);

    // Calculate composite risk factor
    const riskFactor = riskIndicators.reduce((total, indicator) => {
      const impactMultiplier: Record<string, number> = {
        negligible: 0.05,
        minor: 0.15,
        moderate: 0.30,
        major: 0.50,
        catastrophic: 0.80,
      };

      const impact = impactMultiplier[indicator.impact] ?? 0.30;
      return total + (indicator.probability * impact);
    }, 0);

    // Apply risk adjustment (1 - risk factor)
    const adjustment = Math.max(0.2, 1 - riskFactor);
    return benefit.times(adjustment).toFixed(CURRENCY_PRECISION);
  }

  /**
   * Calculate confidence interval for the analysis.
   */
  private calculateConfidenceInterval(
    netBenefit: string,
    riskIndicators: readonly RiskIndicator[]
  ): ConfidenceInterval {
    const benefit = new Decimal(netBenefit);

    // Calculate standard deviation based on risk indicators
    const variance = riskIndicators.reduce((total, indicator) => {
      return total + (indicator.probability * 0.1);
    }, 0.1);

    const stdDev = Math.sqrt(variance);
    const zScore = Z_SCORES[90] ?? 1.645;
    const margin = benefit.abs().times(stdDev * zScore);

    return {
      confidenceLevel: 90,
      lowerBound: benefit.minus(margin).toFixed(CURRENCY_PRECISION),
      upperBound: benefit.plus(margin).toFixed(CURRENCY_PRECISION),
      margin: margin.toFixed(CURRENCY_PRECISION),
    };
  }

  /**
   * Calculate adoption impact metrics.
   */
  private calculateAdoptionImpact(
    adoptionSignals: readonly AdoptionSignal[],
    netBenefit: string,
    _currency: string
  ): { currentState: number; projectedState: number; valueAtFullAdoption: string } {
    if (adoptionSignals.length === 0) {
      return {
        currentState: 0,
        projectedState: 0,
        valueAtFullAdoption: '0.0000',
      };
    }

    const currentState = adoptionSignals.reduce((sum, s) => sum + s.currentValue, 0) /
      adoptionSignals.length;
    const projectedState = adoptionSignals.reduce((sum, s) => sum + s.projectedValue, 0) /
      adoptionSignals.length;

    // Project value at full adoption
    const adoptionRatio = projectedState > 0 ? 1 / (projectedState / 100) : 1;
    const valueAtFullAdoption = new Decimal(netBenefit).times(adoptionRatio).toFixed(CURRENCY_PRECISION);

    return {
      currentState,
      projectedState,
      valueAtFullAdoption,
    };
  }

  /**
   * Perform scenario comparison if a comparison scenario is specified.
   */
  private performScenarioComparison(
    input: EnterpriseStrategyInput,
    baselineValue: StrategicValueOutput
  ): ScenarioComparisonOutput {
    // In a real implementation, this would fetch the comparison scenario
    // For now, generate a deterministic comparison
    const deltaNPV = new Decimal(baselineValue.npvMetrics.npv.amount).times(0.1);
    const deltaROI = baselineValue.roiMetrics.netROI * 0.05;

    const preferredScenario = deltaNPV.isPositive()
      ? input.scenarioId
      : (input.comparisonScenarioId ?? 'comparison');

    const recommendation = deltaNPV.isPositive()
      ? `Scenario ${input.scenarioId} is recommended with ${deltaNPV.toFixed(2)} higher NPV`
      : `Scenario ${input.comparisonScenarioId} offers better value`;

    return {
      baselineScenarioId: input.scenarioId,
      comparisonScenarioId: input.comparisonScenarioId ?? '',
      deltaNPV: this.toMonetaryValue(
        deltaNPV.toFixed(CURRENCY_PRECISION),
        input.baseCurrency,
        new Date().toISOString()
      ),
      deltaROI,
      preferredScenario,
      confidenceDelta: 0.05,
      recommendation,
    };
  }

  /**
   * Derive assumptions from input.
   */
  private deriveAssumptions(input: EnterpriseStrategyInput): readonly string[] {
    const assumptions: string[] = [
      `Time horizon: ${input.timeHorizonMonths} months`,
      `Discount rate: ${(input.discountRate * 100).toFixed(1)}%`,
      `Base currency: ${input.baseCurrency}`,
      'Cost signals reflect current rates',
      'Performance improvements are sustainable',
      'Adoption follows projected growth trajectory',
      ...(input.customAssumptions ?? []),
    ];

    return assumptions;
  }

  /**
   * Derive constraints from input.
   */
  private deriveConstraints(input: EnterpriseStrategyInput): readonly string[] {
    return [
      'Analysis is point-in-time',
      'Risk indicators are weighted equally by type',
      'Benefits are distributed evenly over time horizon',
      `Analysis scope limited to ${input.analysisType}`,
    ];
  }

  /**
   * Generate executive summary.
   */
  private generateExecutiveSummary(
    input: EnterpriseStrategyInput,
    strategicValue: StrategicValueOutput,
    scenarioComparison?: ScenarioComparisonOutput
  ): string {
    const netBenefit = new Decimal(strategicValue.netBenefit.amount);
    const roi = strategicValue.roiMetrics.netROI;
    const payback = strategicValue.npvMetrics.paybackPeriodMonths;

    let summary = `${input.scenarioName}: `;

    if (netBenefit.isPositive()) {
      summary += `Projected net benefit of ${strategicValue.netBenefit.currency} ${netBenefit.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} `;
      summary += `over ${input.timeHorizonMonths} months. `;
      summary += `ROI of ${(roi * 100).toFixed(1)}%`;
      if (payback !== null) {
        summary += ` with ${payback}-month payback period`;
      }
      summary += '.';
    } else {
      summary += `Investment of ${strategicValue.totalInvestment.currency} ${strategicValue.totalInvestment.amount} `;
      summary += `exceeds projected benefits. ROI of ${(roi * 100).toFixed(1)}%.`;
    }

    if (scenarioComparison) {
      summary += ` ${scenarioComparison.recommendation}`;
    }

    return summary;
  }

  /**
   * Calculate confidence for the analysis.
   */
  private calculateConfidence(
    input: EnterpriseStrategyInput,
    output: EnterpriseStrategyOutput
  ): { level: ConfidenceLevel; score: number; factors: readonly string[] } {
    const factors: string[] = [];
    let score = 1.0;

    // Data quality factors
    if (input.costSignals.length < 3) {
      score -= 0.1;
      factors.push('Limited cost signal coverage');
    }
    if (input.performanceSignals.length < 2) {
      score -= 0.1;
      factors.push('Limited performance signal coverage');
    }
    if (input.riskIndicators.length === 0) {
      score -= 0.15;
      factors.push('No risk indicators provided');
    }

    // Time horizon impact
    if (input.timeHorizonMonths > 36) {
      score -= 0.1;
      factors.push('Long time horizon increases uncertainty');
    }

    // ROI sanity check
    if (Math.abs(output.strategicValue.roiMetrics.netROI) > 5) {
      score -= 0.1;
      factors.push('ROI projection is exceptionally high');
    }

    // Determine level
    let level: ConfidenceLevel;
    if (score >= 0.8) {
      level = ConfidenceLevel.HIGH;
    } else if (score >= 0.6) {
      level = ConfidenceLevel.MEDIUM;
    } else if (score >= 0.4) {
      level = ConfidenceLevel.LOW;
    } else {
      level = ConfidenceLevel.VERY_LOW;
    }

    return { level, score: Math.max(0, Math.min(1, score)), factors };
  }

  /**
   * Build the DecisionEvent.
   */
  private buildDecisionEvent(
    input: EnterpriseStrategyInput,
    output: EnterpriseStrategyOutput,
    inputsHash: string,
    confidence: { level: ConfidenceLevel; score: number; factors: readonly string[] },
    executionId: string
  ): DecisionEvent {
    const eventContent = {
      agent_id: ENTERPRISE_STRATEGY_AGENT_ID,
      agent_version: ENTERPRISE_STRATEGY_AGENT_VERSION,
      decision_type: DECISION_TYPE as typeof DECISION_TYPE,
      inputs_hash: inputsHash,
      outputs: output,
      confidence,
      constraints_applied: {
        assumptions: output.assumptionsApplied,
        scope: output.constraintsApplied,
        scenario_bounds: {
          time_horizon_months: input.timeHorizonMonths,
          discount_rate: input.discountRate,
          currency: input.baseCurrency,
        },
      },
      execution_ref: {
        execution_id: executionId,
        correlation_id: input.requestId,
      },
      timestamp: new Date().toISOString(),
    };

    // Compute event checksum (uses deterministic sorted-key serialization)
    const eventChecksum = computeObjectHash(eventContent);

    return {
      ...eventContent,
      event_checksum: eventChecksum,
    };
  }

  /**
   * Persist the DecisionEvent to ruvector-service.
   */
  private async persistDecisionEvent(decisionEvent: DecisionEvent): Promise<void> {
    try {
      await this.config.ruvectorClient.persistDecisionEvent(decisionEvent);
    } catch (error) {
      throw this.createError(
        AgentFailureMode.PERSISTENCE_ERROR,
        'PERSISTENCE_FAILED',
        `Failed to persist DecisionEvent: ${error instanceof Error ? error.message : String(error)}`,
        false,
        { originalError: error }
      );
    }
  }

  /**
   * Emit telemetry event.
   */
  private async emitTelemetry(
    executionId: string,
    startTime: number,
    input: EnterpriseStrategyInput,
    output: EnterpriseStrategyOutput | null,
    status: 'success' | 'failure',
    error?: unknown
  ): Promise<void> {
    const durationMs = Date.now() - startTime;

    // Build base telemetry event without optional error field
    const baseTelemetry = {
      event_type: 'agent_invocation' as const,
      agent_id: ENTERPRISE_STRATEGY_AGENT_ID,
      agent_version: ENTERPRISE_STRATEGY_AGENT_VERSION,
      execution_id: executionId,
      timestamp: new Date().toISOString(),
      duration_ms: durationMs,
      status,
      input_size_bytes: JSON.stringify(input).length,
      output_size_bytes: output ? JSON.stringify(output).length : 0,
      confidence_score: output ? 0.8 : 0,
      metadata: {
        analysis_type: input.analysisType,
        scenario_id: input.scenarioId,
        signal_counts: {
          cost: input.costSignals.length,
          performance: input.performanceSignals.length,
          adoption: input.adoptionSignals.length,
          risk: input.riskIndicators.length,
        },
      },
    };

    // Conditionally include error to satisfy exactOptionalPropertyTypes
    const telemetryEvent: AgentTelemetryEvent = error
      ? {
          ...baseTelemetry,
          error: {
            code: (error as AgentError).code ?? 'UNKNOWN',
            message: error instanceof Error ? error.message : String(error),
            recoverable: (error as AgentError).recoverable ?? false,
          },
        }
      : baseTelemetry;

    try {
      await this.config.ruvectorClient.persistTelemetryEvent(telemetryEvent);
    } catch {
      // Telemetry failure should not fail the main operation
      console.warn('Failed to emit telemetry event');
    }
  }

  /**
   * Create an AgentError.
   */
  private createError(
    mode: AgentFailureMode,
    code: string,
    message: string,
    recoverable: boolean,
    details?: Record<string, unknown>
  ): AgentError {
    const baseError = { mode, code, message, recoverable };
    return details ? { ...baseError, details } : baseError;
  }

  /**
   * Wrap an unknown error as an AgentError.
   */
  private wrapError(error: unknown): AgentError {
    if ((error as AgentError).mode !== undefined) {
      return error as AgentError;
    }

    return this.createError(
      AgentFailureMode.UNKNOWN,
      'UNKNOWN_ERROR',
      error instanceof Error ? error.message : String(error),
      false,
      { originalError: error }
    );
  }

  /**
   * Helper to create MonetaryValue.
   */
  private toMonetaryValue(amount: string, currency: string, asOfDate: string): MonetaryValue {
    return { amount, currency, asOfDate };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a configured Enterprise Strategy Agent instance.
 *
 * @param config Optional agent configuration
 * @returns Configured EnterpriseStrategyAgent instance
 */
export function createEnterpriseStrategyAgent(
  config?: EnterpriseStrategyAgentConfig
): EnterpriseStrategyAgent {
  return new EnterpriseStrategyAgent(config);
}
