/**
 * Executive Synthesis Helpers
 *
 * Provides functions for building executive-synthesis-compatible Decision Packets
 * for quantify commands. Integrates with the ROI engine's synthesis response system.
 *
 * Architecture:
 * - Domain-truth repository generates synthesis content
 * - CLI orchestrates requests and renders Decision Packets
 * - Synthesis is never generated within the CLI layer (CLI only calls these helpers)
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Types
// ============================================================================

/**
 * Environment context for synthesis generation.
 */
export interface SynthesisEnvironment {
  readonly environment: 'development' | 'staging' | 'production';
  readonly timestamp: string;
  readonly version: string;
  readonly commit_sha?: string;
}

/**
 * Result metrics for synthesis evaluation.
 */
export interface SynthesisResultMetrics {
  readonly success_rate: number;
  readonly failed_iterations: number;
  readonly blocking_issues: readonly BlockingIssue[];
}

/**
 * A blocking issue that affects synthesis completion.
 */
export interface BlockingIssue {
  readonly code: string;
  readonly severity: 'warning' | 'error' | 'critical';
  readonly message: string;
  readonly component?: string;
}

/**
 * Decision Packet - Executive synthesis output format.
 * Contains all information needed for executive decision-making.
 */
export interface DecisionPacket {
  readonly id: string;
  readonly type: 'DecisionPacket';
  readonly status: 'completed' | 'partial' | 'failed';
  readonly created_at: string;
  readonly completed_at: string;

  // Projection confidence intervals
  readonly confidence: {
    readonly level: number;
    readonly lower_bound: number;
    readonly upper_bound: number;
    readonly methodology: string;
  };

  // Data freshness timestamps
  readonly data_freshness: {
    readonly pricing_data_timestamp: string;
    readonly resource_data_timestamp: string;
    readonly baseline_timestamp: string;
    readonly staleness_warning: boolean;
  };

  // Flagged assumptions
  readonly assumptions: readonly FlaggedAssumption[];

  // Risk assessment
  readonly risk: {
    readonly level: 'low' | 'medium' | 'high' | 'critical';
    readonly factors: readonly string[];
    readonly production_elevated: boolean;
  };

  // Execution metadata
  readonly execution: {
    readonly environment: string;
    readonly version: string;
    readonly commit_sha?: string;
    readonly phases_completed: readonly string[];
    readonly duration_ms: number;
  };

  // Results summary
  readonly results: {
    readonly success_rate: number;
    readonly failed_iterations: number;
    readonly blocking_issues: readonly BlockingIssue[];
  };

  // Methodology disclosure (for compare command)
  readonly methodology?: {
    readonly approach: string;
    readonly variance_explanation?: string;
    readonly comparison_basis?: string;
  };
}

/**
 * Flagged assumption in the analysis.
 */
export interface FlaggedAssumption {
  readonly id: string;
  readonly category: 'pricing' | 'resource' | 'timeline' | 'coverage' | 'methodology';
  readonly description: string;
  readonly impact: 'low' | 'medium' | 'high';
  readonly drift_detected: boolean;
}

/**
 * Quantify command result interface.
 */
export interface QuantifyResult {
  readonly id?: string;
  readonly version?: string;
  readonly projections?: {
    readonly costs?: readonly CostProjection[];
    readonly resources?: readonly ResourceProjection[];
  };
  readonly comparison?: ComparisonResult;
  readonly confidence?: {
    readonly level: number;
    readonly lower: number;
    readonly upper: number;
  };
  readonly data_timestamps?: {
    readonly pricing?: string;
    readonly resources?: string;
    readonly baseline?: string;
  };
  readonly assumptions?: readonly string[];
  readonly errors?: readonly string[];
  readonly warnings?: readonly string[];
}

/**
 * Cost projection detail.
 */
export interface CostProjection {
  readonly category: string;
  readonly amount: number;
  readonly currency: string;
  readonly period: string;
  readonly confidence: number;
}

/**
 * Resource projection detail.
 */
export interface ResourceProjection {
  readonly resource_type: string;
  readonly quantity: number;
  readonly unit: string;
  readonly utilization: number;
}

/**
 * Comparison result for quantify compare.
 */
export interface ComparisonResult {
  readonly baseline_id: string;
  readonly comparison_id: string;
  readonly delta: {
    readonly cost_change: number;
    readonly cost_change_percent: number;
    readonly resource_change: number;
  };
  readonly variance_factors: readonly string[];
  readonly methodology: string;
}

// ============================================================================
// Constants
// ============================================================================

const STALE_DATA_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

// ============================================================================
// Environment Detection
// ============================================================================

/**
 * Determines the execution environment from input context.
 */
export function determineEnvironment(input: unknown): 'development' | 'staging' | 'production' {
  if (!input || typeof input !== 'object') {
    return 'development';
  }

  const obj = input as Record<string, unknown>;

  // Check explicit environment field
  const envValue = obj['environment'] ?? obj['target_environment'];
  if (typeof envValue === 'string') {
    const env = envValue.toLowerCase();
    if (env === 'production' || env === 'prod') return 'production';
    if (env === 'staging' || env === 'stage') return 'staging';
    return 'development';
  }

  // Check target field
  const targetValue = obj['target'];
  if (typeof targetValue === 'string') {
    const target = targetValue.toLowerCase();
    if (target.includes('prod')) return 'production';
    if (target.includes('stag')) return 'staging';
  }

  // Check for production indicators
  if (obj['production'] === true || obj['isProd'] === true) {
    return 'production';
  }

  return 'development';
}

/**
 * Checks if the target is a production environment.
 */
export function isProductionTarget(input: unknown): boolean {
  return determineEnvironment(input) === 'production';
}

// ============================================================================
// Metrics Calculation
// ============================================================================

/**
 * Calculates success rate from result data.
 */
export function calculateSuccessRate(result: unknown): number {
  if (!result || typeof result !== 'object') {
    return 0;
  }

  const obj = result as Record<string, unknown>;

  // Check for explicit success rate
  const successRateValue = obj['success_rate'];
  if (typeof successRateValue === 'number') {
    return Math.max(0, Math.min(1, successRateValue));
  }

  // Check for iteration counts
  const totalIter = obj['total_iterations'];
  const successIter = obj['successful_iterations'];
  if (typeof totalIter === 'number' && typeof successIter === 'number') {
    return totalIter > 0 ? successIter / totalIter : 0;
  }

  // Check for errors array
  const errorsValue = obj['errors'];
  if (Array.isArray(errorsValue)) {
    const errorCount = errorsValue.length;
    if (errorCount === 0) return 1.0;
    return Math.max(0, 1 - (errorCount / 10));
  }

  // Check projections for completeness
  const projectionsValue = obj['projections'];
  if (projectionsValue && typeof projectionsValue === 'object') {
    const projections = projectionsValue as Record<string, unknown>;
    const costsValue = projections['costs'];
    const resourcesValue = projections['resources'];
    const hasCosts = Array.isArray(costsValue) && costsValue.length > 0;
    const hasResources = Array.isArray(resourcesValue) && resourcesValue.length > 0;

    if (hasCosts && hasResources) return 1.0;
    if (hasCosts || hasResources) return 0.5;
  }

  return 0.75;
}

/**
 * Counts blocking issues from result.
 */
export function countBlockingIssues(result: unknown): number {
  if (!result || typeof result !== 'object') {
    return 0;
  }

  const obj = result as Record<string, unknown>;
  let count = 0;

  // Count errors as blocking
  const errorsValue = obj['errors'];
  if (Array.isArray(errorsValue)) {
    count += errorsValue.length;
  }

  // Count critical warnings as blocking
  const warningsValue = obj['warnings'];
  if (Array.isArray(warningsValue)) {
    count += warningsValue.filter((w: unknown) => {
      if (typeof w === 'string') {
        return w.toLowerCase().includes('critical') || w.toLowerCase().includes('blocking');
      }
      if (w && typeof w === 'object') {
        const wObj = w as Record<string, unknown>;
        return wObj['severity'] === 'critical';
      }
      return false;
    }).length;
  }

  // Count missing required data
  const projectionsValue = obj['projections'];
  if (projectionsValue === null || projectionsValue === undefined) {
    count += 1;
  }

  return count;
}

/**
 * Extracts blocking issues with details from result.
 */
export function extractBlockingIssues(result: unknown): readonly BlockingIssue[] {
  if (!result || typeof result !== 'object') {
    return [];
  }

  const obj = result as Record<string, unknown>;
  const issues: BlockingIssue[] = [];

  // Extract from errors array
  const errorsValue = obj['errors'];
  if (Array.isArray(errorsValue)) {
    for (const error of errorsValue) {
      if (typeof error === 'string') {
        issues.push({
          code: `ERR_${issues.length + 1}`,
          severity: 'error',
          message: error,
        });
      } else if (error && typeof error === 'object') {
        const e = error as Record<string, unknown>;
        const issue: BlockingIssue = {
          code: (typeof e['code'] === 'string' ? e['code'] : `ERR_${issues.length + 1}`),
          severity: (e['severity'] === 'warning' || e['severity'] === 'error' || e['severity'] === 'critical')
            ? e['severity']
            : 'error',
          message: typeof e['message'] === 'string' ? e['message'] : 'Unknown error',
        };
        if (typeof e['component'] === 'string') {
          issues.push({ ...issue, component: e['component'] });
        } else {
          issues.push(issue);
        }
      }
    }
  }

  // Extract critical warnings
  const warningsValue = obj['warnings'];
  if (Array.isArray(warningsValue)) {
    for (const warning of warningsValue) {
      const isCritical = typeof warning === 'string'
        ? warning.toLowerCase().includes('critical')
        : (warning && typeof warning === 'object' && (warning as Record<string, unknown>)['severity'] === 'critical');

      if (isCritical) {
        if (typeof warning === 'string') {
          issues.push({
            code: `WARN_CRITICAL_${issues.length + 1}`,
            severity: 'critical',
            message: warning,
          });
        } else if (warning && typeof warning === 'object') {
          const w = warning as Record<string, unknown>;
          const issue: BlockingIssue = {
            code: typeof w['code'] === 'string' ? w['code'] : `WARN_CRITICAL_${issues.length + 1}`,
            severity: 'critical',
            message: typeof w['message'] === 'string' ? w['message'] : 'Critical warning',
          };
          if (typeof w['component'] === 'string') {
            issues.push({ ...issue, component: w['component'] });
          } else {
            issues.push(issue);
          }
        }
      }
    }
  }

  return issues;
}

// ============================================================================
// Data Freshness
// ============================================================================

/**
 * Checks if a timestamp indicates stale data.
 */
function isStale(timestamp: string | undefined, thresholdMs: number = STALE_DATA_THRESHOLD_MS): boolean {
  if (!timestamp) return true;

  try {
    const dataTime = new Date(timestamp).getTime();
    const now = Date.now();
    return (now - dataTime) > thresholdMs;
  } catch {
    return true;
  }
}

/**
 * Builds data freshness assessment.
 */
function buildDataFreshness(result: QuantifyResult): DecisionPacket['data_freshness'] {
  const now = new Date().toISOString();

  const pricingTimestamp = result.data_timestamps?.pricing ?? now;
  const resourceTimestamp = result.data_timestamps?.resources ?? now;
  const baselineTimestamp = result.data_timestamps?.baseline ?? now;

  const stalenessWarning = isStale(pricingTimestamp) || isStale(resourceTimestamp) || isStale(baselineTimestamp);

  return {
    pricing_data_timestamp: pricingTimestamp,
    resource_data_timestamp: resourceTimestamp,
    baseline_timestamp: baselineTimestamp,
    staleness_warning: stalenessWarning,
  };
}

// ============================================================================
// Assumption Flagging
// ============================================================================

/**
 * Extracts and flags assumptions from result.
 */
function extractAssumptions(result: QuantifyResult): readonly FlaggedAssumption[] {
  const assumptions: FlaggedAssumption[] = [];

  // Standard assumptions to check
  const standardAssumptions: Array<{
    category: FlaggedAssumption['category'];
    check: () => boolean;
    description: string;
    impact: FlaggedAssumption['impact'];
  }> = [
    {
      category: 'pricing',
      check: () => isStale(result.data_timestamps?.pricing),
      description: 'Pricing data may be stale (>24h old)',
      impact: 'high',
    },
    {
      category: 'resource',
      check: () => isStale(result.data_timestamps?.resources),
      description: 'Resource data may be stale (>24h old)',
      impact: 'medium',
    },
    {
      category: 'coverage',
      check: () => {
        const projections = result.projections;
        const hasCosts = projections?.costs && projections.costs.length > 0;
        const hasResources = projections?.resources && projections.resources.length > 0;
        return !hasCosts || !hasResources;
      },
      description: 'Incomplete resource coverage in projections',
      impact: 'high',
    },
    {
      category: 'methodology',
      check: () => {
        const confidence = result.confidence;
        return !confidence || confidence.level < 0.7;
      },
      description: 'Low confidence in projection methodology',
      impact: 'medium',
    },
  ];

  for (const { category, check, description, impact } of standardAssumptions) {
    const driftDetected = check();
    assumptions.push({
      id: `assumption_${category}_${uuidv4().substring(0, 8)}`,
      category,
      description,
      impact: driftDetected ? 'high' : impact,
      drift_detected: driftDetected,
    });
  }

  // Add explicit assumptions from result
  if (result.assumptions) {
    for (const assumption of result.assumptions) {
      assumptions.push({
        id: `assumption_explicit_${uuidv4().substring(0, 8)}`,
        category: 'methodology',
        description: assumption,
        impact: 'medium',
        drift_detected: false,
      });
    }
  }

  return assumptions;
}

// ============================================================================
// Risk Assessment
// ============================================================================

/**
 * Calculates risk level from metrics.
 */
function calculateRiskLevel(
  metrics: SynthesisResultMetrics,
  assumptions: readonly FlaggedAssumption[]
): 'low' | 'medium' | 'high' | 'critical' {
  const successRate = metrics.success_rate;
  const blockingCount = metrics.blocking_issues.length;
  const highImpactAssumptions = assumptions.filter(a => a.impact === 'high' && a.drift_detected).length;

  if (blockingCount >= 3 || successRate < 0.5) {
    return 'critical';
  }

  if (blockingCount >= 1 || successRate < 0.7 || highImpactAssumptions >= 2) {
    return 'high';
  }

  if (highImpactAssumptions >= 1 || successRate < 0.9) {
    return 'medium';
  }

  return 'low';
}

/**
 * Extracts risk factors from analysis.
 */
function extractRiskFactors(
  result: QuantifyResult,
  assumptions: readonly FlaggedAssumption[]
): readonly string[] {
  const factors: string[] = [];

  // Add blocking issue factors
  for (const issue of extractBlockingIssues(result)) {
    factors.push(`${issue.severity.toUpperCase()}: ${issue.message}`);
  }

  // Add drift factors
  for (const assumption of assumptions.filter(a => a.drift_detected)) {
    factors.push(`DRIFT: ${assumption.description}`);
  }

  // Add coverage factors
  const hasCosts = result.projections?.costs && result.projections.costs.length > 0;
  const hasResources = result.projections?.resources && result.projections.resources.length > 0;
  if (!hasCosts) {
    factors.push('Missing cost projections');
  }
  if (!hasResources) {
    factors.push('Missing resource projections');
  }

  return factors;
}

// ============================================================================
// Executive Summary Builder
// ============================================================================

/**
 * Builds an executive summary Decision Packet from quantify result.
 */
export function buildExecutiveSummary(
  environment: SynthesisEnvironment,
  metrics: SynthesisResultMetrics,
  phases: readonly string[],
  result?: QuantifyResult,
  comparison?: ComparisonResult
): DecisionPacket {
  const startTime = new Date();
  const id = `dp-${uuidv4().substring(0, 12)}`;

  const quantifyResult: QuantifyResult = result ?? {
    confidence: { level: metrics.success_rate, lower: 0, upper: 1 },
  };

  const assumptions = extractAssumptions(quantifyResult);
  const riskLevel = calculateRiskLevel(metrics, assumptions);
  const riskFactors = extractRiskFactors(quantifyResult, assumptions);

  const confidence = quantifyResult.confidence ?? {
    level: metrics.success_rate,
    lower: metrics.success_rate * 0.8,
    upper: Math.min(1, metrics.success_rate * 1.2),
  };

  const endTime = new Date();

  const status: DecisionPacket['status'] =
    metrics.failed_iterations > 0
      ? (metrics.success_rate < 0.5 ? 'failed' : 'partial')
      : 'completed';

  const executionMetadata: DecisionPacket['execution'] = environment.commit_sha
    ? {
        environment: environment.environment,
        version: environment.version,
        commit_sha: environment.commit_sha,
        phases_completed: phases,
        duration_ms: endTime.getTime() - startTime.getTime(),
      }
    : {
        environment: environment.environment,
        version: environment.version,
        phases_completed: phases,
        duration_ms: endTime.getTime() - startTime.getTime(),
      };

  const basePacket: DecisionPacket = {
    id,
    type: 'DecisionPacket',
    status,
    created_at: startTime.toISOString(),
    completed_at: endTime.toISOString(),

    confidence: {
      level: confidence.level,
      lower_bound: confidence.lower,
      upper_bound: confidence.upper,
      methodology: 'coefficient_of_variation',
    },

    data_freshness: buildDataFreshness(quantifyResult),

    assumptions,

    risk: {
      level: riskLevel,
      factors: riskFactors,
      production_elevated: false,
    },

    execution: executionMetadata,

    results: {
      success_rate: metrics.success_rate,
      failed_iterations: metrics.failed_iterations,
      blocking_issues: metrics.blocking_issues,
    },
  };

  // Add methodology for comparisons
  if (comparison) {
    return {
      ...basePacket,
      methodology: {
        approach: comparison.methodology,
        variance_explanation: comparison.variance_factors.join('; '),
        comparison_basis: `${comparison.baseline_id} vs ${comparison.comparison_id}`,
      },
    };
  }

  return basePacket;
}

// ============================================================================
// Production Risk Elevation
// ============================================================================

/**
 * Elevates risk assessment for production environments.
 */
export function elevateRiskForProduction(synthesis: DecisionPacket): DecisionPacket {
  const elevatedRiskLevel = (() => {
    switch (synthesis.risk.level) {
      case 'low': return 'medium' as const;
      case 'medium': return 'high' as const;
      case 'high': return 'critical' as const;
      case 'critical': return 'critical' as const;
    }
  })();

  const productionFactors = [
    'PRODUCTION: Elevated risk due to production environment',
    'PRODUCTION: Requires additional approval workflow',
  ];

  const PRODUCTION_RISK_ELEVATION_FACTOR = 1.5;

  const elevatedConfidence = {
    ...synthesis.confidence,
    lower_bound: synthesis.confidence.lower_bound * (1 - (1 - synthesis.confidence.lower_bound) * PRODUCTION_RISK_ELEVATION_FACTOR),
    upper_bound: Math.min(1, synthesis.confidence.upper_bound * PRODUCTION_RISK_ELEVATION_FACTOR),
  };

  const elevatedAssumptions = synthesis.assumptions.map(a => ({
    ...a,
    impact: (a.drift_detected && synthesis.data_freshness.staleness_warning)
      ? 'high' as const
      : a.impact,
  }));

  return {
    ...synthesis,
    confidence: elevatedConfidence,
    assumptions: elevatedAssumptions,
    risk: {
      level: elevatedRiskLevel,
      factors: [...synthesis.risk.factors, ...productionFactors],
      production_elevated: true,
    },
  };
}
