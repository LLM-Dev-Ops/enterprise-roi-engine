/**
 * Internal Types
 * Types used for internal processing, not exposed externally.
 */

import {
  UUID,
  ISO8601,
  DecisionCategory,
  AllocationMethod,
  ImpactType,
  FiscalPeriod,
  SHA256Hash,
} from './common';

// ============================================================================
// Canonical Decision Record (normalized internal representation)
// ============================================================================

export interface CanonicalDecisionRecord {
  readonly recordId: UUID;
  readonly sourceDecisionId: string;
  readonly decisionTimestamp: ISO8601;
  readonly decisionCategory: DecisionCategory;
  readonly primaryCostCenterId: string;
  readonly secondaryCostCenters: readonly CostCenterAllocation[];
  readonly glAccountImpacts: readonly GLAccountImpact[];
  readonly grossImpactAmount: string; // Decimal string in base currency
  readonly confidenceScore: number; // 0.0 to 1.0
  readonly impactHorizonMonths: number;
  readonly riskCategoryId: string;
  readonly volatilityScore: number;
  readonly sourceSystem: string;
  readonly normalizationTimestamp: ISO8601;
  readonly rawChecksum: SHA256Hash;
}

export interface CostCenterAllocation {
  readonly costCenterId: string;
  readonly allocationPercentage: number; // 0-100, must sum to 100
  readonly allocationMethod: AllocationMethod;
}

export interface GLAccountImpact {
  readonly glAccountId: string;
  readonly impactType: ImpactType;
  readonly amount: string; // Decimal string
  readonly period: FiscalPeriod;
}

// ============================================================================
// Normalized Dataset (output of normalization layer)
// ============================================================================

export interface NormalizedDataset {
  readonly normalizationId: UUID;
  readonly decisions: readonly CanonicalDecisionRecord[];
  readonly recordCount: number;
  readonly normalizationTimestamp: ISO8601;
  readonly baseCurrency: string;
  readonly inputChecksums: InputChecksums;
}

export interface InputChecksums {
  readonly simulationChecksum: SHA256Hash;
  readonly erpMetadataChecksum: SHA256Hash;
  readonly costBaselineChecksum: SHA256Hash;
}

// ============================================================================
// Attribution Types
// ============================================================================

export interface PrimaryAttribution {
  readonly decisionRecordId: UUID;
  readonly costCenterId: string;
  readonly costCenterName: string;
  readonly costCenterLevel: number;
  readonly attributedAmount: string; // Decimal string
  readonly fiscalPeriod: FiscalPeriod;
  readonly attributionBasis: string;
  readonly originalAmount: string;
  readonly adjustmentFactor: number;
}

export interface OverheadAttribution {
  readonly decisionRecordId: UUID;
  readonly costCenterId: string;
  readonly directAmount: string;
  readonly indirectOverhead: string;
  readonly sharedServicesOverhead: string;
  readonly totalOverhead: string;
  readonly fullyLoadedAmount: string;
  readonly overheadRateVersion: string;
}

export interface DistributedAttribution {
  readonly costCenterId: string;
  readonly amount: string; // Decimal string
  readonly allocationPercentage: number;
  readonly allocationType: 'PRIMARY' | 'SECONDARY';
  readonly allocationMethod?: AllocationMethod;
}

export interface AttributionChain {
  readonly decisionRecordId: UUID;
  readonly primaryAttribution: PrimaryAttribution;
  readonly overheadAttribution: OverheadAttribution;
  readonly distributedAttributions: readonly DistributedAttribution[];
  readonly totalAttributedAmount: string;
  readonly attributionMethod: string;
  readonly attributionTimestamp: ISO8601;
}

export interface AttributionResult {
  readonly attributionId: UUID;
  readonly attributionChains: readonly AttributionChain[];
  readonly costCenterSummaries: Map<string, CostCenterSummary>;
  readonly glAccountSummaries: Map<string, GLAccountSummary>;
  readonly totalAttributedValue: string;
  readonly timestamp: ISO8601;
}

export interface CostCenterSummary {
  readonly costCenterId: string;
  readonly totalSavings: string;
  readonly totalCosts: string;
  readonly decisionCount: number;
}

export interface GLAccountSummary {
  readonly glAccountId: string;
  readonly totalDebits: string;
  readonly totalCredits: string;
  readonly netAmount: string;
}

// ============================================================================
// Financial Delta Types
// ============================================================================

export interface GrossDelta {
  readonly decisionRecordId: UUID;
  readonly totalSavings: string;
  readonly totalCosts: string;
  readonly netDelta: string;
  readonly savingsToCostRatio: number | null; // null if costs are zero
}

export interface RiskAdjustedDelta {
  readonly decisionRecordId: UUID;
  readonly grossNetDelta: string;
  readonly adjustedSavings: string;
  readonly adjustedCosts: string;
  readonly adjustedNetDelta: string;
  readonly riskFactor: number;
  readonly riskComponents: RiskComponents;
  readonly riskCategory: string;
}

export interface RiskComponents {
  readonly baseWeight: number;
  readonly confidenceFactor: number;
  readonly volatilityAdjustment: number;
}

export interface TimeAdjustedDelta {
  readonly decisionRecordId: UUID;
  readonly undiscountedDelta: string;
  readonly presentValue: string;
  readonly discountFactor: number;
  readonly horizonMonths: number;
  readonly monthlyDiscountRate: number;
  readonly annualizedValue: string;
}

export interface ConfidenceIntervals {
  readonly baseValue: string;
  readonly intervals: Map<number, IntervalBounds>;
  readonly p10Value: string;
  readonly p50Value: string;
  readonly p90Value: string;
  readonly uncertaintyFactor: number;
}

export interface IntervalBounds {
  readonly confidenceLevel: number;
  readonly lowerBound: string;
  readonly upperBound: string;
  readonly margin: string;
}

export interface FinancialDelta {
  readonly decisionRecordId: UUID;
  readonly grossDelta: GrossDelta;
  readonly riskAdjustedDelta: RiskAdjustedDelta;
  readonly timeAdjustedDelta: TimeAdjustedDelta;
  readonly confidenceIntervals: ConfidenceIntervals;
  readonly deltaType: 'SAVINGS' | 'COST' | 'NEUTRAL';
  readonly calculationTimestamp: ISO8601;
}

export interface PortfolioMetrics {
  readonly totalGrossSavings: string;
  readonly totalRiskAdjustedSavings: string;
  readonly totalPresentValue: string;
  readonly averageRiskAdjustmentFactor: number;
  readonly averageDiscountFactor: number;
  readonly weightedUncertaintyFactor: number;
  readonly decisionCount: number;
  readonly positiveNPVCount: number;
  readonly calculationTimestamp: ISO8601;
}

export interface FinancialDeltaResult {
  readonly calculationId: UUID;
  readonly deltas: readonly FinancialDelta[];
  readonly portfolioMetrics: PortfolioMetrics;
  readonly timestamp: ISO8601;
}

// ============================================================================
// Execution Types
// ============================================================================

export interface ExecutionMetrics {
  readonly decisionsProcessed: number;
  readonly totalSavingsIdentified: string;
  readonly executionDurationMs: number;
  readonly phasesCompleted: number;
}

export interface ExecutionResult {
  readonly executionId: UUID;
  readonly status: 'SUCCESS' | 'FAILED';
  readonly artifactBundle?: ArtifactBundle;
  readonly error?: Error;
  readonly metrics?: ExecutionMetrics;
  readonly startTime: ISO8601;
  readonly endTime: ISO8601;
}

export interface ArtifactBundle {
  readonly bundleId: UUID;
  readonly artifacts: readonly Artifact[];
  readonly generationTimestamp: ISO8601;
  readonly sourceSimulationId: string;
  readonly schemaVersion: string;
  readonly checksum: SHA256Hash;
}

export interface Artifact {
  readonly artifactType: ArtifactType;
  readonly content: unknown;
  readonly format: 'JSON';
  readonly schemaVersion: string;
}

export enum ArtifactType {
  EXECUTIVE_SUMMARY = 'EXECUTIVE_SUMMARY',
  SAVINGS_PROJECTION = 'SAVINGS_PROJECTION',
  RISK_DELTA_REPORT = 'RISK_DELTA_REPORT',
  COST_CENTER_BREAKDOWN = 'COST_CENTER_BREAKDOWN',
  AUDIT_TRAIL = 'AUDIT_TRAIL',
  GL_JOURNAL_ENTRIES = 'GL_JOURNAL_ENTRIES',
  FINANCIAL_ARTIFACT = 'FINANCIAL_ARTIFACT',
}
