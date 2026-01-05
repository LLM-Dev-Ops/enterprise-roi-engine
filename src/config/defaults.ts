/**
 * Default Configuration Values
 * These are MVP defaults; production should override via configuration.
 */

import { CalculationParameters } from '../contracts/artifacts';
import { RiskWeightMatrix } from '../contracts/costops';

/**
 * Default calculation parameters for MVP.
 */
export const DEFAULT_CALCULATION_PARAMETERS: CalculationParameters = {
  discountRate: 0.08, // 8% annual discount rate
  confidenceLevels: [50, 75, 90, 95, 99],
  timeHorizonMonths: 36, // 3 years
  baseCurrency: 'USD',
  riskToleranceLevel: 'MODERATE',
};

/**
 * Default risk weight matrix when category not found.
 */
export const DEFAULT_RISK_WEIGHT_MATRIX: RiskWeightMatrix = {
  categoryId: 'DEFAULT',
  categoryName: 'Default Risk Category',
  baseWeight: 1.0,
  volatilityMultiplier: 0.5,
  confidenceDecayRate: 0.3,
  maxWeight: 2.5,
};

/**
 * Z-scores for confidence intervals.
 */
export const Z_SCORES: Record<number, number> = {
  50: 0.674,
  75: 1.150,
  90: 1.645,
  95: 1.960,
  99: 2.576,
};

/**
 * Engine version for artifact versioning.
 */
export const ENGINE_VERSION = '0.1.0';

/**
 * Schema version for data contracts.
 */
export const SCHEMA_VERSION = '1.0';

/**
 * Stale data threshold in hours.
 */
export const STALE_DATA_THRESHOLD_HOURS = 24;

/**
 * Default overhead rates when not specified.
 */
export const DEFAULT_OVERHEAD_RATES = {
  directRate: 1.0, // 100% - no adjustment
  indirectRate: 0.0,
  sharedServicesRate: 0.0,
};

/**
 * Currency precision (decimal places).
 */
export const CURRENCY_PRECISION = 4;

/**
 * Percentage precision (decimal places).
 */
export const PERCENTAGE_PRECISION = 6;

/**
 * Maximum time horizon in months.
 */
export const MAX_TIME_HORIZON_MONTHS = 120; // 10 years

/**
 * Minimum time horizon in months.
 */
export const MIN_TIME_HORIZON_MONTHS = 1;
