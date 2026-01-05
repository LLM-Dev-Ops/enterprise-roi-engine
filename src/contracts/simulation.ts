/**
 * Simulation Engine Input Contracts
 * Defines the schema for data received from the Agentics simulation engine.
 */

import { z } from 'zod';
import {
  UUID,
  ISO8601,
  ResourceType,
  DeltaDirection,
  ResourceTypeSchema,
  DeltaDirectionSchema,
} from './common';

// ============================================================================
// Simulation Metadata
// ============================================================================

export interface SimulationMetadata {
  readonly simulationId: UUID;
  readonly engineVersion: string; // Semver
  readonly timestamp: ISO8601;
  readonly checksum: string; // SHA-256 of payload body
}

export const SimulationMetadataSchema = z.object({
  simulationId: z.string().uuid(),
  engineVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  timestamp: z.string().datetime(),
  checksum: z.string().length(64), // SHA-256 hex
});

// ============================================================================
// Scenario Configuration
// ============================================================================

export interface SimulationScenario {
  readonly name: string;
  readonly baselineId: UUID; // Reference to CostOps baseline
  readonly timeHorizonMonths: number;
  readonly confidenceLevel: number; // 0.0-1.0
}

export const SimulationScenarioSchema = z.object({
  name: z.string().min(1).max(256),
  baselineId: z.string().uuid(),
  timeHorizonMonths: z.number().int().min(1).max(120),
  confidenceLevel: z.number().min(0).max(1),
});

// ============================================================================
// Decision Node
// ============================================================================

export interface DecisionNode {
  readonly nodeId: UUID;
  readonly parentId: UUID | null;
  readonly decision: string;
  readonly probability: number; // Assigned by simulation
  readonly outcomeMetrics: Record<string, number>;
}

export const DecisionNodeSchema = z.object({
  nodeId: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  decision: z.string().min(1),
  probability: z.number().min(0).max(1),
  outcomeMetrics: z.record(z.string(), z.number()),
});

// ============================================================================
// Resource Delta
// ============================================================================

export interface ResourceDelta {
  readonly period: number; // 0-indexed from simulation start
  readonly resourceType: ResourceType;
  readonly quantity: number;
  readonly unit: string;
  readonly direction: DeltaDirection;
}

export const ResourceDeltaSchema = z.object({
  period: z.number().int().min(0),
  resourceType: ResourceTypeSchema,
  quantity: z.number(),
  unit: z.string().min(1),
  direction: DeltaDirectionSchema,
});

// ============================================================================
// Workflow Trace
// ============================================================================

export interface WorkflowTrace {
  readonly traceId: UUID;
  readonly workflowName: string;
  readonly steps: WorkflowStep[];
  readonly totalDuration: number; // milliseconds
}

export interface WorkflowStep {
  readonly stepId: UUID;
  readonly stepName: string;
  readonly duration: number; // milliseconds
  readonly resourcesConsumed: Record<string, number>;
}

export const WorkflowStepSchema = z.object({
  stepId: z.string().uuid(),
  stepName: z.string().min(1),
  duration: z.number().min(0),
  resourcesConsumed: z.record(z.string(), z.number()),
});

export const WorkflowTraceSchema = z.object({
  traceId: z.string().uuid(),
  workflowName: z.string().min(1),
  steps: z.array(WorkflowStepSchema),
  totalDuration: z.number().min(0),
});

// ============================================================================
// Confidence Intervals from Simulation
// ============================================================================

export interface SimulationConfidenceIntervals {
  readonly metricName: string;
  readonly p10: number;
  readonly p25: number;
  readonly p50: number;
  readonly p75: number;
  readonly p90: number;
}

export const SimulationConfidenceIntervalsSchema = z.object({
  metricName: z.string().min(1),
  p10: z.number(),
  p25: z.number(),
  p50: z.number(),
  p75: z.number(),
  p90: z.number(),
});

// ============================================================================
// Complete Simulation Output
// ============================================================================

export interface SimulationOutput {
  readonly metadata: SimulationMetadata;
  readonly scenario: SimulationScenario;
  readonly decisions: readonly DecisionNode[];
  readonly resourceDeltas: readonly ResourceDelta[];
  readonly workflowTraces: readonly WorkflowTrace[];
  readonly confidenceIntervals: readonly SimulationConfidenceIntervals[];
}

export const SimulationOutputSchema = z.object({
  metadata: SimulationMetadataSchema,
  scenario: SimulationScenarioSchema,
  decisions: z.array(DecisionNodeSchema),
  resourceDeltas: z.array(ResourceDeltaSchema),
  workflowTraces: z.array(WorkflowTraceSchema),
  confidenceIntervals: z.array(SimulationConfidenceIntervalsSchema),
});

// ============================================================================
// Type guard
// ============================================================================

export function isValidSimulationOutput(data: unknown): data is SimulationOutput {
  return SimulationOutputSchema.safeParse(data).success;
}
