/**
 * Common types used across the enterprise-roi-engine.
 * These are foundational types that other contracts depend on.
 */

import { z } from 'zod';

// ============================================================================
// Primitive Types
// ============================================================================

export type UUID = string;
export type ISO8601 = string;
export type CurrencyCode = string; // ISO 4217
export type Percentage = number; // 0.0 to 1.0

// ============================================================================
// Monetary Value
// ============================================================================

export interface MonetaryValue {
  readonly amount: string; // Decimal string for precision (4 decimal places)
  readonly currency: CurrencyCode;
  readonly asOfDate: ISO8601;
}

export const MonetaryValueSchema = z.object({
  amount: z.string().regex(/^-?\d+(\.\d{1,4})?$/),
  currency: z.string().length(3),
  asOfDate: z.string().datetime(),
});

// ============================================================================
// Confidence Interval
// ============================================================================

export interface ConfidenceInterval {
  readonly confidenceLevel: number; // e.g., 90 for 90%
  readonly lowerBound: string; // Decimal string
  readonly upperBound: string; // Decimal string
  readonly margin: string; // Decimal string
}

export const ConfidenceIntervalSchema = z.object({
  confidenceLevel: z.number().min(0).max(100),
  lowerBound: z.string(),
  upperBound: z.string(),
  margin: z.string(),
});

// ============================================================================
// Decision Category Enum
// ============================================================================

export enum DecisionCategory {
  RESOURCE_ALLOCATION = 'RESOURCE_ALLOCATION',
  PROCESS_OPTIMIZATION = 'PROCESS_OPTIMIZATION',
  VENDOR_SELECTION = 'VENDOR_SELECTION',
  CAPACITY_PLANNING = 'CAPACITY_PLANNING',
  RISK_MITIGATION = 'RISK_MITIGATION',
  COST_REDUCTION = 'COST_REDUCTION',
}

export const DecisionCategorySchema = z.nativeEnum(DecisionCategory);

// ============================================================================
// Allocation Method Enum
// ============================================================================

export enum AllocationMethod {
  DIRECT = 'DIRECT',
  STEP_DOWN = 'STEP_DOWN',
  ACTIVITY_BASED = 'ACTIVITY_BASED',
}

export const AllocationMethodSchema = z.nativeEnum(AllocationMethod);

// ============================================================================
// Impact Type Enum
// ============================================================================

export enum ImpactType {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

export const ImpactTypeSchema = z.nativeEnum(ImpactType);

// ============================================================================
// Account Type Enum
// ============================================================================

export enum AccountType {
  ASSET = 'ASSET',
  LIABILITY = 'LIABILITY',
  EQUITY = 'EQUITY',
  REVENUE = 'REVENUE',
  EXPENSE = 'EXPENSE',
}

export const AccountTypeSchema = z.nativeEnum(AccountType);

// ============================================================================
// Natural Sign Enum
// ============================================================================

export enum NaturalSign {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

export const NaturalSignSchema = z.nativeEnum(NaturalSign);

// ============================================================================
// Resource Type Enum
// ============================================================================

export enum ResourceType {
  FTE = 'FTE',
  COMPUTE = 'COMPUTE',
  LICENSE = 'LICENSE',
  CUSTOM = 'CUSTOM',
}

export const ResourceTypeSchema = z.nativeEnum(ResourceType);

// ============================================================================
// Delta Direction Enum
// ============================================================================

export enum DeltaDirection {
  INCREASE = 'increase',
  DECREASE = 'decrease',
}

export const DeltaDirectionSchema = z.nativeEnum(DeltaDirection);

// ============================================================================
// Status Enums
// ============================================================================

export enum IngestionStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  PARTIAL = 'PARTIAL',
}

export enum ExecutionStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  PENDING = 'PENDING',
}

export enum ValidationStatus {
  PASSED = 'PASSED',
  FAILED = 'FAILED',
  WARNING = 'WARNING',
}

// ============================================================================
// Fiscal Period
// ============================================================================

export interface FiscalPeriod {
  readonly year: number;
  readonly period: number; // 1-12 for monthly, 1-4 for quarterly
  readonly startDate: ISO8601;
  readonly endDate: ISO8601;
}

export const FiscalPeriodSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  period: z.number().int().min(1).max(12),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

// ============================================================================
// Checksum type for audit trail
// ============================================================================

export type SHA256Hash = string;

// ============================================================================
// Error types
// ============================================================================

export class IngestionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'IngestionError';
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly field: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class CalculationError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'CalculationError';
  }
}

export class AttributionError extends Error {
  constructor(
    message: string,
    public readonly entityId: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'AttributionError';
  }
}
