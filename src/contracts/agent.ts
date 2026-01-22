/**
 * Enterprise Strategy Agent Contract Types
 *
 * Defines the DecisionEvent schema and agent contract for the Enterprise Strategy Agent.
 * This agent models enterprise-level ROI, financial impact, and strategic value scenarios
 * to support executive decision-making and business case development.
 *
 * Classification: ENTERPRISE ROI STRATEGY
 *
 * Per Agentics Constitution:
 * - This agent MUST NOT execute inference, modify documents, route requests,
 *   trigger orchestration, apply optimizations automatically, or enforce decisions
 * - All persistence MUST occur via ruvector-service client calls
 * - All schemas MUST be defined in agentics-contracts
 */

import { z } from 'zod';
import type { UUID, ISO8601, SHA256Hash, MonetaryValue, ConfidenceInterval } from './common';

// ============================================================================
// Agent Identification
// ============================================================================

/**
 * Agent identifier following Agentics platform conventions.
 */
export const ENTERPRISE_STRATEGY_AGENT_ID = 'enterprise-strategy-agent';

/**
 * Current agent version (semantic versioning).
 */
export const ENTERPRISE_STRATEGY_AGENT_VERSION = '1.0.0';

/**
 * Decision type for this agent's output.
 */
export const DECISION_TYPE = 'enterprise_roi_strategy';

// ============================================================================
// Decision Types
// ============================================================================

/**
 * Enumeration of strategy decision subtypes.
 */
export enum StrategyDecisionSubtype {
  /** ROI modeling for single scenario */
  ROI_MODEL = 'roi_model',
  /** Comparative analysis across scenarios */
  SCENARIO_COMPARISON = 'scenario_comparison',
  /** Strategic value synthesis */
  VALUE_SYNTHESIS = 'value_synthesis',
  /** Risk-adjusted return modeling */
  RISK_ADJUSTED_RETURN = 'risk_adjusted_return',
  /** Payback period analysis */
  PAYBACK_ANALYSIS = 'payback_analysis',
  /** Adoption scenario modeling */
  ADOPTION_MODELING = 'adoption_modeling',
}

/**
 * Confidence semantics for model reliability.
 */
export enum ConfidenceLevel {
  /** High confidence: reliable inputs, proven methodology */
  HIGH = 'HIGH',
  /** Medium confidence: some assumptions, industry benchmarks */
  MEDIUM = 'MEDIUM',
  /** Low confidence: significant assumptions, estimates */
  LOW = 'LOW',
  /** Very low confidence: highly speculative, limited data */
  VERY_LOW = 'VERY_LOW',
}

// ============================================================================
// Input Schemas (from agentics-contracts)
// ============================================================================

/**
 * Cost signal from CostOps or analytics.
 */
export interface CostSignal {
  readonly signalId: UUID;
  readonly signalType: 'labor' | 'infrastructure' | 'license' | 'overhead' | 'opportunity';
  readonly amount: MonetaryValue;
  readonly periodicity: 'one-time' | 'monthly' | 'quarterly' | 'annual';
  readonly category: string;
  readonly source: string;
  readonly timestamp: ISO8601;
}

export const CostSignalSchema = z.object({
  signalId: z.string().uuid(),
  signalType: z.enum(['labor', 'infrastructure', 'license', 'overhead', 'opportunity']),
  amount: z.object({
    amount: z.string(),
    currency: z.string().length(3),
    asOfDate: z.string().datetime(),
  }),
  periodicity: z.enum(['one-time', 'monthly', 'quarterly', 'annual']),
  category: z.string(),
  source: z.string(),
  timestamp: z.string().datetime(),
});

/**
 * Performance signal from analytics or monitoring.
 */
export interface PerformanceSignal {
  readonly signalId: UUID;
  readonly metricType: 'latency' | 'throughput' | 'error_rate' | 'availability' | 'utilization';
  readonly value: number;
  readonly unit: string;
  readonly baseline: number;
  readonly target: number;
  readonly source: string;
  readonly timestamp: ISO8601;
}

export const PerformanceSignalSchema = z.object({
  signalId: z.string().uuid(),
  metricType: z.enum(['latency', 'throughput', 'error_rate', 'availability', 'utilization']),
  value: z.number(),
  unit: z.string(),
  baseline: z.number(),
  target: z.number(),
  source: z.string(),
  timestamp: z.string().datetime(),
});

/**
 * Adoption signal from platform telemetry.
 */
export interface AdoptionSignal {
  readonly signalId: UUID;
  readonly adoptionType: 'user_count' | 'feature_usage' | 'workflow_execution' | 'api_calls';
  readonly currentValue: number;
  readonly projectedValue: number;
  readonly growthRate: number;
  readonly timeHorizonMonths: number;
  readonly source: string;
  readonly timestamp: ISO8601;
}

export const AdoptionSignalSchema = z.object({
  signalId: z.string().uuid(),
  adoptionType: z.enum(['user_count', 'feature_usage', 'workflow_execution', 'api_calls']),
  currentValue: z.number().nonnegative(),
  projectedValue: z.number().nonnegative(),
  growthRate: z.number(),
  timeHorizonMonths: z.number().int().min(1).max(120),
  source: z.string(),
  timestamp: z.string().datetime(),
});

/**
 * Risk indicator from compliance or governance systems.
 */
export interface RiskIndicator {
  readonly indicatorId: UUID;
  readonly riskType: 'operational' | 'financial' | 'compliance' | 'technical' | 'market';
  readonly probability: number; // 0.0 to 1.0
  readonly impact: 'negligible' | 'minor' | 'moderate' | 'major' | 'catastrophic';
  readonly mitigationCost: MonetaryValue;
  readonly description: string;
  readonly source: string;
  readonly timestamp: ISO8601;
}

export const RiskIndicatorSchema = z.object({
  indicatorId: z.string().uuid(),
  riskType: z.enum(['operational', 'financial', 'compliance', 'technical', 'market']),
  probability: z.number().min(0).max(1),
  impact: z.enum(['negligible', 'minor', 'moderate', 'major', 'catastrophic']),
  mitigationCost: z.object({
    amount: z.string(),
    currency: z.string().length(3),
    asOfDate: z.string().datetime(),
  }),
  description: z.string(),
  source: z.string(),
  timestamp: z.string().datetime(),
});

/**
 * Complete input for the Enterprise Strategy Agent.
 */
export interface EnterpriseStrategyInput {
  /** Unique request identifier */
  readonly requestId: UUID;
  /** Type of strategy analysis requested */
  readonly analysisType: StrategyDecisionSubtype;
  /** Scenario identifier for tracking */
  readonly scenarioId: string;
  /** Scenario name for display */
  readonly scenarioName: string;
  /** Cost signals from various sources */
  readonly costSignals: readonly CostSignal[];
  /** Performance signals from analytics */
  readonly performanceSignals: readonly PerformanceSignal[];
  /** Adoption signals from telemetry */
  readonly adoptionSignals: readonly AdoptionSignal[];
  /** Risk indicators from governance */
  readonly riskIndicators: readonly RiskIndicator[];
  /** Time horizon for analysis in months */
  readonly timeHorizonMonths: number;
  /** Discount rate for NPV calculations */
  readonly discountRate: number;
  /** Base currency for monetary values */
  readonly baseCurrency: string;
  /** Optional: comparison scenario ID */
  readonly comparisonScenarioId?: string;
  /** Optional: custom assumptions to apply */
  readonly customAssumptions?: readonly string[];
}

export const EnterpriseStrategyInputSchema = z.object({
  requestId: z.string().uuid(),
  analysisType: z.nativeEnum(StrategyDecisionSubtype),
  scenarioId: z.string().min(1),
  scenarioName: z.string().min(1),
  costSignals: z.array(CostSignalSchema),
  performanceSignals: z.array(PerformanceSignalSchema),
  adoptionSignals: z.array(AdoptionSignalSchema),
  riskIndicators: z.array(RiskIndicatorSchema),
  timeHorizonMonths: z.number().int().min(1).max(120),
  discountRate: z.number().min(0).max(1),
  baseCurrency: z.string().length(3),
  comparisonScenarioId: z.string().optional(),
  customAssumptions: z.array(z.string()).optional(),
});

// ============================================================================
// Output Schemas
// ============================================================================

/**
 * ROI metrics output.
 */
export interface ROIMetrics {
  readonly grossROI: number;
  readonly netROI: number;
  readonly annualizedROI: number;
  readonly roi_p10: number;
  readonly roi_p50: number;
  readonly roi_p90: number;
  readonly methodology: string;
}

/**
 * NPV and payback metrics output.
 */
export interface NPVMetrics {
  readonly npv: MonetaryValue;
  readonly irr: number | null;
  readonly paybackPeriodMonths: number | null;
  readonly discountedPaybackMonths: number | null;
  readonly profitabilityIndex: number;
}

/**
 * Strategic value synthesis output.
 */
export interface StrategicValueOutput {
  readonly totalInvestment: MonetaryValue;
  readonly totalBenefit: MonetaryValue;
  readonly netBenefit: MonetaryValue;
  readonly roiMetrics: ROIMetrics;
  readonly npvMetrics: NPVMetrics;
  readonly riskAdjustedReturn: MonetaryValue;
  readonly confidenceInterval: ConfidenceInterval;
  readonly adoptionImpact: {
    readonly currentState: number;
    readonly projectedState: number;
    readonly valueAtFullAdoption: MonetaryValue;
  };
}

/**
 * Scenario comparison output.
 */
export interface ScenarioComparisonOutput {
  readonly baselineScenarioId: string;
  readonly comparisonScenarioId: string;
  readonly deltaNPV: MonetaryValue;
  readonly deltaROI: number;
  readonly preferredScenario: string;
  readonly confidenceDelta: number;
  readonly recommendation: string;
}

/**
 * Complete output for the Enterprise Strategy Agent.
 */
export interface EnterpriseStrategyOutput {
  /** Unique output identifier */
  readonly outputId: UUID;
  /** Reference to input request */
  readonly requestId: UUID;
  /** Scenario analyzed */
  readonly scenarioId: string;
  /** Analysis type performed */
  readonly analysisType: StrategyDecisionSubtype;
  /** Strategic value synthesis */
  readonly strategicValue: StrategicValueOutput;
  /** Scenario comparison (if applicable) */
  readonly scenarioComparison?: ScenarioComparisonOutput;
  /** Assumptions applied during analysis */
  readonly assumptionsApplied: readonly string[];
  /** Constraints applied during analysis */
  readonly constraintsApplied: readonly string[];
  /** Human-readable executive summary */
  readonly executiveSummary: string;
  /** Generated timestamp */
  readonly generatedAt: ISO8601;
}

export const EnterpriseStrategyOutputSchema = z.object({
  outputId: z.string().uuid(),
  requestId: z.string().uuid(),
  scenarioId: z.string(),
  analysisType: z.nativeEnum(StrategyDecisionSubtype),
  strategicValue: z.object({
    totalInvestment: z.object({
      amount: z.string(),
      currency: z.string().length(3),
      asOfDate: z.string().datetime(),
    }),
    totalBenefit: z.object({
      amount: z.string(),
      currency: z.string().length(3),
      asOfDate: z.string().datetime(),
    }),
    netBenefit: z.object({
      amount: z.string(),
      currency: z.string().length(3),
      asOfDate: z.string().datetime(),
    }),
    roiMetrics: z.object({
      grossROI: z.number(),
      netROI: z.number(),
      annualizedROI: z.number(),
      roi_p10: z.number(),
      roi_p50: z.number(),
      roi_p90: z.number(),
      methodology: z.string(),
    }),
    npvMetrics: z.object({
      npv: z.object({
        amount: z.string(),
        currency: z.string().length(3),
        asOfDate: z.string().datetime(),
      }),
      irr: z.number().nullable(),
      paybackPeriodMonths: z.number().nullable(),
      discountedPaybackMonths: z.number().nullable(),
      profitabilityIndex: z.number(),
    }),
    riskAdjustedReturn: z.object({
      amount: z.string(),
      currency: z.string().length(3),
      asOfDate: z.string().datetime(),
    }),
    confidenceInterval: z.object({
      confidenceLevel: z.number(),
      lowerBound: z.string(),
      upperBound: z.string(),
      margin: z.string(),
    }),
    adoptionImpact: z.object({
      currentState: z.number(),
      projectedState: z.number(),
      valueAtFullAdoption: z.object({
        amount: z.string(),
        currency: z.string().length(3),
        asOfDate: z.string().datetime(),
      }),
    }),
  }),
  scenarioComparison: z.object({
    baselineScenarioId: z.string(),
    comparisonScenarioId: z.string(),
    deltaNPV: z.object({
      amount: z.string(),
      currency: z.string().length(3),
      asOfDate: z.string().datetime(),
    }),
    deltaROI: z.number(),
    preferredScenario: z.string(),
    confidenceDelta: z.number(),
    recommendation: z.string(),
  }).optional(),
  assumptionsApplied: z.array(z.string()),
  constraintsApplied: z.array(z.string()),
  executiveSummary: z.string(),
  generatedAt: z.string().datetime(),
});

// ============================================================================
// DecisionEvent Schema (Per Agentics Constitution)
// ============================================================================

/**
 * DecisionEvent is the canonical output format for all agents in the Agentics platform.
 * This event is emitted exactly ONCE per agent invocation.
 *
 * Per constitution, DecisionEvent MUST include:
 * - agent_id
 * - agent_version
 * - decision_type
 * - inputs_hash
 * - outputs
 * - confidence (model reliability / assumption confidence)
 * - constraints_applied (assumptions, scope, scenario bounds)
 * - execution_ref
 * - timestamp (UTC)
 */
export interface DecisionEvent {
  /** Agent identifier */
  readonly agent_id: string;
  /** Agent version (semantic versioning) */
  readonly agent_version: string;
  /** Decision type (always 'enterprise_roi_strategy' for this agent) */
  readonly decision_type: typeof DECISION_TYPE;
  /** SHA256 hash of the input for reproducibility */
  readonly inputs_hash: SHA256Hash;
  /** The complete output of the analysis */
  readonly outputs: EnterpriseStrategyOutput;
  /** Confidence in the model outputs */
  readonly confidence: {
    /** Confidence level classification */
    readonly level: ConfidenceLevel;
    /** Numeric confidence score (0.0 to 1.0) */
    readonly score: number;
    /** Factors contributing to confidence assessment */
    readonly factors: readonly string[];
  };
  /** Constraints applied during execution */
  readonly constraints_applied: {
    /** Assumptions made during analysis */
    readonly assumptions: readonly string[];
    /** Scope boundaries */
    readonly scope: readonly string[];
    /** Scenario bounds applied */
    readonly scenario_bounds: {
      readonly time_horizon_months: number;
      readonly discount_rate: number;
      readonly currency: string;
    };
  };
  /** Reference to execution for tracing */
  readonly execution_ref: {
    /** Unique execution ID */
    readonly execution_id: UUID;
    /** Trace ID for distributed tracing */
    readonly trace_id?: string;
    /** Span ID for distributed tracing */
    readonly span_id?: string;
    /** Correlation ID for request tracking */
    readonly correlation_id?: string;
  };
  /** UTC timestamp of event emission */
  readonly timestamp: ISO8601;
  /** Checksum of the entire event for integrity */
  readonly event_checksum: SHA256Hash;
}

export const DecisionEventSchema = z.object({
  agent_id: z.literal(ENTERPRISE_STRATEGY_AGENT_ID),
  agent_version: z.string().regex(/^\d+\.\d+\.\d+$/),
  decision_type: z.literal(DECISION_TYPE),
  inputs_hash: z.string().length(64),
  outputs: EnterpriseStrategyOutputSchema,
  confidence: z.object({
    level: z.nativeEnum(ConfidenceLevel),
    score: z.number().min(0).max(1),
    factors: z.array(z.string()),
  }),
  constraints_applied: z.object({
    assumptions: z.array(z.string()),
    scope: z.array(z.string()),
    scenario_bounds: z.object({
      time_horizon_months: z.number().int().min(1).max(120),
      discount_rate: z.number().min(0).max(1),
      currency: z.string().length(3),
    }),
  }),
  execution_ref: z.object({
    execution_id: z.string().uuid(),
    trace_id: z.string().optional(),
    span_id: z.string().optional(),
    correlation_id: z.string().optional(),
  }),
  timestamp: z.string().datetime(),
  event_checksum: z.string().length(64),
});

// ============================================================================
// Telemetry Schema
// ============================================================================

/**
 * Telemetry event for LLM-Observatory compatibility.
 */
export interface AgentTelemetryEvent {
  readonly event_type: 'agent_invocation';
  readonly agent_id: string;
  readonly agent_version: string;
  readonly execution_id: UUID;
  readonly timestamp: ISO8601;
  readonly duration_ms: number;
  readonly status: 'success' | 'failure' | 'partial';
  readonly input_size_bytes: number;
  readonly output_size_bytes: number;
  readonly confidence_score: number;
  readonly error?: {
    readonly code: string;
    readonly message: string;
    readonly recoverable: boolean;
  };
  readonly metadata: Record<string, unknown>;
}

export const AgentTelemetryEventSchema = z.object({
  event_type: z.literal('agent_invocation'),
  agent_id: z.string(),
  agent_version: z.string(),
  execution_id: z.string().uuid(),
  timestamp: z.string().datetime(),
  duration_ms: z.number().nonnegative(),
  status: z.enum(['success', 'failure', 'partial']),
  input_size_bytes: z.number().nonnegative(),
  output_size_bytes: z.number().nonnegative(),
  confidence_score: z.number().min(0).max(1),
  error: z.object({
    code: z.string(),
    message: z.string(),
    recoverable: z.boolean(),
  }).optional(),
  metadata: z.record(z.string(), z.unknown()),
});

// ============================================================================
// CLI Contract
// ============================================================================

/**
 * CLI command shapes for the Enterprise Strategy Agent.
 *
 * Commands:
 * - analyze: Perform strategy analysis on input signals
 * - model: Generate ROI model for a scenario
 * - inspect: Inspect details of a previous analysis
 */
export type CLICommand = 'analyze' | 'model' | 'inspect';

export interface CLIAnalyzeInput {
  readonly command: 'analyze';
  readonly inputFile: string;
  readonly outputFile?: string;
  readonly format?: 'json' | 'yaml';
}

export interface CLIModelInput {
  readonly command: 'model';
  readonly scenarioId: string;
  readonly scenarioName: string;
  readonly timeHorizon?: number;
  readonly discountRate?: number;
  readonly inputFile?: string;
  readonly outputFile?: string;
}

export interface CLIInspectInput {
  readonly command: 'inspect';
  readonly executionId: string;
  readonly includeInputs?: boolean;
  readonly format?: 'json' | 'yaml' | 'summary';
}

export type CLIInput = CLIAnalyzeInput | CLIModelInput | CLIInspectInput;

// ============================================================================
// ruvector-service Persistence Contract
// ============================================================================

/**
 * Data persisted to ruvector-service.
 *
 * PERSISTED:
 * - DecisionEvent (full)
 * - Telemetry events
 * - Execution metadata
 *
 * NOT PERSISTED:
 * - Raw input signals (already stored by upstream systems)
 * - Intermediate calculation results
 * - Temporary data structures
 */
export interface PersistencePayload {
  /** The DecisionEvent to persist */
  readonly decisionEvent: DecisionEvent;
  /** Optional telemetry event */
  readonly telemetryEvent?: AgentTelemetryEvent;
  /** Persistence metadata */
  readonly metadata: {
    readonly persistedAt: ISO8601;
    readonly source: typeof ENTERPRISE_STRATEGY_AGENT_ID;
    readonly version: typeof ENTERPRISE_STRATEGY_AGENT_VERSION;
  };
}

// ============================================================================
// Type Guards
// ============================================================================

export function isValidEnterpriseStrategyInput(data: unknown): data is EnterpriseStrategyInput {
  return EnterpriseStrategyInputSchema.safeParse(data).success;
}

export function isValidEnterpriseStrategyOutput(data: unknown): data is EnterpriseStrategyOutput {
  return EnterpriseStrategyOutputSchema.safeParse(data).success;
}

export function isValidDecisionEvent(data: unknown): data is DecisionEvent {
  return DecisionEventSchema.safeParse(data).success;
}

// ============================================================================
// Agent Non-Responsibilities (Explicit Documentation)
// ============================================================================

/**
 * EXPLICIT NON-RESPONSIBILITIES
 *
 * The Enterprise Strategy Agent MUST NEVER:
 *
 * 1. Execute inference
 *    - Does not call LLM APIs
 *    - Does not perform ML predictions
 *    - Uses deterministic financial formulas only
 *
 * 2. Modify documents or templates
 *    - Output is structured data only
 *    - Does not generate or modify documents
 *
 * 3. Route requests
 *    - Does not determine where data goes
 *    - Does not make routing decisions
 *
 * 4. Trigger orchestration
 *    - Does not start workflows
 *    - Does not spawn other agents
 *    - Does not trigger automation
 *
 * 5. Apply optimizations automatically
 *    - Does not change configurations
 *    - Does not modify system behavior
 *    - Only provides recommendations
 *
 * 6. Enforce business or governance decisions
 *    - Does not approve or reject
 *    - Does not enforce policies
 *    - Only provides analysis
 *
 * 7. Connect directly to databases
 *    - No direct SQL execution
 *    - All persistence via ruvector-service
 */

// ============================================================================
// Failure Modes
// ============================================================================

/**
 * Known failure modes and expected behavior.
 */
export enum AgentFailureMode {
  /** Input validation failed */
  INVALID_INPUT = 'INVALID_INPUT',
  /** Missing required signals */
  MISSING_SIGNALS = 'MISSING_SIGNALS',
  /** Calculation overflow/underflow */
  CALCULATION_ERROR = 'CALCULATION_ERROR',
  /** Persistence failed */
  PERSISTENCE_ERROR = 'PERSISTENCE_ERROR',
  /** Timeout exceeded */
  TIMEOUT = 'TIMEOUT',
  /** Unknown/unexpected error */
  UNKNOWN = 'UNKNOWN',
}

export interface AgentError {
  readonly mode: AgentFailureMode;
  readonly code: string;
  readonly message: string;
  readonly recoverable: boolean;
  readonly details?: Record<string, unknown>;
}
