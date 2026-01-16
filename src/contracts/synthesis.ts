/**
 * Executive Synthesis Types
 * Defines the schema for executive-synthesis-compatible output fields.
 * These types enable the ROI engine to produce output that integrates
 * seamlessly with executive synthesis and CFO-grade reporting systems.
 */

import { z } from 'zod';
import { UUID, ISO8601, SHA256Hash } from './common';

// ============================================================================
// Synthesis Status
// ============================================================================

/**
 * Status of a quantification reference analysis.
 */
export type SynthesisStatus = 'completed' | 'partial' | 'failed';

/**
 * Category of the analysis report for routing.
 */
export type ReportCategory = 'cfo-grade' | 'executive-summary' | 'technical-deep-dive' | 'enterprise';

// ============================================================================
// Step Execution Types
// ============================================================================

/**
 * Status of an individual analysis step.
 */
export type StepStatus = 'success' | 'failed' | 'skipped' | 'pending';

/**
 * Record of a single analysis step execution.
 */
export interface StepExecution {
  readonly stepId: string;
  readonly action: string;
  readonly status: StepStatus;
  readonly duration_ms: number;
  readonly details?: Record<string, unknown>;
}

export const StepExecutionSchema = z.object({
  stepId: z.string().min(1),
  action: z.string().min(1),
  status: z.enum(['success', 'failed', 'skipped', 'pending']),
  duration_ms: z.number().nonnegative(),
  details: z.record(z.string(), z.unknown()).optional(),
});

// ============================================================================
// Synthesis Metrics
// ============================================================================

/**
 * Core financial metrics for executive synthesis.
 */
export interface SynthesisMetrics {
  readonly projected_roi: number;
  readonly payback_months: number | null;
  readonly confidence_interval: readonly [number, number];
  readonly risk_adjusted_npv: number;
}

export const SynthesisMetricsSchema = z.object({
  projected_roi: z.number(),
  payback_months: z.number().nullable(),
  confidence_interval: z.tuple([z.number(), z.number()]),
  risk_adjusted_npv: z.number(),
});

// ============================================================================
// Synthesis Results
// ============================================================================

/**
 * Aggregated results from ROI analysis for synthesis.
 */
export interface SynthesisResults {
  readonly total_iterations: number;
  readonly successful_iterations: number;
  readonly failed_iterations: number;
  readonly success_rate: number;
  readonly average_duration_ms: number;
  readonly metrics: SynthesisMetrics;
}

export const SynthesisResultsSchema = z.object({
  total_iterations: z.number().int().nonnegative(),
  successful_iterations: z.number().int().nonnegative(),
  failed_iterations: z.number().int().nonnegative(),
  success_rate: z.number().min(0).max(1),
  average_duration_ms: z.number().nonnegative(),
  metrics: SynthesisMetricsSchema,
});

// ============================================================================
// Synthesis Scenario
// ============================================================================

/**
 * Scenario metadata for the analysis.
 */
export interface SynthesisScenario {
  readonly scenarioId: string;
  readonly name: string;
  readonly description: string;
  readonly category: ReportCategory;
  readonly version: string;
}

export const SynthesisScenarioSchema = z.object({
  scenarioId: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  category: z.enum(['cfo-grade', 'executive-summary', 'technical-deep-dive', 'enterprise']),
  version: z.string(),
});

// ============================================================================
// Execution Metadata
// ============================================================================

/**
 * Metadata about the analysis execution.
 */
export interface SynthesisExecutionMetadata {
  readonly execution_id: UUID;
  readonly layer: 'quantification';
  readonly timestamp: ISO8601;
  readonly trace_id: string;
  readonly checksum: SHA256Hash;
}

export const SynthesisExecutionMetadataSchema = z.object({
  execution_id: z.string().uuid(),
  layer: z.literal('quantification'),
  timestamp: z.string().datetime(),
  trace_id: z.string().min(1),
  checksum: z.string().length(64),
});

// ============================================================================
// Quantify Reference (Complete Synthesis-Compatible Output)
// ============================================================================

/**
 * Complete executive-synthesis-compatible output structure.
 * This wraps ROI engine output in a format suitable for executive synthesis.
 */
export interface QuantifyReference {
  readonly id: string;
  readonly type: 'QuantifyReference';
  readonly repository: string;
  readonly status: SynthesisStatus;
  readonly created_at: ISO8601;
  readonly completed_at: ISO8601;
  readonly iteration_count: number;
  readonly results: SynthesisResults;
  readonly scenario: SynthesisScenario;
  readonly steps_executed: readonly StepExecution[];
  readonly execution_metadata: SynthesisExecutionMetadata;
}

export const QuantifyReferenceSchema = z.object({
  id: z.string().regex(/^roi-[a-z0-9]+$/),
  type: z.literal('QuantifyReference'),
  repository: z.string().min(1),
  status: z.enum(['completed', 'partial', 'failed']),
  created_at: z.string().datetime(),
  completed_at: z.string().datetime(),
  iteration_count: z.number().int().nonnegative(),
  results: SynthesisResultsSchema,
  scenario: SynthesisScenarioSchema,
  steps_executed: z.array(StepExecutionSchema),
  execution_metadata: SynthesisExecutionMetadataSchema,
});

// ============================================================================
// Type Guards
// ============================================================================

export function isValidQuantifyReference(data: unknown): data is QuantifyReference {
  return QuantifyReferenceSchema.safeParse(data).success;
}

export function isValidSynthesisResults(data: unknown): data is SynthesisResults {
  return SynthesisResultsSchema.safeParse(data).success;
}
