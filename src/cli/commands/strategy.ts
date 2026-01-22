/**
 * Strategy CLI Commands
 *
 * Implements the agentics strategy subcommands:
 * - strategy analyze: Perform strategy analysis on input signals
 * - strategy model: Generate ROI model for a scenario
 * - strategy inspect: Inspect details of a previous analysis
 *
 * Per Agentics Constitution:
 * - Commands emit exactly ONE DecisionEvent per invocation
 * - All persistence via ruvector-service
 * - Deterministic: same inputs = same outputs
 */

import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';

import {
  createEnterpriseStrategyAgent,
  createRuvectorClient,
} from '../../agents';

import {
  StrategyDecisionSubtype,
  EnterpriseStrategyInput,
  CostSignal,
  PerformanceSignal,
  AdoptionSignal,
  RiskIndicator,
} from '../../contracts/agent';

import type { MonetaryValue } from '../../contracts/common';

// ============================================================================
// CLI Input Types
// ============================================================================

export interface StrategyAnalyzeInput {
  readonly inputFile: string;
  readonly outputFile?: string;
  readonly format?: 'json' | 'yaml';
}

export interface StrategyModelInput {
  readonly scenarioId: string;
  readonly scenarioName: string;
  readonly timeHorizon?: number;
  readonly discountRate?: number;
  readonly inputFile?: string;
  readonly outputFile?: string;
}

export interface StrategyInspectInput {
  readonly executionId: string;
  readonly includeInputs?: boolean;
  readonly format?: 'json' | 'yaml' | 'summary';
}

// ============================================================================
// CLI Output Types
// ============================================================================

export interface StrategyCommandResult<T = unknown> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: {
    readonly code: string;
    readonly message: string;
    readonly details?: unknown;
  };
  readonly execution_time_ms: number;
}

export interface StrategyAnalyzeOutput extends StrategyCommandResult<{
  readonly execution_id: string;
  readonly scenario_id: string;
  readonly analysis_type: string;
  readonly strategic_value: {
    readonly total_investment: MonetaryValue;
    readonly total_benefit: MonetaryValue;
    readonly net_benefit: MonetaryValue;
    readonly roi: number;
    readonly npv: MonetaryValue;
    readonly payback_months: number | null;
  };
  readonly confidence: {
    readonly level: string;
    readonly score: number;
  };
  readonly executive_summary: string;
  readonly generated_at: string;
}> {}

export interface StrategyModelOutput extends StrategyCommandResult<{
  readonly execution_id: string;
  readonly scenario_id: string;
  readonly scenario_name: string;
  readonly model: {
    readonly roi_metrics: {
      readonly gross_roi: number;
      readonly net_roi: number;
      readonly annualized_roi: number;
      readonly roi_p10: number;
      readonly roi_p50: number;
      readonly roi_p90: number;
    };
    readonly npv_metrics: {
      readonly npv: MonetaryValue;
      readonly irr: number | null;
      readonly payback_period_months: number | null;
      readonly profitability_index: number;
    };
    readonly risk_adjusted_return: MonetaryValue;
  };
  readonly assumptions: readonly string[];
  readonly constraints: readonly string[];
  readonly generated_at: string;
}> {}

export interface StrategyInspectOutput extends StrategyCommandResult<{
  readonly execution_id: string;
  readonly agent_id: string;
  readonly agent_version: string;
  readonly decision_type: string;
  readonly timestamp: string;
  readonly confidence: {
    readonly level: string;
    readonly score: number;
    readonly factors: readonly string[];
  };
  readonly scenario_bounds: {
    readonly time_horizon_months: number;
    readonly discount_rate: number;
    readonly currency: string;
  };
  readonly inputs_hash?: string;
  readonly event_checksum: string;
}> {}

// ============================================================================
// Strategy Analyze Command
// ============================================================================

/**
 * Perform strategy analysis on input signals from a file.
 *
 * @param input CLI input parameters
 * @returns StrategyAnalyzeOutput with DecisionEvent data
 */
export async function strategyAnalyze(input: StrategyAnalyzeInput): Promise<StrategyAnalyzeOutput> {
  const startTime = Date.now();

  try {
    // Validate input file exists
    if (!fs.existsSync(input.inputFile)) {
      return {
        success: false,
        error: {
          code: 'FILE_NOT_FOUND',
          message: `Input file not found: ${input.inputFile}`,
        },
        execution_time_ms: Date.now() - startTime,
      };
    }

    // Read and parse input file
    const fileContent = fs.readFileSync(input.inputFile, 'utf-8');
    let inputData: EnterpriseStrategyInput;

    try {
      if (input.format === 'yaml') {
        // For YAML, we'd need a YAML parser - for now, error out
        return {
          success: false,
          error: {
            code: 'UNSUPPORTED_FORMAT',
            message: 'YAML format is not yet supported. Please use JSON.',
          },
          execution_time_ms: Date.now() - startTime,
        };
      }
      inputData = JSON.parse(fileContent) as EnterpriseStrategyInput;
    } catch (parseError) {
      return {
        success: false,
        error: {
          code: 'INVALID_INPUT_FORMAT',
          message: `Failed to parse input file: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
        },
        execution_time_ms: Date.now() - startTime,
      };
    }

    // Create and execute agent
    const agent = createEnterpriseStrategyAgent();
    const decisionEvent = await agent.execute(inputData);

    // Prepare output
    const result: StrategyAnalyzeOutput = {
      success: true,
      data: {
        execution_id: decisionEvent.execution_ref.execution_id,
        scenario_id: decisionEvent.outputs.scenarioId,
        analysis_type: decisionEvent.outputs.analysisType,
        strategic_value: {
          total_investment: decisionEvent.outputs.strategicValue.totalInvestment,
          total_benefit: decisionEvent.outputs.strategicValue.totalBenefit,
          net_benefit: decisionEvent.outputs.strategicValue.netBenefit,
          roi: decisionEvent.outputs.strategicValue.roiMetrics.netROI,
          npv: decisionEvent.outputs.strategicValue.npvMetrics.npv,
          payback_months: decisionEvent.outputs.strategicValue.npvMetrics.paybackPeriodMonths,
        },
        confidence: {
          level: decisionEvent.confidence.level,
          score: decisionEvent.confidence.score,
        },
        executive_summary: decisionEvent.outputs.executiveSummary,
        generated_at: decisionEvent.timestamp,
      },
      execution_time_ms: Date.now() - startTime,
    };

    // Write output file if specified
    if (input.outputFile) {
      const outputContent = JSON.stringify(decisionEvent, null, 2);
      fs.writeFileSync(input.outputFile, outputContent, 'utf-8');
    }

    return result;

  } catch (error) {
    return {
      success: false,
      error: {
        code: 'ANALYSIS_FAILED',
        message: error instanceof Error ? error.message : String(error),
        details: error,
      },
      execution_time_ms: Date.now() - startTime,
    };
  }
}

// ============================================================================
// Strategy Model Command
// ============================================================================

/**
 * Generate an ROI model for a scenario.
 *
 * @param input CLI input parameters
 * @returns StrategyModelOutput with model data
 */
export async function strategyModel(input: StrategyModelInput): Promise<StrategyModelOutput> {
  const startTime = Date.now();

  try {
    // Build input from parameters or file
    let signals: Partial<EnterpriseStrategyInput> = {};

    if (input.inputFile) {
      if (!fs.existsSync(input.inputFile)) {
        return {
          success: false,
          error: {
            code: 'FILE_NOT_FOUND',
            message: `Input file not found: ${input.inputFile}`,
          },
          execution_time_ms: Date.now() - startTime,
        };
      }

      const fileContent = fs.readFileSync(input.inputFile, 'utf-8');
      signals = JSON.parse(fileContent);
    }

    const now = new Date().toISOString();
    const baseCurrency = 'USD';

    // Build complete input with defaults
    const strategyInput: EnterpriseStrategyInput = {
      requestId: uuidv4(),
      analysisType: StrategyDecisionSubtype.ROI_MODEL,
      scenarioId: input.scenarioId,
      scenarioName: input.scenarioName,
      costSignals: signals.costSignals ?? generateSampleCostSignals(baseCurrency, now),
      performanceSignals: signals.performanceSignals ?? generateSamplePerformanceSignals(now),
      adoptionSignals: signals.adoptionSignals ?? generateSampleAdoptionSignals(now),
      riskIndicators: signals.riskIndicators ?? generateSampleRiskIndicators(baseCurrency, now),
      timeHorizonMonths: input.timeHorizon ?? 36,
      discountRate: input.discountRate ?? 0.08,
      baseCurrency,
    };

    // Create and execute agent
    const agent = createEnterpriseStrategyAgent();
    const decisionEvent = await agent.execute(strategyInput);

    // Prepare output
    const result: StrategyModelOutput = {
      success: true,
      data: {
        execution_id: decisionEvent.execution_ref.execution_id,
        scenario_id: decisionEvent.outputs.scenarioId,
        scenario_name: input.scenarioName,
        model: {
          roi_metrics: {
            gross_roi: decisionEvent.outputs.strategicValue.roiMetrics.grossROI,
            net_roi: decisionEvent.outputs.strategicValue.roiMetrics.netROI,
            annualized_roi: decisionEvent.outputs.strategicValue.roiMetrics.annualizedROI,
            roi_p10: decisionEvent.outputs.strategicValue.roiMetrics.roi_p10,
            roi_p50: decisionEvent.outputs.strategicValue.roiMetrics.roi_p50,
            roi_p90: decisionEvent.outputs.strategicValue.roiMetrics.roi_p90,
          },
          npv_metrics: {
            npv: decisionEvent.outputs.strategicValue.npvMetrics.npv,
            irr: decisionEvent.outputs.strategicValue.npvMetrics.irr,
            payback_period_months: decisionEvent.outputs.strategicValue.npvMetrics.paybackPeriodMonths,
            profitability_index: decisionEvent.outputs.strategicValue.npvMetrics.profitabilityIndex,
          },
          risk_adjusted_return: decisionEvent.outputs.strategicValue.riskAdjustedReturn,
        },
        assumptions: [...decisionEvent.outputs.assumptionsApplied],
        constraints: [...decisionEvent.outputs.constraintsApplied],
        generated_at: decisionEvent.timestamp,
      },
      execution_time_ms: Date.now() - startTime,
    };

    // Write output file if specified
    if (input.outputFile) {
      const outputContent = JSON.stringify(decisionEvent, null, 2);
      fs.writeFileSync(input.outputFile, outputContent, 'utf-8');
    }

    return result;

  } catch (error) {
    return {
      success: false,
      error: {
        code: 'MODEL_GENERATION_FAILED',
        message: error instanceof Error ? error.message : String(error),
        details: error,
      },
      execution_time_ms: Date.now() - startTime,
    };
  }
}

// ============================================================================
// Strategy Inspect Command
// ============================================================================

/**
 * Inspect details of a previous strategy analysis.
 *
 * @param input CLI input parameters
 * @returns StrategyInspectOutput with execution details
 */
export async function strategyInspect(input: StrategyInspectInput): Promise<StrategyInspectOutput> {
  const startTime = Date.now();

  try {
    // Retrieve from ruvector-service
    const ruvectorClient = createRuvectorClient();
    const response = await ruvectorClient.retrieveDecisionEvent(input.executionId);

    if (!response.success || !response.data) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Execution ${input.executionId} not found`,
        },
        execution_time_ms: Date.now() - startTime,
      };
    }

    const decisionEvent = response.data;

    // Build base data object without optional inputs_hash
    const baseData = {
      execution_id: decisionEvent.execution_ref.execution_id,
      agent_id: decisionEvent.agent_id,
      agent_version: decisionEvent.agent_version,
      decision_type: decisionEvent.decision_type,
      timestamp: decisionEvent.timestamp,
      confidence: {
        level: decisionEvent.confidence.level,
        score: decisionEvent.confidence.score,
        factors: [...decisionEvent.confidence.factors],
      },
      scenario_bounds: {
        time_horizon_months: decisionEvent.constraints_applied.scenario_bounds.time_horizon_months,
        discount_rate: decisionEvent.constraints_applied.scenario_bounds.discount_rate,
        currency: decisionEvent.constraints_applied.scenario_bounds.currency,
      },
      event_checksum: decisionEvent.event_checksum,
    };

    // Conditionally include inputs_hash to satisfy exactOptionalPropertyTypes
    const data = input.includeInputs
      ? { ...baseData, inputs_hash: decisionEvent.inputs_hash }
      : baseData;

    // Build result based on format
    const result: StrategyInspectOutput = {
      success: true,
      data,
      execution_time_ms: Date.now() - startTime,
    };

    return result;

  } catch (error) {
    return {
      success: false,
      error: {
        code: 'INSPECT_FAILED',
        message: error instanceof Error ? error.message : String(error),
        details: error,
      },
      execution_time_ms: Date.now() - startTime,
    };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate sample cost signals for demonstration/testing.
 */
function generateSampleCostSignals(currency: string, timestamp: string): CostSignal[] {
  return [
    {
      signalId: uuidv4(),
      signalType: 'infrastructure',
      amount: { amount: '50000.0000', currency, asOfDate: timestamp },
      periodicity: 'one-time',
      category: 'setup',
      source: 'cost-estimate',
      timestamp,
    },
    {
      signalId: uuidv4(),
      signalType: 'license',
      amount: { amount: '10000.0000', currency, asOfDate: timestamp },
      periodicity: 'annual',
      category: 'software',
      source: 'cost-estimate',
      timestamp,
    },
    {
      signalId: uuidv4(),
      signalType: 'labor',
      amount: { amount: '15000.0000', currency, asOfDate: timestamp },
      periodicity: 'monthly',
      category: 'operations',
      source: 'cost-estimate',
      timestamp,
    },
  ];
}

/**
 * Generate sample performance signals for demonstration/testing.
 */
function generateSamplePerformanceSignals(timestamp: string): PerformanceSignal[] {
  return [
    {
      signalId: uuidv4(),
      metricType: 'latency',
      value: 150,
      unit: 'ms',
      baseline: 300,
      target: 100,
      source: 'monitoring',
      timestamp,
    },
    {
      signalId: uuidv4(),
      metricType: 'throughput',
      value: 5000,
      unit: 'req/s',
      baseline: 2000,
      target: 10000,
      source: 'monitoring',
      timestamp,
    },
  ];
}

/**
 * Generate sample adoption signals for demonstration/testing.
 */
function generateSampleAdoptionSignals(timestamp: string): AdoptionSignal[] {
  return [
    {
      signalId: uuidv4(),
      adoptionType: 'user_count',
      currentValue: 100,
      projectedValue: 500,
      growthRate: 0.15,
      timeHorizonMonths: 36,
      source: 'telemetry',
      timestamp,
    },
    {
      signalId: uuidv4(),
      adoptionType: 'feature_usage',
      currentValue: 40,
      projectedValue: 85,
      growthRate: 0.10,
      timeHorizonMonths: 36,
      source: 'telemetry',
      timestamp,
    },
  ];
}

/**
 * Generate sample risk indicators for demonstration/testing.
 */
function generateSampleRiskIndicators(currency: string, timestamp: string): RiskIndicator[] {
  return [
    {
      indicatorId: uuidv4(),
      riskType: 'operational',
      probability: 0.15,
      impact: 'moderate',
      mitigationCost: { amount: '10000.0000', currency, asOfDate: timestamp },
      description: 'Potential integration delays',
      source: 'risk-assessment',
      timestamp,
    },
    {
      indicatorId: uuidv4(),
      riskType: 'technical',
      probability: 0.10,
      impact: 'minor',
      mitigationCost: { amount: '5000.0000', currency, asOfDate: timestamp },
      description: 'Technology learning curve',
      source: 'risk-assessment',
      timestamp,
    },
  ];
}
