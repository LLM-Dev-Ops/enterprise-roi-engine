/**
 * CLI Types for Quantify Commands
 *
 * Defines input/output types for the agentics quantify CLI commands.
 */

import type { DecisionPacket } from '../synthesis';

// ============================================================================
// Command Input Types
// ============================================================================

/**
 * Input for quantify create command.
 */
export interface QuantifyCreateInput {
  readonly name: string;
  readonly description?: string;
  readonly target_environment?: 'development' | 'staging' | 'production';
  readonly resources: readonly ResourceInput[];
  readonly time_horizon_months?: number;
  readonly baseline_id?: string;
  readonly pricing_source?: string;
}

/**
 * Resource input for cost projection.
 */
export interface ResourceInput {
  readonly resource_type: string;
  readonly quantity: number;
  readonly unit: string;
  readonly category?: string;
  readonly tags?: readonly string[];
}

/**
 * Input for quantify compare command.
 */
export interface QuantifyCompareInput {
  readonly baseline_id: string;
  readonly comparison_id: string;
  readonly target_environment?: 'development' | 'staging' | 'production';
  readonly comparison_type?: 'cost' | 'resource' | 'full';
  readonly include_variance_analysis?: boolean;
}

/**
 * Input for quantify list command.
 */
export interface QuantifyListInput {
  readonly filter?: {
    readonly status?: 'active' | 'archived' | 'all';
    readonly created_after?: string;
    readonly created_before?: string;
    readonly name_contains?: string;
  };
  readonly limit?: number;
  readonly offset?: number;
}

/**
 * Input for quantify inspect command.
 */
export interface QuantifyInspectInput {
  readonly projection_id: string;
  readonly include_history?: boolean;
  readonly include_assumptions?: boolean;
}

// ============================================================================
// Command Output Types
// ============================================================================

/**
 * Base command result structure.
 */
export interface CommandResult<T = unknown> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: {
    readonly code: string;
    readonly message: string;
    readonly details?: unknown;
  };
  readonly warnings?: readonly string[];
  readonly execution_time_ms: number;
}

/**
 * Output for quantify create command (includes synthesis).
 */
export interface QuantifyCreateOutput extends CommandResult<{
  readonly projection_id: string;
  readonly version: string;
  readonly projections: {
    readonly costs: readonly CostProjectionOutput[];
    readonly resources: readonly ResourceProjectionOutput[];
  };
  readonly totals: {
    readonly monthly_cost: number;
    readonly annual_cost: number;
    readonly currency: string;
  };
  readonly confidence: {
    readonly level: number;
    readonly lower_bound: number;
    readonly upper_bound: number;
  };
  readonly created_at: string;
}> {
  readonly synthesis: DecisionPacket;
}

/**
 * Cost projection output detail.
 */
export interface CostProjectionOutput {
  readonly category: string;
  readonly resource_type: string;
  readonly quantity: number;
  readonly unit_cost: number;
  readonly total_cost: number;
  readonly currency: string;
  readonly period: 'monthly' | 'annual';
  readonly confidence: number;
}

/**
 * Resource projection output detail.
 */
export interface ResourceProjectionOutput {
  readonly resource_type: string;
  readonly quantity: number;
  readonly unit: string;
  readonly utilization_estimate: number;
  readonly scaling_factor: number;
}

/**
 * Output for quantify compare command (includes synthesis).
 */
export interface QuantifyCompareOutput extends CommandResult<{
  readonly comparison_id: string;
  readonly baseline: ProjectionSummary;
  readonly comparison: ProjectionSummary;
  readonly delta: {
    readonly cost_change: number;
    readonly cost_change_percent: number;
    readonly resource_change: number;
    readonly resource_change_percent: number;
  };
  readonly variance_analysis?: {
    readonly factors: readonly VarianceFactor[];
    readonly primary_driver: string;
    readonly confidence: number;
  };
  readonly recommendation?: string;
  readonly created_at: string;
}> {
  readonly synthesis: DecisionPacket;
}

/**
 * Summary of a projection for comparison.
 */
export interface ProjectionSummary {
  readonly projection_id: string;
  readonly name: string;
  readonly total_monthly_cost: number;
  readonly total_resources: number;
  readonly created_at: string;
}

/**
 * Variance factor in comparison analysis.
 */
export interface VarianceFactor {
  readonly factor: string;
  readonly contribution_percent: number;
  readonly direction: 'increase' | 'decrease';
  readonly explanation: string;
}

/**
 * Output for quantify list command (NO synthesis - read-only).
 */
export interface QuantifyListOutput extends CommandResult<{
  readonly projections: readonly ProjectionListItem[];
  readonly total_count: number;
  readonly offset: number;
  readonly limit: number;
}> {
  // Explicitly no synthesis field - read-only operation
}

/**
 * Item in projection list.
 */
export interface ProjectionListItem {
  readonly projection_id: string;
  readonly name: string;
  readonly status: 'active' | 'archived';
  readonly total_monthly_cost: number;
  readonly resource_count: number;
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * Output for quantify inspect command (NO synthesis - read-only).
 */
export interface QuantifyInspectOutput extends CommandResult<{
  readonly projection: {
    readonly projection_id: string;
    readonly name: string;
    readonly description?: string;
    readonly version: string;
    readonly status: 'active' | 'archived';
    readonly projections: {
      readonly costs: readonly CostProjectionOutput[];
      readonly resources: readonly ResourceProjectionOutput[];
    };
    readonly totals: {
      readonly monthly_cost: number;
      readonly annual_cost: number;
      readonly currency: string;
    };
    readonly confidence: {
      readonly level: number;
      readonly lower_bound: number;
      readonly upper_bound: number;
    };
    readonly created_at: string;
    readonly updated_at: string;
  };
  readonly history?: readonly ProjectionHistoryItem[];
  readonly assumptions?: readonly string[];
}> {
  // Explicitly no synthesis field - read-only operation
}

/**
 * Historical change item.
 */
export interface ProjectionHistoryItem {
  readonly version: string;
  readonly changed_at: string;
  readonly changed_by?: string;
  readonly change_summary: string;
}

// ============================================================================
// Internal Types
// ============================================================================

/**
 * Internal result type before synthesis is applied.
 */
export interface InternalQuantifyResult {
  readonly id: string;
  readonly version: string;
  readonly projections: {
    readonly costs: readonly CostProjectionOutput[];
    readonly resources: readonly ResourceProjectionOutput[];
  };
  readonly totals: {
    readonly monthly_cost: number;
    readonly annual_cost: number;
    readonly currency: string;
  };
  readonly confidence: {
    readonly level: number;
    readonly lower_bound: number;
    readonly upper_bound: number;
  };
  readonly data_timestamps: {
    readonly pricing: string;
    readonly resources: string;
    readonly baseline: string;
  };
  readonly assumptions: readonly string[];
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

/**
 * Internal comparison result before synthesis.
 */
export interface InternalComparisonResult {
  readonly comparison_id: string;
  readonly baseline: ProjectionSummary;
  readonly comparison: ProjectionSummary;
  readonly delta: {
    readonly cost_change: number;
    readonly cost_change_percent: number;
    readonly resource_change: number;
    readonly resource_change_percent: number;
  };
  readonly variance_factors: readonly VarianceFactor[];
  readonly methodology: string;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}
