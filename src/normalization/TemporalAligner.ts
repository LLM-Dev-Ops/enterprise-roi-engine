/**
 * TemporalAligner
 * Aligns simulation time horizons with fiscal calendars.
 * Provides period mapping and validation for time-based calculations.
 */

import { FiscalPeriod, ISO8601 } from '../contracts';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for a fiscal calendar.
 */
export interface FiscalCalendarConfig {
  readonly fiscalYearStartMonth: number; // 1-12, e.g., 4 for April start
  readonly periodType: FiscalPeriodType;
  readonly periods: readonly FiscalPeriod[];
}

/**
 * Type of fiscal period.
 */
export enum FiscalPeriodType {
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  WEEKLY = 'WEEKLY', // 52/53 week year
}

/**
 * Result of mapping a date to a fiscal period.
 */
export interface FiscalPeriodMapping {
  readonly date: ISO8601;
  readonly fiscalPeriod: FiscalPeriod;
  readonly dayOfPeriod: number;
  readonly daysRemainingInPeriod: number;
  readonly periodProgress: number; // 0.0 to 1.0
}

/**
 * Simulation time horizon with fiscal alignment.
 */
export interface AlignedTimeHorizon {
  readonly simulationStartDate: ISO8601;
  readonly simulationEndDate: ISO8601;
  readonly simulationMonths: number;
  readonly fiscalPeriods: readonly FiscalPeriod[];
  readonly startPeriod: FiscalPeriod;
  readonly endPeriod: FiscalPeriod;
  readonly periodCount: number;
  readonly isAligned: boolean; // True if simulation starts at period boundary
}

/**
 * Period-specific adjustment factor for seasonality or other variations.
 */
export interface PeriodAdjustmentFactor {
  readonly period: FiscalPeriod;
  readonly factor: number;
  readonly reason: string;
}

/**
 * Validation result for time horizon.
 */
export interface TimeHorizonValidation {
  readonly isValid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

// ============================================================================
// TemporalAligner Class
// ============================================================================

export class TemporalAligner {
  private readonly fiscalPeriods: FiscalPeriod[];
  private readonly periodsByDate: Map<string, FiscalPeriod>;
  private readonly periodsByKey: Map<string, FiscalPeriod>;
  private readonly fiscalYearStartMonth: number;
  private readonly periodType: FiscalPeriodType;
  private readonly adjustmentFactors: Map<string, PeriodAdjustmentFactor>;

  /**
   * Creates a new TemporalAligner with the given fiscal calendar.
   */
  constructor(
    fiscalCalendar: readonly FiscalPeriod[],
    config?: Partial<FiscalCalendarConfig>
  ) {
    // Sort periods deterministically
    this.fiscalPeriods = [...fiscalCalendar].sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.period - b.period;
    });

    this.periodsByDate = new Map();
    this.periodsByKey = new Map();
    this.adjustmentFactors = new Map();

    // Determine calendar configuration
    this.fiscalYearStartMonth = config?.fiscalYearStartMonth ?? this.inferFiscalYearStart();
    this.periodType = config?.periodType ?? this.inferPeriodType();

    // Build lookup maps
    this.buildPeriodMaps();
  }

  // ============================================================================
  // Date to Period Mapping
  // ============================================================================

  /**
   * Maps a date to its corresponding fiscal period.
   */
  mapDateToPeriod(date: ISO8601): FiscalPeriodMapping | undefined {
    const dateObj = new Date(date);
    const dateKey = this.formatDateKey(dateObj);

    // Check if we have a cached mapping
    const cachedPeriod = this.periodsByDate.get(dateKey);
    if (cachedPeriod) {
      return this.createPeriodMapping(date, cachedPeriod);
    }

    // Find the period that contains this date
    for (const period of this.fiscalPeriods) {
      const startDate = new Date(period.startDate);
      const endDate = new Date(period.endDate);

      if (dateObj >= startDate && dateObj <= endDate) {
        // Cache for future lookups
        this.periodsByDate.set(dateKey, period);
        return this.createPeriodMapping(date, period);
      }
    }

    return undefined;
  }

  /**
   * Gets a fiscal period by year and period number.
   */
  getPeriod(year: number, period: number): FiscalPeriod | undefined {
    const key = this.getPeriodKey(year, period);
    return this.periodsByKey.get(key);
  }

  /**
   * Gets all fiscal periods for a given year.
   */
  getPeriodsForYear(year: number): readonly FiscalPeriod[] {
    return this.fiscalPeriods.filter(p => p.year === year);
  }

  /**
   * Gets fiscal periods within a date range.
   */
  getPeriodsInRange(startDate: ISO8601, endDate: ISO8601): readonly FiscalPeriod[] {
    const start = new Date(startDate);
    const end = new Date(endDate);

    return this.fiscalPeriods.filter(p => {
      const periodStart = new Date(p.startDate);
      const periodEnd = new Date(p.endDate);
      return periodStart <= end && periodEnd >= start;
    });
  }

  /**
   * Gets the next fiscal period after the given period.
   */
  getNextPeriod(period: FiscalPeriod): FiscalPeriod | undefined {
    const index = this.fiscalPeriods.findIndex(
      p => p.year === period.year && p.period === period.period
    );
    if (index >= 0 && index < this.fiscalPeriods.length - 1) {
      return this.fiscalPeriods[index + 1];
    }
    return undefined;
  }

  /**
   * Gets the previous fiscal period before the given period.
   */
  getPreviousPeriod(period: FiscalPeriod): FiscalPeriod | undefined {
    const index = this.fiscalPeriods.findIndex(
      p => p.year === period.year && p.period === period.period
    );
    if (index > 0) {
      return this.fiscalPeriods[index - 1];
    }
    return undefined;
  }

  // ============================================================================
  // Time Horizon Alignment
  // ============================================================================

  /**
   * Aligns a simulation time horizon with the fiscal calendar.
   */
  alignTimeHorizon(
    startDate: ISO8601,
    horizonMonths: number
  ): AlignedTimeHorizon {
    const start = new Date(startDate);
    const end = new Date(start);
    end.setMonth(end.getMonth() + horizonMonths);

    const startMapping = this.mapDateToPeriod(startDate);
    const endMapping = this.mapDateToPeriod(end.toISOString());

    if (!startMapping || !endMapping) {
      throw new Error(
        `Simulation time horizon (${startDate} + ${horizonMonths} months) ` +
        `falls outside the fiscal calendar range`
      );
    }

    const periods = this.getPeriodsInRange(startDate, end.toISOString());
    const isAligned = this.isAtPeriodBoundary(start, startMapping.fiscalPeriod);

    return {
      simulationStartDate: startDate,
      simulationEndDate: end.toISOString(),
      simulationMonths: horizonMonths,
      fiscalPeriods: periods,
      startPeriod: startMapping.fiscalPeriod,
      endPeriod: endMapping.fiscalPeriod,
      periodCount: periods.length,
      isAligned,
    };
  }

  /**
   * Validates that a time horizon fits within the fiscal calendar.
   */
  validateTimeHorizon(
    startDate: ISO8601,
    horizonMonths: number
  ): TimeHorizonValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    const start = new Date(startDate);
    const end = new Date(start);
    end.setMonth(end.getMonth() + horizonMonths);

    // Check if start date is within calendar
    const startMapping = this.mapDateToPeriod(startDate);
    if (!startMapping) {
      errors.push(`Start date ${startDate} is outside the fiscal calendar range`);
    }

    // Check if end date is within calendar
    const endMapping = this.mapDateToPeriod(end.toISOString());
    if (!endMapping) {
      errors.push(
        `End date ${end.toISOString()} (${horizonMonths} months from start) ` +
        `is outside the fiscal calendar range`
      );
    }

    // Check alignment
    if (startMapping && !this.isAtPeriodBoundary(start, startMapping.fiscalPeriod)) {
      warnings.push(
        `Start date ${startDate} does not align with fiscal period boundary. ` +
        `Period ${startMapping.fiscalPeriod.period} starts on ` +
        `${startMapping.fiscalPeriod.startDate}`
      );
    }

    // Check for sufficient periods
    if (errors.length === 0) {
      const periods = this.getPeriodsInRange(startDate, end.toISOString());
      if (periods.length === 0) {
        errors.push('No fiscal periods found in the specified time horizon');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Snaps a date to the nearest period boundary.
   */
  snapToPeriodBoundary(
    date: ISO8601,
    direction: 'start' | 'end' | 'nearest' = 'nearest'
  ): ISO8601 {
    const mapping = this.mapDateToPeriod(date);
    if (!mapping) {
      throw new Error(`Date ${date} is outside the fiscal calendar range`);
    }

    const dateObj = new Date(date);
    const periodStart = new Date(mapping.fiscalPeriod.startDate);
    const periodEnd = new Date(mapping.fiscalPeriod.endDate);

    if (direction === 'start') {
      return mapping.fiscalPeriod.startDate;
    }

    if (direction === 'end') {
      return mapping.fiscalPeriod.endDate;
    }

    // Find nearest boundary
    const distToStart = Math.abs(dateObj.getTime() - periodStart.getTime());
    const distToEnd = Math.abs(dateObj.getTime() - periodEnd.getTime());

    return distToStart <= distToEnd
      ? mapping.fiscalPeriod.startDate
      : mapping.fiscalPeriod.endDate;
  }

  // ============================================================================
  // Period Adjustment Factors
  // ============================================================================

  /**
   * Sets an adjustment factor for a specific period.
   */
  setPeriodAdjustmentFactor(
    period: FiscalPeriod,
    factor: number,
    reason: string
  ): void {
    const key = this.getPeriodKey(period.year, period.period);
    this.adjustmentFactors.set(key, { period, factor, reason });
  }

  /**
   * Gets the adjustment factor for a specific period.
   */
  getPeriodAdjustmentFactor(period: FiscalPeriod): PeriodAdjustmentFactor {
    const key = this.getPeriodKey(period.year, period.period);
    return this.adjustmentFactors.get(key) ?? {
      period,
      factor: 1.0,
      reason: 'No adjustment',
    };
  }

  /**
   * Gets all adjustment factors in deterministic order.
   */
  getAllAdjustmentFactors(): readonly PeriodAdjustmentFactor[] {
    return Array.from(this.adjustmentFactors.values()).sort((a, b) => {
      if (a.period.year !== b.period.year) return a.period.year - b.period.year;
      return a.period.period - b.period.period;
    });
  }

  /**
   * Calculates a pro-rated factor for a partial period.
   * Useful when a simulation doesn't align with period boundaries.
   */
  calculateProRataFactor(
    date: ISO8601,
    direction: 'remaining' | 'elapsed'
  ): number {
    const mapping = this.mapDateToPeriod(date);
    if (!mapping) {
      return 1.0;
    }

    return direction === 'remaining'
      ? 1 - mapping.periodProgress
      : mapping.periodProgress;
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Gets the number of days between two dates.
   */
  getDaysBetween(startDate: ISO8601, endDate: ISO8601): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffMs = end.getTime() - start.getTime();
    return Math.floor(diffMs / (24 * 60 * 60 * 1000));
  }

  /**
   * Gets the number of months between two dates.
   */
  getMonthsBetween(startDate: ISO8601, endDate: ISO8601): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const yearDiff = end.getFullYear() - start.getFullYear();
    const monthDiff = end.getMonth() - start.getMonth();
    return yearDiff * 12 + monthDiff;
  }

  /**
   * Gets all fiscal periods in deterministic order.
   */
  getAllPeriods(): readonly FiscalPeriod[] {
    return this.fiscalPeriods;
  }

  /**
   * Gets the fiscal calendar configuration.
   */
  getCalendarConfig(): FiscalCalendarConfig {
    return {
      fiscalYearStartMonth: this.fiscalYearStartMonth,
      periodType: this.periodType,
      periods: this.fiscalPeriods,
    };
  }

  /**
   * Gets the minimum date in the fiscal calendar.
   */
  getMinDate(): ISO8601 | undefined {
    if (this.fiscalPeriods.length === 0) return undefined;
    const firstPeriod = this.fiscalPeriods[0];
    return firstPeriod?.startDate;
  }

  /**
   * Gets the maximum date in the fiscal calendar.
   */
  getMaxDate(): ISO8601 | undefined {
    if (this.fiscalPeriods.length === 0) return undefined;
    const lastPeriod = this.fiscalPeriods[this.fiscalPeriods.length - 1];
    return lastPeriod?.endDate;
  }

  /**
   * Converts a simulation period index to fiscal period.
   * Period 0 is the first period of the simulation.
   */
  simulationPeriodToFiscal(
    simulationPeriodIndex: number,
    simulationStartDate: ISO8601
  ): FiscalPeriod | undefined {
    const startMapping = this.mapDateToPeriod(simulationStartDate);
    if (!startMapping) return undefined;

    const startIndex = this.fiscalPeriods.findIndex(
      p => p.year === startMapping.fiscalPeriod.year &&
           p.period === startMapping.fiscalPeriod.period
    );

    if (startIndex < 0) return undefined;

    const targetIndex = startIndex + simulationPeriodIndex;
    if (targetIndex >= 0 && targetIndex < this.fiscalPeriods.length) {
      return this.fiscalPeriods[targetIndex];
    }

    return undefined;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private buildPeriodMaps(): void {
    for (const period of this.fiscalPeriods) {
      const key = this.getPeriodKey(period.year, period.period);
      this.periodsByKey.set(key, period);
    }
  }

  private createPeriodMapping(date: ISO8601, period: FiscalPeriod): FiscalPeriodMapping {
    const totalDays = this.getDaysBetween(period.startDate, period.endDate) + 1;
    const dayOfPeriod = this.getDaysBetween(period.startDate, date) + 1;
    const daysRemaining = this.getDaysBetween(date, period.endDate);
    const progress = dayOfPeriod / totalDays;

    return {
      date,
      fiscalPeriod: period,
      dayOfPeriod,
      daysRemainingInPeriod: daysRemaining,
      periodProgress: Math.min(1, Math.max(0, progress)),
    };
  }

  private getPeriodKey(year: number, period: number): string {
    return `${year}-${period.toString().padStart(2, '0')}`;
  }

  private formatDateKey(date: Date): string {
    const isoString = date.toISOString();
    const datePart = isoString.split('T')[0];
    return datePart ?? isoString;
  }

  private isAtPeriodBoundary(date: Date, period: FiscalPeriod): boolean {
    const periodStart = new Date(period.startDate);
    // Allow 1 day tolerance for boundary detection
    const diffMs = Math.abs(date.getTime() - periodStart.getTime());
    return diffMs < 24 * 60 * 60 * 1000;
  }

  private inferFiscalYearStart(): number {
    if (this.fiscalPeriods.length === 0) return 1; // Default to January

    // Find the first period of any year
    const firstPeriod = this.fiscalPeriods.find(p => p.period === 1);
    if (firstPeriod) {
      const startDate = new Date(firstPeriod.startDate);
      return startDate.getMonth() + 1; // getMonth() is 0-indexed
    }

    return 1;
  }

  private inferPeriodType(): FiscalPeriodType {
    if (this.fiscalPeriods.length < 2) return FiscalPeriodType.MONTHLY;

    // Count unique periods per year
    const periodsPerYear = new Map<number, number>();
    for (const period of this.fiscalPeriods) {
      const count = periodsPerYear.get(period.year) ?? 0;
      periodsPerYear.set(period.year, count + 1);
    }

    const avgPeriodsPerYear = Array.from(periodsPerYear.values()).reduce(
      (a, b) => a + b, 0
    ) / periodsPerYear.size;

    if (avgPeriodsPerYear <= 4) return FiscalPeriodType.QUARTERLY;
    if (avgPeriodsPerYear >= 50) return FiscalPeriodType.WEEKLY;
    return FiscalPeriodType.MONTHLY;
  }
}
