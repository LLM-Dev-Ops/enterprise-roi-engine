/**
 * Financial Artifact Output Contracts
 * Defines the schema for CFO-grade financial artifacts produced by the engine.
 */

import { z } from 'zod';
import {
  UUID,
  ISO8601,
  MonetaryValue,
  ConfidenceInterval,
  Percentage,
  SHA256Hash,
  MonetaryValueSchema,
  ConfidenceIntervalSchema,
} from './common';

// ============================================================================
// Input Manifest (for audit trail)
// ============================================================================

export interface InputManifest {
  readonly simulationId: UUID;
  readonly simulationChecksum: SHA256Hash;
  readonly erpMetadataChecksum: SHA256Hash;
  readonly costBaselineId: UUID;
  readonly costBaselineChecksum: SHA256Hash;
  readonly calculationParameters: CalculationParameters;
}

export interface CalculationParameters {
  readonly discountRate: number;
  readonly confidenceLevels: readonly number[];
  readonly timeHorizonMonths: number;
  readonly baseCurrency: string;
  readonly riskToleranceLevel: string;
}

export const CalculationParametersSchema = z.object({
  discountRate: z.number().min(0).max(1),
  confidenceLevels: z.array(z.number().min(0).max(100)),
  timeHorizonMonths: z.number().int().min(1).max(120),
  baseCurrency: z.string().length(3),
  riskToleranceLevel: z.string(),
});

export const InputManifestSchema = z.object({
  simulationId: z.string().uuid(),
  simulationChecksum: z.string().length(64),
  erpMetadataChecksum: z.string().length(64),
  costBaselineId: z.string().uuid(),
  costBaselineChecksum: z.string().length(64),
  calculationParameters: CalculationParametersSchema,
});

// ============================================================================
// Period Detail
// ============================================================================

export interface PeriodDetail {
  readonly periodNumber: number;
  readonly periodStart: ISO8601;
  readonly periodEnd: ISO8601;
  readonly projectedSavings: MonetaryValue;
  readonly projectedCosts: MonetaryValue;
  readonly netDelta: MonetaryValue;
  readonly cumulativeNetDelta: MonetaryValue;
  readonly discountFactor: number;
  readonly presentValue: MonetaryValue;
}

export const PeriodDetailSchema = z.object({
  periodNumber: z.number().int().min(1),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  projectedSavings: MonetaryValueSchema,
  projectedCosts: MonetaryValueSchema,
  netDelta: MonetaryValueSchema,
  cumulativeNetDelta: MonetaryValueSchema,
  discountFactor: z.number().min(0).max(1),
  presentValue: MonetaryValueSchema,
});

// ============================================================================
// Attribution Record
// ============================================================================

export interface AttributionRecord {
  readonly decisionId: UUID;
  readonly costCenterId: string;
  readonly costCenterName: string;
  readonly glAccountId: string;
  readonly glAccountName: string;
  readonly attributedAmount: MonetaryValue;
  readonly allocationPercentage: Percentage;
  readonly attributionMethod: string;
}

export const AttributionRecordSchema = z.object({
  decisionId: z.string().uuid(),
  costCenterId: z.string(),
  costCenterName: z.string(),
  glAccountId: z.string(),
  glAccountName: z.string(),
  attributedAmount: MonetaryValueSchema,
  allocationPercentage: z.number().min(0).max(1),
  attributionMethod: z.string(),
});

// ============================================================================
// Sensitivity Analysis
// ============================================================================

export interface SensitivityFactor {
  readonly factorName: string;
  readonly baseValue: number;
  readonly lowValue: number;
  readonly highValue: number;
  readonly impactOnNPV: MonetaryValue;
  readonly elasticity: number; // % change in output / % change in input
}

export interface SensitivityTable {
  readonly factors: readonly SensitivityFactor[];
  readonly tornadoOrder: readonly string[]; // Factor names ordered by impact
}

export const SensitivityFactorSchema = z.object({
  factorName: z.string(),
  baseValue: z.number(),
  lowValue: z.number(),
  highValue: z.number(),
  impactOnNPV: MonetaryValueSchema,
  elasticity: z.number(),
});

export const SensitivityTableSchema = z.object({
  factors: z.array(SensitivityFactorSchema),
  tornadoOrder: z.array(z.string()),
});

// ============================================================================
// Audit Record
// ============================================================================

export interface AuditRecord {
  readonly stepNumber: number;
  readonly timestamp: ISO8601;
  readonly operation: string;
  readonly inputHash: SHA256Hash;
  readonly outputHash: SHA256Hash;
  readonly details: Record<string, unknown>;
}

export const AuditRecordSchema = z.object({
  stepNumber: z.number().int().min(1),
  timestamp: z.string().datetime(),
  operation: z.string(),
  inputHash: z.string().length(64),
  outputHash: z.string().length(64),
  details: z.record(z.string(), z.unknown()),
});

// ============================================================================
// Financial Artifact Summary
// ============================================================================

export interface FinancialSummary {
  readonly totalInvestment: MonetaryValue;
  readonly totalBenefit: MonetaryValue;
  readonly netBenefit: MonetaryValue;
  readonly roi: Percentage;
  readonly roiMethodology: string;
  readonly paybackPeriodMonths: number | null; // null if never pays back
  readonly npv: MonetaryValue;
  readonly discountRate: Percentage;
  readonly irr: Percentage | null; // null if not calculable
  readonly confidenceInterval: ConfidenceInterval;
}

export const FinancialSummarySchema = z.object({
  totalInvestment: MonetaryValueSchema,
  totalBenefit: MonetaryValueSchema,
  netBenefit: MonetaryValueSchema,
  roi: z.number(),
  roiMethodology: z.string(),
  paybackPeriodMonths: z.number().nullable(),
  npv: MonetaryValueSchema,
  discountRate: z.number().min(0).max(1),
  irr: z.number().nullable(),
  confidenceInterval: ConfidenceIntervalSchema,
});

// ============================================================================
// Complete Financial Artifact
// ============================================================================

export interface FinancialArtifact {
  readonly artifactId: UUID;
  readonly generatedAt: ISO8601;
  readonly engineVersion: string;
  readonly inputManifest: InputManifest;
  readonly summary: FinancialSummary;
  readonly periodDetails: readonly PeriodDetail[];
  readonly attributions: readonly AttributionRecord[];
  readonly sensitivityAnalysis: SensitivityTable;
  readonly auditTrail: readonly AuditRecord[];
  readonly humanReadableSummary: string; // e.g., "This decision would save $X per year"
}

export const FinancialArtifactSchema = z.object({
  artifactId: z.string().uuid(),
  generatedAt: z.string().datetime(),
  engineVersion: z.string(),
  inputManifest: InputManifestSchema,
  summary: FinancialSummarySchema,
  periodDetails: z.array(PeriodDetailSchema),
  attributions: z.array(AttributionRecordSchema),
  sensitivityAnalysis: SensitivityTableSchema,
  auditTrail: z.array(AuditRecordSchema),
  humanReadableSummary: z.string(),
});

// ============================================================================
// Governance Payload
// ============================================================================

export interface ThresholdBreach {
  readonly thresholdName: string;
  readonly thresholdValue: number;
  readonly actualValue: number;
  readonly severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface ComplianceFlag {
  readonly flagId: string;
  readonly flagName: string;
  readonly description: string;
  readonly requiresReview: boolean;
}

export interface GovernancePayload {
  readonly artifactId: UUID;
  readonly approvalRequired: boolean;
  readonly thresholdBreaches: readonly ThresholdBreach[];
  readonly complianceFlags: readonly ComplianceFlag[];
  readonly attestationRequirements: readonly string[];
  readonly riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export const ThresholdBreachSchema = z.object({
  thresholdName: z.string(),
  thresholdValue: z.number(),
  actualValue: z.number(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
});

export const ComplianceFlagSchema = z.object({
  flagId: z.string(),
  flagName: z.string(),
  description: z.string(),
  requiresReview: z.boolean(),
});

export const GovernancePayloadSchema = z.object({
  artifactId: z.string().uuid(),
  approvalRequired: z.boolean(),
  thresholdBreaches: z.array(ThresholdBreachSchema),
  complianceFlags: z.array(ComplianceFlagSchema),
  attestationRequirements: z.array(z.string()),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
});

// ============================================================================
// Type guard
// ============================================================================

export function isValidFinancialArtifact(data: unknown): data is FinancialArtifact {
  return FinancialArtifactSchema.safeParse(data).success;
}
