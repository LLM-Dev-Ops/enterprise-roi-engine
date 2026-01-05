/**
 * TemporalAligner Unit Tests
 * Tests for fiscal calendar alignment and time horizon validation.
 */

import {
  TemporalAligner,
  FiscalPeriodType,
} from '../../../src/normalization/TemporalAligner';
import { FiscalPeriod } from '../../../src/contracts';

// ============================================================================
// Test Fixtures
// ============================================================================

const createMockFiscalCalendar = (): FiscalPeriod[] => {
  const periods: FiscalPeriod[] = [];

  // FY2024 - Monthly periods (Jan-Dec 2024)
  for (let month = 1; month <= 12; month++) {
    const startDate = new Date(2024, month - 1, 1);
    const endDate = new Date(2024, month, 0); // Last day of month

    periods.push({
      year: 2024,
      period: month,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });
  }

  // FY2025 - Monthly periods (Jan-Dec 2025)
  for (let month = 1; month <= 12; month++) {
    const startDate = new Date(2025, month - 1, 1);
    const endDate = new Date(2025, month, 0);

    periods.push({
      year: 2025,
      period: month,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });
  }

  return periods;
};

const createQuarterlyFiscalCalendar = (): FiscalPeriod[] => {
  const periods: FiscalPeriod[] = [];

  // FY2024 - Quarterly periods
  const quarters2024 = [
    { period: 1, startMonth: 0, endMonth: 2 }, // Jan-Mar
    { period: 2, startMonth: 3, endMonth: 5 }, // Apr-Jun
    { period: 3, startMonth: 6, endMonth: 8 }, // Jul-Sep
    { period: 4, startMonth: 9, endMonth: 11 }, // Oct-Dec
  ];

  for (const q of quarters2024) {
    const startDate = new Date(2024, q.startMonth, 1);
    const endDate = new Date(2024, q.endMonth + 1, 0);

    periods.push({
      year: 2024,
      period: q.period,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });
  }

  // FY2025 - Quarterly periods
  for (const q of quarters2024) {
    const startDate = new Date(2025, q.startMonth, 1);
    const endDate = new Date(2025, q.endMonth + 1, 0);

    periods.push({
      year: 2025,
      period: q.period,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });
  }

  return periods;
};

const createAprilStartFiscalCalendar = (): FiscalPeriod[] => {
  const periods: FiscalPeriod[] = [];

  // FY2024 starts in April 2024
  // Period 1 = April 2024, Period 12 = March 2025
  for (let i = 0; i < 12; i++) {
    const periodMonth = (3 + i) % 12; // April = 3 in 0-indexed
    const year = i < 9 ? 2024 : 2025; // April-Dec 2024, Jan-Mar 2025
    const startDate = new Date(year, periodMonth, 1);
    const endDate = new Date(year, periodMonth + 1, 0);

    periods.push({
      year: 2024, // Fiscal year
      period: i + 1,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });
  }

  return periods;
};

// ============================================================================
// Test Suite
// ============================================================================

describe('TemporalAligner', () => {
  let aligner: TemporalAligner;
  let fiscalCalendar: FiscalPeriod[];

  beforeEach(() => {
    fiscalCalendar = createMockFiscalCalendar();
    aligner = new TemporalAligner(fiscalCalendar);
  });

  // ============================================================================
  // Date to Period Mapping Tests
  // ============================================================================

  describe('mapDateToPeriod', () => {
    it('should map a date to its fiscal period', () => {
      const mapping = aligner.mapDateToPeriod('2024-03-15T00:00:00.000Z');
      expect(mapping).toBeDefined();
      expect(mapping?.fiscalPeriod.year).toBe(2024);
      expect(mapping?.fiscalPeriod.period).toBe(3); // March
    });

    it('should return day of period correctly', () => {
      const mapping = aligner.mapDateToPeriod('2024-01-15T00:00:00.000Z');
      expect(mapping?.dayOfPeriod).toBe(15);
    });

    it('should return days remaining in period', () => {
      const mapping = aligner.mapDateToPeriod('2024-01-15T00:00:00.000Z');
      // January has 31 days, day 15 means 16 days remaining (16-31)
      expect(mapping?.daysRemainingInPeriod).toBe(16);
    });

    it('should calculate period progress correctly', () => {
      // Middle of month
      const mapping = aligner.mapDateToPeriod('2024-01-15T00:00:00.000Z');
      // Day 15 of 31, so ~48% through the period
      expect(mapping?.periodProgress).toBeCloseTo(0.48, 1);
    });

    it('should return undefined for date outside calendar range', () => {
      const mapping = aligner.mapDateToPeriod('2020-01-01T00:00:00.000Z');
      expect(mapping).toBeUndefined();
    });

    it('should handle first day of period', () => {
      const mapping = aligner.mapDateToPeriod('2024-01-01T00:00:00.000Z');
      expect(mapping?.dayOfPeriod).toBe(1);
      expect(mapping?.periodProgress).toBeCloseTo(0.03, 1); // 1/31
    });

    it('should handle last day of period', () => {
      const mapping = aligner.mapDateToPeriod('2024-01-31T00:00:00.000Z');
      expect(mapping?.dayOfPeriod).toBe(31);
      expect(mapping?.daysRemainingInPeriod).toBe(0);
      expect(mapping?.periodProgress).toBe(1);
    });

    it('should cache period lookups', () => {
      // Call twice with same date
      const mapping1 = aligner.mapDateToPeriod('2024-06-15T00:00:00.000Z');
      const mapping2 = aligner.mapDateToPeriod('2024-06-15T00:00:00.000Z');
      expect(mapping1?.fiscalPeriod).toEqual(mapping2?.fiscalPeriod);
    });
  });

  describe('getPeriod', () => {
    it('should return fiscal period by year and period number', () => {
      const period = aligner.getPeriod(2024, 6);
      expect(period).toBeDefined();
      expect(period?.year).toBe(2024);
      expect(period?.period).toBe(6);
    });

    it('should return undefined for non-existent period', () => {
      const period = aligner.getPeriod(2024, 13);
      expect(period).toBeUndefined();
    });

    it('should return undefined for non-existent year', () => {
      const period = aligner.getPeriod(2020, 1);
      expect(period).toBeUndefined();
    });
  });

  describe('getPeriodsForYear', () => {
    it('should return all periods for a fiscal year', () => {
      const periods = aligner.getPeriodsForYear(2024);
      expect(periods.length).toBe(12);
      periods.forEach(p => {
        expect(p.year).toBe(2024);
      });
    });

    it('should return empty array for non-existent year', () => {
      const periods = aligner.getPeriodsForYear(2020);
      expect(periods).toEqual([]);
    });
  });

  describe('getPeriodsInRange', () => {
    it('should return all periods within a date range', () => {
      const periods = aligner.getPeriodsInRange(
        '2024-03-01T00:00:00.000Z',
        '2024-06-30T00:00:00.000Z'
      );
      expect(periods.length).toBe(4); // March, April, May, June
    });

    it('should include partial periods at boundaries', () => {
      const periods = aligner.getPeriodsInRange(
        '2024-03-15T00:00:00.000Z',
        '2024-05-15T00:00:00.000Z'
      );
      expect(periods.length).toBe(3); // March (partial), April, May (partial)
    });

    it('should handle cross-year ranges', () => {
      const periods = aligner.getPeriodsInRange(
        '2024-11-01T00:00:00.000Z',
        '2025-02-28T00:00:00.000Z'
      );
      expect(periods.length).toBe(4); // Nov, Dec 2024, Jan, Feb 2025
    });

    it('should return empty for range outside calendar', () => {
      const periods = aligner.getPeriodsInRange(
        '2020-01-01T00:00:00.000Z',
        '2020-12-31T00:00:00.000Z'
      );
      expect(periods).toEqual([]);
    });
  });

  describe('getNextPeriod', () => {
    it('should return next period', () => {
      const currentPeriod = aligner.getPeriod(2024, 6)!;
      const nextPeriod = aligner.getNextPeriod(currentPeriod);
      expect(nextPeriod?.period).toBe(7);
      expect(nextPeriod?.year).toBe(2024);
    });

    it('should return next year period at year boundary', () => {
      const decemberPeriod = aligner.getPeriod(2024, 12)!;
      const nextPeriod = aligner.getNextPeriod(decemberPeriod);
      expect(nextPeriod?.period).toBe(1);
      expect(nextPeriod?.year).toBe(2025);
    });

    it('should return undefined at end of calendar', () => {
      const lastPeriod = aligner.getPeriod(2025, 12)!;
      const nextPeriod = aligner.getNextPeriod(lastPeriod);
      expect(nextPeriod).toBeUndefined();
    });
  });

  describe('getPreviousPeriod', () => {
    it('should return previous period', () => {
      const currentPeriod = aligner.getPeriod(2024, 6)!;
      const prevPeriod = aligner.getPreviousPeriod(currentPeriod);
      expect(prevPeriod?.period).toBe(5);
      expect(prevPeriod?.year).toBe(2024);
    });

    it('should return previous year period at year boundary', () => {
      const januaryPeriod = aligner.getPeriod(2025, 1)!;
      const prevPeriod = aligner.getPreviousPeriod(januaryPeriod);
      expect(prevPeriod?.period).toBe(12);
      expect(prevPeriod?.year).toBe(2024);
    });

    it('should return undefined at start of calendar', () => {
      const firstPeriod = aligner.getPeriod(2024, 1)!;
      const prevPeriod = aligner.getPreviousPeriod(firstPeriod);
      expect(prevPeriod).toBeUndefined();
    });
  });

  // ============================================================================
  // Time Horizon Alignment Tests
  // ============================================================================

  describe('alignTimeHorizon', () => {
    it('should align simulation time horizon with fiscal calendar', () => {
      const aligned = aligner.alignTimeHorizon('2024-01-01T00:00:00.000Z', 6);
      expect(aligned.simulationMonths).toBe(6);
      expect(aligned.periodCount).toBe(6);
      expect(aligned.startPeriod.period).toBe(1);
      expect(aligned.startPeriod.year).toBe(2024);
      expect(aligned.endPeriod.period).toBe(6);
    });

    it('should detect aligned start dates', () => {
      const aligned = aligner.alignTimeHorizon('2024-01-01T00:00:00.000Z', 3);
      expect(aligned.isAligned).toBe(true);
    });

    it('should detect misaligned start dates', () => {
      const aligned = aligner.alignTimeHorizon('2024-01-15T00:00:00.000Z', 3);
      expect(aligned.isAligned).toBe(false);
    });

    it('should include all periods in the horizon', () => {
      const aligned = aligner.alignTimeHorizon('2024-03-01T00:00:00.000Z', 4);
      expect(aligned.fiscalPeriods.length).toBe(4);
      expect(aligned.fiscalPeriods[0]?.period).toBe(3);
      expect(aligned.fiscalPeriods[3]?.period).toBe(6);
    });

    it('should throw for horizon outside calendar range', () => {
      expect(() => {
        aligner.alignTimeHorizon('2025-10-01T00:00:00.000Z', 12);
      }).toThrow('falls outside the fiscal calendar range');
    });

    it('should handle cross-year horizons', () => {
      const aligned = aligner.alignTimeHorizon('2024-11-01T00:00:00.000Z', 4);
      expect(aligned.startPeriod.year).toBe(2024);
      expect(aligned.endPeriod.year).toBe(2025);
    });
  });

  describe('validateTimeHorizon', () => {
    it('should return valid for horizon within calendar', () => {
      const validation = aligner.validateTimeHorizon('2024-01-01T00:00:00.000Z', 6);
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toEqual([]);
    });

    it('should return warning for misaligned start date', () => {
      const validation = aligner.validateTimeHorizon('2024-01-15T00:00:00.000Z', 3);
      expect(validation.isValid).toBe(true);
      expect(validation.warnings.length).toBeGreaterThan(0);
      expect(validation.warnings[0]).toContain('does not align');
    });

    it('should return error for start date outside calendar', () => {
      const validation = aligner.validateTimeHorizon('2020-01-01T00:00:00.000Z', 6);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it('should return error for end date outside calendar', () => {
      const validation = aligner.validateTimeHorizon('2025-10-01T00:00:00.000Z', 12);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });

  describe('snapToPeriodBoundary', () => {
    it('should snap to period start', () => {
      const snapped = aligner.snapToPeriodBoundary('2024-01-15T00:00:00.000Z', 'start');
      expect(snapped).toContain('2024-01-01');
    });

    it('should snap to period end', () => {
      const snapped = aligner.snapToPeriodBoundary('2024-01-15T00:00:00.000Z', 'end');
      expect(snapped).toContain('2024-01-31');
    });

    it('should snap to nearest boundary (start)', () => {
      // Day 5 of 31 is closer to start
      const snapped = aligner.snapToPeriodBoundary('2024-01-05T00:00:00.000Z', 'nearest');
      expect(snapped).toContain('2024-01-01');
    });

    it('should snap to nearest boundary (end)', () => {
      // Day 28 of 31 is closer to end
      const snapped = aligner.snapToPeriodBoundary('2024-01-28T00:00:00.000Z', 'nearest');
      expect(snapped).toContain('2024-01-31');
    });

    it('should throw for date outside calendar', () => {
      expect(() => {
        aligner.snapToPeriodBoundary('2020-01-15T00:00:00.000Z', 'start');
      }).toThrow('outside the fiscal calendar range');
    });
  });

  // ============================================================================
  // Period Adjustment Factor Tests
  // ============================================================================

  describe('setPeriodAdjustmentFactor', () => {
    it('should set adjustment factor for a period', () => {
      const period = aligner.getPeriod(2024, 12)!;
      aligner.setPeriodAdjustmentFactor(period, 1.15, 'Holiday season');

      const factor = aligner.getPeriodAdjustmentFactor(period);
      expect(factor.factor).toBe(1.15);
      expect(factor.reason).toBe('Holiday season');
    });
  });

  describe('getPeriodAdjustmentFactor', () => {
    it('should return default factor for period without adjustment', () => {
      const period = aligner.getPeriod(2024, 6)!;
      const factor = aligner.getPeriodAdjustmentFactor(period);
      expect(factor.factor).toBe(1.0);
      expect(factor.reason).toBe('No adjustment');
    });

    it('should return set factor for adjusted period', () => {
      const period = aligner.getPeriod(2024, 7)!;
      aligner.setPeriodAdjustmentFactor(period, 0.85, 'Summer slowdown');

      const factor = aligner.getPeriodAdjustmentFactor(period);
      expect(factor.factor).toBe(0.85);
    });
  });

  describe('getAllAdjustmentFactors', () => {
    it('should return all adjustment factors in sorted order', () => {
      const p1 = aligner.getPeriod(2024, 12)!;
      const p2 = aligner.getPeriod(2024, 7)!;
      const p3 = aligner.getPeriod(2025, 1)!;

      aligner.setPeriodAdjustmentFactor(p1, 1.15, 'Holiday');
      aligner.setPeriodAdjustmentFactor(p2, 0.85, 'Summer');
      aligner.setPeriodAdjustmentFactor(p3, 1.05, 'New year');

      const factors = aligner.getAllAdjustmentFactors();
      expect(factors.length).toBe(3);
      // Should be sorted by year, then period
      expect(factors[0]?.period.period).toBe(7); // 2024-07
      expect(factors[1]?.period.period).toBe(12); // 2024-12
      expect(factors[2]?.period.period).toBe(1); // 2025-01
    });

    it('should return empty array when no factors set', () => {
      const factors = aligner.getAllAdjustmentFactors();
      expect(factors).toEqual([]);
    });
  });

  describe('calculateProRataFactor', () => {
    it('should calculate remaining factor correctly', () => {
      // Middle of month (15/31 elapsed)
      const factor = aligner.calculateProRataFactor('2024-01-15T00:00:00.000Z', 'remaining');
      expect(factor).toBeCloseTo(0.52, 1); // ~52% remaining
    });

    it('should calculate elapsed factor correctly', () => {
      const factor = aligner.calculateProRataFactor('2024-01-15T00:00:00.000Z', 'elapsed');
      expect(factor).toBeCloseTo(0.48, 1); // ~48% elapsed
    });

    it('should return 1.0 for date outside calendar', () => {
      const factor = aligner.calculateProRataFactor('2020-01-15T00:00:00.000Z', 'remaining');
      expect(factor).toBe(1.0);
    });

    it('should return 1.0 remaining on first day', () => {
      const factor = aligner.calculateProRataFactor('2024-01-01T00:00:00.000Z', 'remaining');
      expect(factor).toBeCloseTo(0.97, 1); // Almost full period remaining
    });

    it('should return 0.0 remaining on last day', () => {
      const factor = aligner.calculateProRataFactor('2024-01-31T00:00:00.000Z', 'remaining');
      expect(factor).toBe(0); // Nothing remaining
    });
  });

  // ============================================================================
  // Utility Methods Tests
  // ============================================================================

  describe('getDaysBetween', () => {
    it('should calculate days between dates', () => {
      const days = aligner.getDaysBetween(
        '2024-01-01T00:00:00.000Z',
        '2024-01-31T00:00:00.000Z'
      );
      expect(days).toBe(30);
    });

    it('should return 0 for same date', () => {
      const days = aligner.getDaysBetween(
        '2024-01-15T00:00:00.000Z',
        '2024-01-15T00:00:00.000Z'
      );
      expect(days).toBe(0);
    });

    it('should handle cross-month calculation', () => {
      const days = aligner.getDaysBetween(
        '2024-01-15T00:00:00.000Z',
        '2024-02-15T00:00:00.000Z'
      );
      expect(days).toBe(31);
    });
  });

  describe('getMonthsBetween', () => {
    it('should calculate months between dates', () => {
      const months = aligner.getMonthsBetween(
        '2024-01-01T00:00:00.000Z',
        '2024-06-01T00:00:00.000Z'
      );
      expect(months).toBe(5);
    });

    it('should return 0 for same month', () => {
      const months = aligner.getMonthsBetween(
        '2024-01-01T00:00:00.000Z',
        '2024-01-31T00:00:00.000Z'
      );
      expect(months).toBe(0);
    });

    it('should handle cross-year calculation', () => {
      const months = aligner.getMonthsBetween(
        '2024-10-01T00:00:00.000Z',
        '2025-03-01T00:00:00.000Z'
      );
      expect(months).toBe(5);
    });
  });

  describe('getAllPeriods', () => {
    it('should return all periods in sorted order', () => {
      const periods = aligner.getAllPeriods();
      expect(periods.length).toBe(24); // 12 months x 2 years

      // Verify sorting
      for (let i = 1; i < periods.length; i++) {
        const prev = periods[i - 1]!;
        const curr = periods[i]!;
        const isOrdered =
          prev.year < curr.year ||
          (prev.year === curr.year && prev.period <= curr.period);
        expect(isOrdered).toBe(true);
      }
    });
  });

  describe('getCalendarConfig', () => {
    it('should return calendar configuration', () => {
      const config = aligner.getCalendarConfig();
      expect(config.fiscalYearStartMonth).toBe(1); // January
      expect(config.periodType).toBe(FiscalPeriodType.MONTHLY);
      expect(config.periods.length).toBe(24);
    });
  });

  describe('getMinDate and getMaxDate', () => {
    it('should return minimum date in calendar', () => {
      const minDate = aligner.getMinDate();
      expect(minDate).toContain('2024-01-01');
    });

    it('should return maximum date in calendar', () => {
      const maxDate = aligner.getMaxDate();
      expect(maxDate).toContain('2025-12-31');
    });

    it('should return undefined for empty calendar', () => {
      const emptyAligner = new TemporalAligner([]);
      expect(emptyAligner.getMinDate()).toBeUndefined();
      expect(emptyAligner.getMaxDate()).toBeUndefined();
    });
  });

  describe('simulationPeriodToFiscal', () => {
    it('should convert simulation period index to fiscal period', () => {
      const fiscalPeriod = aligner.simulationPeriodToFiscal(0, '2024-03-01T00:00:00.000Z');
      expect(fiscalPeriod?.year).toBe(2024);
      expect(fiscalPeriod?.period).toBe(3); // March
    });

    it('should return correct period for later simulation periods', () => {
      const fiscalPeriod = aligner.simulationPeriodToFiscal(3, '2024-03-01T00:00:00.000Z');
      expect(fiscalPeriod?.year).toBe(2024);
      expect(fiscalPeriod?.period).toBe(6); // June
    });

    it('should handle cross-year simulation periods', () => {
      const fiscalPeriod = aligner.simulationPeriodToFiscal(5, '2024-10-01T00:00:00.000Z');
      expect(fiscalPeriod?.year).toBe(2025);
      expect(fiscalPeriod?.period).toBe(3); // March 2025
    });

    it('should return undefined for invalid start date', () => {
      const fiscalPeriod = aligner.simulationPeriodToFiscal(0, '2020-01-01T00:00:00.000Z');
      expect(fiscalPeriod).toBeUndefined();
    });

    it('should return undefined for period beyond calendar', () => {
      const fiscalPeriod = aligner.simulationPeriodToFiscal(30, '2024-10-01T00:00:00.000Z');
      expect(fiscalPeriod).toBeUndefined();
    });
  });

  // ============================================================================
  // Quarterly Calendar Tests
  // ============================================================================

  describe('quarterly fiscal calendar', () => {
    let quarterlyAligner: TemporalAligner;

    beforeEach(() => {
      quarterlyAligner = new TemporalAligner(createQuarterlyFiscalCalendar());
    });

    it('should infer quarterly period type', () => {
      const config = quarterlyAligner.getCalendarConfig();
      expect(config.periodType).toBe(FiscalPeriodType.QUARTERLY);
    });

    it('should map date to correct quarter', () => {
      const mapping = quarterlyAligner.mapDateToPeriod('2024-05-15T00:00:00.000Z');
      expect(mapping?.fiscalPeriod.period).toBe(2); // Q2
    });

    it('should return 4 periods per year', () => {
      const periods = quarterlyAligner.getPeriodsForYear(2024);
      expect(periods.length).toBe(4);
    });
  });

  // ============================================================================
  // Non-Calendar Year Fiscal Calendar Tests
  // ============================================================================

  describe('April-start fiscal calendar', () => {
    let aprilAligner: TemporalAligner;

    beforeEach(() => {
      aprilAligner = new TemporalAligner(createAprilStartFiscalCalendar());
    });

    it('should infer April fiscal year start', () => {
      const config = aprilAligner.getCalendarConfig();
      expect(config.fiscalYearStartMonth).toBe(4); // April
    });

    it('should map date to correct fiscal period', () => {
      // May 2024 should be period 2 of FY2024
      const mapping = aprilAligner.mapDateToPeriod('2024-05-15T00:00:00.000Z');
      expect(mapping?.fiscalPeriod.period).toBe(2);
      expect(mapping?.fiscalPeriod.year).toBe(2024);
    });

    it('should handle fiscal year spanning calendar years', () => {
      // January 2025 should be period 10 of FY2024
      const mapping = aprilAligner.mapDateToPeriod('2025-01-15T00:00:00.000Z');
      expect(mapping?.fiscalPeriod.period).toBe(10);
      expect(mapping?.fiscalPeriod.year).toBe(2024);
    });
  });

  // ============================================================================
  // Edge Cases and Error Handling
  // ============================================================================

  describe('edge cases', () => {
    it('should handle empty fiscal calendar', () => {
      const emptyAligner = new TemporalAligner([]);
      expect(emptyAligner.getAllPeriods()).toEqual([]);
      expect(emptyAligner.mapDateToPeriod('2024-01-01T00:00:00.000Z')).toBeUndefined();
    });

    it('should handle single period calendar', () => {
      const singlePeriod: FiscalPeriod[] = [
        {
          year: 2024,
          period: 1,
          startDate: '2024-01-01T00:00:00.000Z',
          endDate: '2024-12-31T00:00:00.000Z',
        },
      ];
      const singleAligner = new TemporalAligner(singlePeriod);
      expect(singleAligner.getAllPeriods().length).toBe(1);

      const mapping = singleAligner.mapDateToPeriod('2024-06-15T00:00:00.000Z');
      expect(mapping?.fiscalPeriod.period).toBe(1);
    });

    it('should sort unsorted input periods', () => {
      const unsortedPeriods: FiscalPeriod[] = [
        { year: 2024, period: 3, startDate: '2024-03-01T00:00:00.000Z', endDate: '2024-03-31T00:00:00.000Z' },
        { year: 2024, period: 1, startDate: '2024-01-01T00:00:00.000Z', endDate: '2024-01-31T00:00:00.000Z' },
        { year: 2024, period: 2, startDate: '2024-02-01T00:00:00.000Z', endDate: '2024-02-29T00:00:00.000Z' },
      ];
      const unsortedAligner = new TemporalAligner(unsortedPeriods);
      const periods = unsortedAligner.getAllPeriods();

      expect(periods[0]?.period).toBe(1);
      expect(periods[1]?.period).toBe(2);
      expect(periods[2]?.period).toBe(3);
    });

    it('should handle leap year February correctly', () => {
      const leapYearPeriod: FiscalPeriod[] = [
        { year: 2024, period: 2, startDate: '2024-02-01T00:00:00.000Z', endDate: '2024-02-29T00:00:00.000Z' },
      ];
      const leapAligner = new TemporalAligner(leapYearPeriod);

      const mapping = leapAligner.mapDateToPeriod('2024-02-29T00:00:00.000Z');
      expect(mapping?.dayOfPeriod).toBe(29);
      expect(mapping?.daysRemainingInPeriod).toBe(0);
    });
  });
});
