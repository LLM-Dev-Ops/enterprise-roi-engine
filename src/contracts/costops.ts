/**
 * CostOps Baseline Input Contracts
 * Defines the schema for baseline cost models from CostOps.
 * Note: This is READ-ONLY consumption. The engine never writes to CostOps.
 */

import { z } from 'zod';
import { UUID, ISO8601, CurrencyCode } from './common';

// ============================================================================
// Labor Rate
// ============================================================================

export interface LaborRate {
  readonly roleId: string;
  readonly roleName: string;
  readonly fullyLoadedRate: string; // Decimal string, per hour
  readonly currency: CurrencyCode;
  readonly effectiveDate: ISO8601;
}

export const LaborRateSchema = z.object({
  roleId: z.string().min(1),
  roleName: z.string().min(1).max(256),
  fullyLoadedRate: z.string().regex(/^\d+(\.\d{1,4})?$/),
  currency: z.string().length(3),
  effectiveDate: z.string().datetime(),
});

// ============================================================================
// Infrastructure Cost
// ============================================================================

export interface InfrastructureCost {
  readonly resourceType: string;
  readonly unitCost: string; // Decimal string
  readonly unit: string; // e.g., "per-hour", "per-GB-month"
  readonly currency: CurrencyCode;
  readonly effectiveDate: ISO8601;
}

export const InfrastructureCostSchema = z.object({
  resourceType: z.string().min(1),
  unitCost: z.string().regex(/^\d+(\.\d{1,4})?$/),
  unit: z.string().min(1),
  currency: z.string().length(3),
  effectiveDate: z.string().datetime(),
});

// ============================================================================
// License Cost
// ============================================================================

export interface LicenseCost {
  readonly licenseType: string;
  readonly vendorName: string;
  readonly annualCost: string; // Decimal string
  readonly perUserCost: string; // Decimal string
  readonly currency: CurrencyCode;
  readonly effectiveDate: ISO8601;
}

export const LicenseCostSchema = z.object({
  licenseType: z.string().min(1),
  vendorName: z.string().min(1),
  annualCost: z.string().regex(/^\d+(\.\d{1,4})?$/),
  perUserCost: z.string().regex(/^\d+(\.\d{1,4})?$/),
  currency: z.string().length(3),
  effectiveDate: z.string().datetime(),
});

// ============================================================================
// Overhead Factor
// ============================================================================

export interface OverheadFactor {
  readonly costCenterId: string;
  readonly directRate: number; // Percentage as decimal (0.0-1.0)
  readonly indirectRate: number;
  readonly sharedServicesRate: number;
  readonly effectiveDate: ISO8601;
}

export const OverheadFactorSchema = z.object({
  costCenterId: z.string().min(1),
  directRate: z.number().min(0).max(1),
  indirectRate: z.number().min(0).max(1),
  sharedServicesRate: z.number().min(0).max(1),
  effectiveDate: z.string().datetime(),
});

// ============================================================================
// Risk Weight Matrix
// ============================================================================

export interface RiskWeightMatrix {
  readonly categoryId: string;
  readonly categoryName: string;
  readonly baseWeight: number; // Base risk multiplier
  readonly volatilityMultiplier: number;
  readonly confidenceDecayRate: number;
  readonly maxWeight: number; // Ceiling
}

export const RiskWeightMatrixSchema = z.object({
  categoryId: z.string().min(1),
  categoryName: z.string().min(1),
  baseWeight: z.number().min(0),
  volatilityMultiplier: z.number().min(0),
  confidenceDecayRate: z.number().min(0).max(1),
  maxWeight: z.number().min(0),
});

// ============================================================================
// Volume Tier (for tiered pricing)
// ============================================================================

export interface VolumeTier {
  readonly minVolume: number;
  readonly maxVolume: number | null; // null = unlimited
  readonly rate: string; // Decimal string
}

export const VolumeTierSchema = z.object({
  minVolume: z.number().min(0),
  maxVolume: z.number().nullable(),
  rate: z.string().regex(/^\d+(\.\d{1,4})?$/),
});

// ============================================================================
// Unit Cost Schedule
// ============================================================================

export interface UnitCostSchedule {
  readonly resourceType: string;
  readonly baseCost: string; // Decimal string
  readonly volumeTiers: readonly VolumeTier[];
  readonly currency: CurrencyCode;
  readonly effectiveDate: ISO8601;
}

export const UnitCostScheduleSchema = z.object({
  resourceType: z.string().min(1),
  baseCost: z.string().regex(/^\d+(\.\d{1,4})?$/),
  volumeTiers: z.array(VolumeTierSchema),
  currency: z.string().length(3),
  effectiveDate: z.string().datetime(),
});

// ============================================================================
// Complete Cost Baseline
// ============================================================================

export interface CostBaseline {
  readonly baselineId: UUID;
  readonly snapshotTimestamp: ISO8601;
  readonly costModelVersion: string;
  readonly laborRates: readonly LaborRate[];
  readonly infrastructureCosts: readonly InfrastructureCost[];
  readonly licenseCosts: readonly LicenseCost[];
  readonly overheadFactors: readonly OverheadFactor[];
  readonly riskWeights: readonly RiskWeightMatrix[];
  readonly discountRate: number; // Annual discount rate for NPV
  readonly baselinePeriod: string; // e.g., "FY2024"
}

export const CostBaselineSchema = z.object({
  baselineId: z.string().uuid(),
  snapshotTimestamp: z.string().datetime(),
  costModelVersion: z.string().min(1),
  laborRates: z.array(LaborRateSchema),
  infrastructureCosts: z.array(InfrastructureCostSchema),
  licenseCosts: z.array(LicenseCostSchema),
  overheadFactors: z.array(OverheadFactorSchema),
  riskWeights: z.array(RiskWeightMatrixSchema),
  discountRate: z.number().min(0).max(1),
  baselinePeriod: z.string().min(1),
});

// ============================================================================
// Type guard
// ============================================================================

export function isValidCostBaseline(data: unknown): data is CostBaseline {
  return CostBaselineSchema.safeParse(data).success;
}

// ============================================================================
// Default Risk Matrix (fallback when category not found)
// ============================================================================

export const DEFAULT_RISK_MATRIX: RiskWeightMatrix = {
  categoryId: 'DEFAULT',
  categoryName: 'Default Risk Category',
  baseWeight: 1.0,
  volatilityMultiplier: 0.5,
  confidenceDecayRate: 0.3,
  maxWeight: 2.5,
};
