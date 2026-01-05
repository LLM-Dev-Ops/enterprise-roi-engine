/**
 * ERP Surface Input Contracts
 * Defines the schema for ERP metadata received from erp-surface.
 * Note: This is ERP-agnostic normalized data, NOT ERP-specific implementations.
 */

import { z } from 'zod';
import {
  ISO8601,
  CurrencyCode,
  AccountType,
  NaturalSign,
  FiscalPeriod,
  AccountTypeSchema,
  NaturalSignSchema,
  FiscalPeriodSchema,
} from './common';

// ============================================================================
// Entity Mapping
// ============================================================================

export interface EntityMapping {
  readonly erpEntityId: string; // Native ERP identifier (normalized by erp-surface)
  readonly entityType: EntityType;
  readonly displayName: string;
  readonly parentId: string | null;
  readonly attributes: Record<string, string>;
}

export enum EntityType {
  COST_CENTER = 'COST_CENTER',
  DEPARTMENT = 'DEPARTMENT',
  PROJECT = 'PROJECT',
  BUSINESS_UNIT = 'BUSINESS_UNIT',
  LEGAL_ENTITY = 'LEGAL_ENTITY',
}

export const EntityTypeSchema = z.nativeEnum(EntityType);

export const EntityMappingSchema = z.object({
  erpEntityId: z.string().min(1),
  entityType: EntityTypeSchema,
  displayName: z.string().min(1).max(256),
  parentId: z.string().nullable(),
  attributes: z.record(z.string(), z.string()),
});

// ============================================================================
// GL Account
// ============================================================================

export interface GLAccount {
  readonly accountId: string;
  readonly accountName: string;
  readonly accountType: AccountType;
  readonly naturalSign: NaturalSign;
  readonly currency: CurrencyCode;
  readonly isActive: boolean;
}

export const GLAccountSchema = z.object({
  accountId: z.string().min(1),
  accountName: z.string().min(1).max(256),
  accountType: AccountTypeSchema,
  naturalSign: NaturalSignSchema,
  currency: z.string().length(3),
  isActive: z.boolean(),
});

// ============================================================================
// Cost Center
// ============================================================================

export interface CostCenter {
  readonly costCenterId: string;
  readonly name: string;
  readonly parentCostCenterId: string | null;
  readonly hierarchyLevel: number;
  readonly acceptsDirectCharges: boolean;
  readonly currency: CurrencyCode;
  readonly isActive: boolean;
}

export const CostCenterSchema = z.object({
  costCenterId: z.string().min(1),
  name: z.string().min(1).max(256),
  parentCostCenterId: z.string().nullable(),
  hierarchyLevel: z.number().int().min(0),
  acceptsDirectCharges: z.boolean(),
  currency: z.string().length(3),
  isActive: z.boolean(),
});

// ============================================================================
// Complete ERP Metadata
// ============================================================================

export interface ERPMetadata {
  readonly erpSystem: string; // e.g., "SAP", "Oracle", "NetSuite" - for tracing only
  readonly erpVersion: string;
  readonly extractTimestamp: ISO8601;
  readonly entities: readonly EntityMapping[];
  readonly chartOfAccounts: readonly GLAccount[];
  readonly costCenters: readonly CostCenter[];
  readonly fiscalCalendar: readonly FiscalPeriod[];
  readonly reportingCurrency: CurrencyCode;
}

export const ERPMetadataSchema = z.object({
  erpSystem: z.string().min(1),
  erpVersion: z.string().min(1),
  extractTimestamp: z.string().datetime(),
  entities: z.array(EntityMappingSchema),
  chartOfAccounts: z.array(GLAccountSchema),
  costCenters: z.array(CostCenterSchema),
  fiscalCalendar: z.array(FiscalPeriodSchema),
  reportingCurrency: z.string().length(3),
});

// ============================================================================
// Cost Center Assignment (for entity-to-cost-center mapping)
// ============================================================================

export interface CostCenterAssignment {
  readonly entityId: string;
  readonly costCenterId: string;
  readonly allocationPercentage: number; // 0-100
  readonly effectiveFrom: ISO8601;
  readonly effectiveTo: ISO8601 | null;
}

export const CostCenterAssignmentSchema = z.object({
  entityId: z.string().min(1),
  costCenterId: z.string().min(1),
  allocationPercentage: z.number().min(0).max(100),
  effectiveFrom: z.string().datetime(),
  effectiveTo: z.string().datetime().nullable(),
});

// ============================================================================
// Type guard
// ============================================================================

export function isValidERPMetadata(data: unknown): data is ERPMetadata {
  return ERPMetadataSchema.safeParse(data).success;
}
