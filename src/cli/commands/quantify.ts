/**
 * Quantify CLI Commands
 *
 * Implements the agentics quantify subcommands:
 * - quantify create: Generate cost/resource projections (WITH synthesis)
 * - quantify compare: Produce comparative analysis (WITH synthesis)
 * - quantify list: List projections (NO synthesis - read-only)
 * - quantify inspect: Inspect projection details (NO synthesis - read-only)
 *
 * Synthesis Evaluation Criteria:
 * - Success indicators: calculation completeness, data freshness, projection confidence
 * - Risk factors: stale pricing data, incomplete resource coverage, assumption drift
 * - Failure modes: missing cost data, invalid comparisons, projection overflow
 */

import { v4 as uuidv4 } from 'uuid';

import {
  buildExecutiveSummary,
  elevateRiskForProduction,
  determineEnvironment,
  calculateSuccessRate,
  countBlockingIssues,
  extractBlockingIssues,
  isProductionTarget,
  type QuantifyResult,
  type ComparisonResult,
  type SynthesisEnvironment,
} from '../../synthesis';

import type {
  QuantifyCreateInput,
  QuantifyCreateOutput,
  QuantifyCompareInput,
  QuantifyCompareOutput,
  QuantifyListInput,
  QuantifyListOutput,
  QuantifyInspectInput,
  QuantifyInspectOutput,
  InternalQuantifyResult,
  InternalComparisonResult,
  CostProjectionOutput,
  ResourceProjectionOutput,
  VarianceFactor,
} from '../types';

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_TIME_HORIZON_MONTHS = 12;
const DEFAULT_CURRENCY = 'USD';
const ENGINE_VERSION = process.env['ENGINE_VERSION'] ?? '0.1.0';
const COMMIT_SHA = process.env['GIT_SHA'] ?? process.env['COMMIT_SHA'];

// ============================================================================
// Quantify Create Command
// ============================================================================

/**
 * Creates a new cost/resource projection with executive synthesis.
 */
export async function quantifyCreate(input: QuantifyCreateInput): Promise<QuantifyCreateOutput> {
  const startTime = Date.now();
  const projectionId = `proj-${uuidv4().substring(0, 12)}`;

  try {
    // Phase 1: Validate inputs
    const validationErrors = validateCreateInput(input);
    if (validationErrors.length > 0) {
      return createErrorOutput(validationErrors, startTime, input);
    }

    // Phase 2: Generate projections
    const internalResult = await generateProjections(input, projectionId);

    // Phase 3: Build synthesis Decision Packet
    const environment = determineEnvironment(input);
    const synthesisEnv: SynthesisEnvironment = COMMIT_SHA
      ? {
          environment,
          timestamp: new Date().toISOString(),
          version: ENGINE_VERSION,
          commit_sha: COMMIT_SHA,
        }
      : {
          environment,
          timestamp: new Date().toISOString(),
          version: ENGINE_VERSION,
        };

    const quantifyResult: QuantifyResult = {
      id: internalResult.id,
      version: internalResult.version,
      projections: {
        costs: internalResult.projections.costs.map(c => ({
          category: c.category,
          amount: c.total_cost,
          currency: c.currency,
          period: c.period,
          confidence: c.confidence,
        })),
        resources: internalResult.projections.resources.map(r => ({
          resource_type: r.resource_type,
          quantity: r.quantity,
          unit: r.unit,
          utilization: r.utilization_estimate,
        })),
      },
      confidence: {
        level: internalResult.confidence.level,
        lower: internalResult.confidence.lower_bound,
        upper: internalResult.confidence.upper_bound,
      },
      data_timestamps: internalResult.data_timestamps,
      assumptions: [...internalResult.assumptions],
      errors: [...internalResult.errors],
      warnings: [...internalResult.warnings],
    };

    const metrics = {
      success_rate: calculateSuccessRate(quantifyResult),
      failed_iterations: countBlockingIssues(quantifyResult),
      blocking_issues: extractBlockingIssues(quantifyResult),
    };

    let synthesis = buildExecutiveSummary(
      synthesisEnv,
      metrics,
      ['validation', 'projection', 'costing', 'persistence'],
      quantifyResult
    );

    // Phase 4: Apply production risk elevation if targeting production
    if (isProductionTarget(input)) {
      synthesis = elevateRiskForProduction(synthesis);
    }

    const executionTime = Date.now() - startTime;

    const result: QuantifyCreateOutput = {
      success: true,
      data: {
        projection_id: internalResult.id,
        version: internalResult.version,
        projections: internalResult.projections,
        totals: internalResult.totals,
        confidence: internalResult.confidence,
        created_at: new Date().toISOString(),
      },
      execution_time_ms: executionTime,
      synthesis,
    };

    if (internalResult.warnings.length > 0) {
      return { ...result, warnings: [...internalResult.warnings] };
    }

    return result;

  } catch (error) {
    return createErrorOutput(
      [error instanceof Error ? error.message : 'Unknown error'],
      startTime,
      input
    );
  }
}

// ============================================================================
// Quantify Compare Command
// ============================================================================

/**
 * Compares two projections and produces comparative analysis with synthesis.
 */
export async function quantifyCompare(input: QuantifyCompareInput): Promise<QuantifyCompareOutput> {
  const startTime = Date.now();
  const comparisonId = `cmp-${uuidv4().substring(0, 12)}`;

  try {
    // Phase 1: Validate inputs
    const validationErrors = validateCompareInput(input);
    if (validationErrors.length > 0) {
      return createCompareErrorOutput(validationErrors, startTime, input);
    }

    // Phase 2: Perform comparison
    const internalResult = await performComparison(input, comparisonId);

    // Phase 3: Build synthesis Decision Packet
    const environment = determineEnvironment(input);
    const synthesisEnv: SynthesisEnvironment = COMMIT_SHA
      ? {
          environment,
          timestamp: new Date().toISOString(),
          version: ENGINE_VERSION,
          commit_sha: COMMIT_SHA,
        }
      : {
          environment,
          timestamp: new Date().toISOString(),
          version: ENGINE_VERSION,
        };

    const comparisonResult: ComparisonResult = {
      baseline_id: input.baseline_id,
      comparison_id: input.comparison_id,
      delta: {
        cost_change: internalResult.delta.cost_change,
        cost_change_percent: internalResult.delta.cost_change_percent,
        resource_change: internalResult.delta.resource_change,
      },
      variance_factors: internalResult.variance_factors.map(v => v.factor),
      methodology: internalResult.methodology,
    };

    const quantifyResult: QuantifyResult = {
      comparison: comparisonResult,
      errors: [...internalResult.errors],
      warnings: [...internalResult.warnings],
    };

    const metrics = {
      success_rate: calculateSuccessRate(quantifyResult),
      failed_iterations: countBlockingIssues(quantifyResult),
      blocking_issues: extractBlockingIssues(quantifyResult),
    };

    let synthesis = buildExecutiveSummary(
      synthesisEnv,
      metrics,
      ['validation', 'baseline_fetch', 'comparison_fetch', 'delta_calculation', 'variance_analysis'],
      quantifyResult,
      comparisonResult
    );

    // Phase 4: Apply production risk elevation if targeting production
    if (isProductionTarget(input)) {
      synthesis = elevateRiskForProduction(synthesis);
    }

    const executionTime = Date.now() - startTime;

    // Generate recommendation based on delta
    const recommendation = generateRecommendation(internalResult);

    // Build base result without optional variance_analysis
    const baseData = {
      comparison_id: comparisonId,
      baseline: internalResult.baseline,
      comparison: internalResult.comparison,
      delta: internalResult.delta,
      recommendation,
      created_at: new Date().toISOString(),
    };

    // Add variance_analysis if requested
    const data = input.include_variance_analysis !== false
      ? {
          ...baseData,
          variance_analysis: {
            factors: internalResult.variance_factors,
            primary_driver: internalResult.variance_factors[0]?.factor ?? 'unknown',
            confidence: 0.85,
          },
        }
      : baseData;

    const result: QuantifyCompareOutput = {
      success: true,
      data,
      execution_time_ms: executionTime,
      synthesis,
    };

    if (internalResult.warnings.length > 0) {
      return { ...result, warnings: [...internalResult.warnings] };
    }

    return result;

  } catch (error) {
    return createCompareErrorOutput(
      [error instanceof Error ? error.message : 'Unknown error'],
      startTime,
      input
    );
  }
}

// ============================================================================
// Quantify List Command (NO SYNTHESIS - Read-only)
// ============================================================================

/**
 * Lists projections with optional filtering.
 * This is a read-only enumeration command and does NOT include synthesis.
 */
export async function quantifyList(input: QuantifyListInput = {}): Promise<QuantifyListOutput> {
  const startTime = Date.now();

  try {
    const projections = await fetchProjections(input);

    return {
      success: true,
      data: {
        projections,
        total_count: projections.length,
        offset: input.offset ?? 0,
        limit: input.limit ?? 50,
      },
      execution_time_ms: Date.now() - startTime,
    };

  } catch (error) {
    return {
      success: false,
      error: {
        code: 'LIST_FAILED',
        message: error instanceof Error ? error.message : 'Failed to list projections',
      },
      execution_time_ms: Date.now() - startTime,
    };
  }
}

// ============================================================================
// Quantify Inspect Command (NO SYNTHESIS - Read-only)
// ============================================================================

/**
 * Inspects detailed projection information.
 * This is a read-only detail retrieval command and does NOT include synthesis.
 */
export async function quantifyInspect(input: QuantifyInspectInput): Promise<QuantifyInspectOutput> {
  const startTime = Date.now();

  try {
    const projection = await fetchProjectionById(input.projection_id);

    if (!projection) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Projection ${input.projection_id} not found`,
        },
        execution_time_ms: Date.now() - startTime,
      };
    }

    // Build base data
    const baseData = { projection };

    // Add optional fields
    let data: QuantifyInspectOutput['data'] = baseData;

    if (input.include_history) {
      const history = await fetchProjectionHistory(input.projection_id);
      data = { ...data, history };
    }

    if (input.include_assumptions && projection.assumptions) {
      data = { ...data, assumptions: projection.assumptions };
    }

    return {
      success: true,
      data,
      execution_time_ms: Date.now() - startTime,
    };

  } catch (error) {
    return {
      success: false,
      error: {
        code: 'INSPECT_FAILED',
        message: error instanceof Error ? error.message : 'Failed to inspect projection',
      },
      execution_time_ms: Date.now() - startTime,
    };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function validateCreateInput(input: QuantifyCreateInput): string[] {
  const errors: string[] = [];

  if (!input.name || input.name.trim().length === 0) {
    errors.push('Name is required');
  }

  if (!input.resources || input.resources.length === 0) {
    errors.push('At least one resource is required');
  }

  for (const resource of input.resources ?? []) {
    if (!resource.resource_type) {
      errors.push('Resource type is required for all resources');
    }
    if (resource.quantity < 0) {
      errors.push('Resource quantity cannot be negative');
    }
  }

  return errors;
}

function validateCompareInput(input: QuantifyCompareInput): string[] {
  const errors: string[] = [];

  if (!input.baseline_id) {
    errors.push('Baseline ID is required');
  }

  if (!input.comparison_id) {
    errors.push('Comparison ID is required');
  }

  if (input.baseline_id === input.comparison_id) {
    errors.push('Baseline and comparison IDs must be different');
  }

  return errors;
}

async function generateProjections(
  input: QuantifyCreateInput,
  projectionId: string
): Promise<InternalQuantifyResult> {
  const now = new Date().toISOString();
  const timeHorizon = input.time_horizon_months ?? DEFAULT_TIME_HORIZON_MONTHS;

  const costs: CostProjectionOutput[] = [];
  const resources: ResourceProjectionOutput[] = [];

  for (const resource of input.resources) {
    const unitCost = await getUnitCost(resource.resource_type, input.pricing_source);
    const totalCost = unitCost * resource.quantity;
    const confidence = calculateProjectionConfidence(unitCost);

    costs.push({
      category: resource.category ?? 'compute',
      resource_type: resource.resource_type,
      quantity: resource.quantity,
      unit_cost: unitCost,
      total_cost: totalCost,
      currency: DEFAULT_CURRENCY,
      period: 'monthly',
      confidence,
    });

    resources.push({
      resource_type: resource.resource_type,
      quantity: resource.quantity,
      unit: resource.unit,
      utilization_estimate: 0.75,
      scaling_factor: 1.0,
    });
  }

  const monthlyTotal = costs.reduce((sum, c) => sum + c.total_cost, 0);
  const annualTotal = monthlyTotal * 12;

  const avgConfidence = costs.length > 0
    ? costs.reduce((sum, c) => sum + c.confidence, 0) / costs.length
    : 0.5;

  const assumptions: string[] = [
    'Pricing based on current rates',
    `Time horizon: ${timeHorizon} months`,
    'Utilization estimated at 75%',
    'No volume discounts applied',
  ];

  const warnings: string[] = [];
  if (avgConfidence < 0.7) {
    warnings.push('Low confidence in pricing data for some resources');
  }

  return {
    id: projectionId,
    version: '1.0',
    projections: { costs, resources },
    totals: {
      monthly_cost: monthlyTotal,
      annual_cost: annualTotal,
      currency: DEFAULT_CURRENCY,
    },
    confidence: {
      level: avgConfidence,
      lower_bound: avgConfidence * 0.8,
      upper_bound: Math.min(1, avgConfidence * 1.2),
    },
    data_timestamps: {
      pricing: now,
      resources: now,
      baseline: input.baseline_id ? now : new Date(Date.now() - 86400000).toISOString(),
    },
    assumptions,
    errors: [],
    warnings,
  };
}

async function performComparison(
  input: QuantifyCompareInput,
  _comparisonId: string
): Promise<InternalComparisonResult> {
  const baseline = await fetchProjectionSummary(input.baseline_id);
  const comparison = await fetchProjectionSummary(input.comparison_id);

  if (!baseline || !comparison) {
    throw new Error('One or both projections not found');
  }

  const costChange = comparison.total_monthly_cost - baseline.total_monthly_cost;
  const costChangePercent = baseline.total_monthly_cost > 0
    ? (costChange / baseline.total_monthly_cost) * 100
    : 0;
  const resourceChange = comparison.total_resources - baseline.total_resources;
  const resourceChangePercent = baseline.total_resources > 0
    ? (resourceChange / baseline.total_resources) * 100
    : 0;

  const varianceFactors = analyzeVariance(baseline, comparison, costChangePercent);

  return {
    comparison_id: _comparisonId,
    baseline,
    comparison,
    delta: {
      cost_change: costChange,
      cost_change_percent: costChangePercent,
      resource_change: resourceChange,
      resource_change_percent: resourceChangePercent,
    },
    variance_factors: varianceFactors,
    methodology: 'point-in-time comparison with variance attribution',
    errors: [],
    warnings: [],
  };
}

function analyzeVariance(
  baseline: { total_monthly_cost: number; total_resources: number },
  comparison: { total_monthly_cost: number; total_resources: number },
  costChangePercent: number
): VarianceFactor[] {
  const factors: VarianceFactor[] = [];
  const direction = costChangePercent >= 0 ? 'increase' : 'decrease';

  if (baseline.total_resources !== comparison.total_resources) {
    const resourceContribution = Math.abs(
      ((comparison.total_resources - baseline.total_resources) / baseline.total_resources) * 50
    );
    factors.push({
      factor: 'resource_count',
      contribution_percent: Math.min(100, resourceContribution),
      direction: comparison.total_resources > baseline.total_resources ? 'increase' : 'decrease',
      explanation: `Resource count changed from ${baseline.total_resources} to ${comparison.total_resources}`,
    });
  }

  if (factors.length === 0 || Math.abs(costChangePercent) > 10) {
    factors.push({
      factor: 'pricing_changes',
      contribution_percent: Math.abs(costChangePercent) * 0.3,
      direction,
      explanation: 'Unit pricing may have changed between projections',
    });
  }

  return factors;
}

function generateRecommendation(result: InternalComparisonResult): string {
  const { cost_change_percent, resource_change_percent } = result.delta;

  if (cost_change_percent < -10) {
    return 'Cost reduction opportunity identified. Recommend proceeding with comparison scenario.';
  } else if (cost_change_percent > 20) {
    return 'Significant cost increase detected. Recommend reviewing resource requirements before proceeding.';
  } else if (Math.abs(cost_change_percent) <= 5 && Math.abs(resource_change_percent) <= 5) {
    return 'Minimal variance detected. Either scenario is financially equivalent.';
  }

  return 'Moderate variance detected. Recommend detailed analysis of variance factors before decision.';
}

function createErrorOutput(
  errors: string[],
  startTime: number,
  input: QuantifyCreateInput
): QuantifyCreateOutput {
  const environment = determineEnvironment(input);
  const synthesisEnv: SynthesisEnvironment = COMMIT_SHA
    ? {
        environment,
        timestamp: new Date().toISOString(),
        version: ENGINE_VERSION,
        commit_sha: COMMIT_SHA,
      }
    : {
        environment,
        timestamp: new Date().toISOString(),
        version: ENGINE_VERSION,
      };

  const metrics = {
    success_rate: 0,
    failed_iterations: errors.length,
    blocking_issues: errors.map((e, i) => ({
      code: `ERR_${i + 1}`,
      severity: 'error' as const,
      message: e,
    })),
  };

  let synthesis = buildExecutiveSummary(
    synthesisEnv,
    metrics,
    ['validation'],
    { errors, warnings: [] }
  );

  if (isProductionTarget(input)) {
    synthesis = elevateRiskForProduction(synthesis);
  }

  return {
    success: false,
    error: {
      code: 'CREATE_FAILED',
      message: errors.join('; '),
      details: { validation_errors: errors },
    },
    execution_time_ms: Date.now() - startTime,
    synthesis,
  };
}

function createCompareErrorOutput(
  errors: string[],
  startTime: number,
  input: QuantifyCompareInput
): QuantifyCompareOutput {
  const environment = determineEnvironment(input);
  const synthesisEnv: SynthesisEnvironment = COMMIT_SHA
    ? {
        environment,
        timestamp: new Date().toISOString(),
        version: ENGINE_VERSION,
        commit_sha: COMMIT_SHA,
      }
    : {
        environment,
        timestamp: new Date().toISOString(),
        version: ENGINE_VERSION,
      };

  const metrics = {
    success_rate: 0,
    failed_iterations: errors.length,
    blocking_issues: errors.map((e, i) => ({
      code: `ERR_${i + 1}`,
      severity: 'error' as const,
      message: e,
    })),
  };

  let synthesis = buildExecutiveSummary(
    synthesisEnv,
    metrics,
    ['validation'],
    { errors, warnings: [] }
  );

  if (isProductionTarget(input)) {
    synthesis = elevateRiskForProduction(synthesis);
  }

  return {
    success: false,
    error: {
      code: 'COMPARE_FAILED',
      message: errors.join('; '),
      details: { validation_errors: errors },
    },
    execution_time_ms: Date.now() - startTime,
    synthesis,
  };
}

// ============================================================================
// Simulated Data Access
// ============================================================================

async function getUnitCost(resourceType: string, _pricingSource?: string): Promise<number> {
  const pricing: Record<string, number> = {
    'compute-instance': 0.10,
    'storage-gb': 0.02,
    'network-egress-gb': 0.05,
    'database-instance': 0.15,
    'cache-instance': 0.08,
    'load-balancer': 0.025,
    'container-instance': 0.06,
  };

  return pricing[resourceType.toLowerCase()] ?? 0.05;
}

function calculateProjectionConfidence(unitCost: number): number {
  if (unitCost > 0) {
    return 0.85;
  }
  return 0.5;
}

async function fetchProjectionSummary(
  projectionId: string
): Promise<{ projection_id: string; name: string; total_monthly_cost: number; total_resources: number; created_at: string } | null> {
  return {
    projection_id: projectionId,
    name: `Projection ${projectionId}`,
    total_monthly_cost: Math.random() * 10000 + 1000,
    total_resources: Math.floor(Math.random() * 50) + 10,
    created_at: new Date().toISOString(),
  };
}

async function fetchProjections(
  _input: QuantifyListInput
): Promise<Array<{
  projection_id: string;
  name: string;
  status: 'active' | 'archived';
  total_monthly_cost: number;
  resource_count: number;
  created_at: string;
  updated_at: string;
}>> {
  return [
    {
      projection_id: 'proj-001',
      name: 'Production Infrastructure',
      status: 'active',
      total_monthly_cost: 5000,
      resource_count: 25,
      created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      projection_id: 'proj-002',
      name: 'Development Environment',
      status: 'active',
      total_monthly_cost: 1200,
      resource_count: 10,
      created_at: new Date(Date.now() - 14 * 86400000).toISOString(),
      updated_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    },
  ];
}

async function fetchProjectionById(
  projectionId: string
): Promise<{
  projection_id: string;
  name: string;
  description?: string;
  version: string;
  status: 'active' | 'archived';
  projections: {
    costs: CostProjectionOutput[];
    resources: ResourceProjectionOutput[];
  };
  totals: {
    monthly_cost: number;
    annual_cost: number;
    currency: string;
  };
  confidence: {
    level: number;
    lower_bound: number;
    upper_bound: number;
  };
  assumptions?: string[];
  created_at: string;
  updated_at: string;
} | null> {
  return {
    projection_id: projectionId,
    name: `Projection ${projectionId}`,
    description: 'Sample projection',
    version: '1.0',
    status: 'active',
    projections: {
      costs: [
        {
          category: 'compute',
          resource_type: 'compute-instance',
          quantity: 10,
          unit_cost: 0.10,
          total_cost: 1.00,
          currency: 'USD',
          period: 'monthly',
          confidence: 0.85,
        },
      ],
      resources: [
        {
          resource_type: 'compute-instance',
          quantity: 10,
          unit: 'instances',
          utilization_estimate: 0.75,
          scaling_factor: 1.0,
        },
      ],
    },
    totals: {
      monthly_cost: 1000,
      annual_cost: 12000,
      currency: 'USD',
    },
    confidence: {
      level: 0.85,
      lower_bound: 0.68,
      upper_bound: 1.0,
    },
    assumptions: [
      'Pricing based on current rates',
      'Utilization estimated at 75%',
    ],
    created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
  };
}

async function fetchProjectionHistory(
  _projectionId: string
): Promise<Array<{
  version: string;
  changed_at: string;
  changed_by?: string;
  change_summary: string;
}>> {
  return [
    {
      version: '1.0',
      changed_at: new Date(Date.now() - 7 * 86400000).toISOString(),
      changed_by: 'system',
      change_summary: 'Initial creation',
    },
  ];
}
