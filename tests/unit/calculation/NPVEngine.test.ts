/**
 * NPV Engine Unit Tests
 * Tests for Net Present Value calculations with discount rates.
 */

import Decimal from 'decimal.js';
import {
  NPVEngine,
  CashFlow,
  NPVConfig,
  NPVResult,
  calculateMonthlyRate,
  calculateEffectiveMonthlyRate,
  calculateDiscountFactor,
  calculatePresentValue,
  calculateNPV,
  calculatePeriodPresentValues,
  calculateTimeAdjustedDelta,
  calculateSinglePeriodNPV,
  calculateCumulativeNPV,
} from '../../../src/calculation/NPVEngine';
import { toDecimal } from '../../../src/lib/financial';

// Helper to create a UUID-like string for testing
const createTestUUID = (suffix: string = '1'): string =>
  `00000000-0000-0000-0000-00000000000${suffix}`;

describe('NPVEngine', () => {
  describe('calculateMonthlyRate', () => {
    it('should calculate monthly rate from annual rate (simple division)', () => {
      // 12% annual rate / 12 = 1% monthly
      const result = calculateMonthlyRate(0.12);
      expect(result.toNumber()).toBeCloseTo(0.01, 6);
    });

    it('should handle zero annual rate', () => {
      const result = calculateMonthlyRate(0);
      expect(result.toNumber()).toBe(0);
    });

    it('should handle high annual rate', () => {
      // 24% annual rate / 12 = 2% monthly
      const result = calculateMonthlyRate(0.24);
      expect(result.toNumber()).toBeCloseTo(0.02, 6);
    });

    it('should handle fractional annual rates', () => {
      // 5.5% annual rate / 12 ≈ 0.004583
      const result = calculateMonthlyRate(0.055);
      expect(result.toNumber()).toBeCloseTo(0.004583, 5);
    });

    it('should maintain precision for small rates', () => {
      // 0.1% annual rate / 12
      const result = calculateMonthlyRate(0.001);
      expect(result.toNumber()).toBeCloseTo(0.000083333, 7);
    });
  });

  describe('calculateEffectiveMonthlyRate', () => {
    it('should calculate effective monthly rate from annual rate', () => {
      // (1 + 0.12)^(1/12) - 1 ≈ 0.009489
      const result = calculateEffectiveMonthlyRate(0.12);
      expect(result.toNumber()).toBeCloseTo(0.009489, 5);
    });

    it('should handle zero annual rate', () => {
      const result = calculateEffectiveMonthlyRate(0);
      expect(result.toNumber()).toBe(0);
    });

    it('should produce lower rate than simple division', () => {
      const annualRate = 0.12;
      const simpleMonthly = calculateMonthlyRate(annualRate);
      const effectiveMonthly = calculateEffectiveMonthlyRate(annualRate);

      // Effective monthly should be slightly lower than simple monthly
      expect(effectiveMonthly.toNumber()).toBeLessThan(simpleMonthly.toNumber());
    });

    it('should compound back to annual rate', () => {
      const annualRate = 0.10;
      const monthlyRate = calculateEffectiveMonthlyRate(annualRate);

      // (1 + monthlyRate)^12 - 1 should equal annual rate
      const compoundedAnnual = new Decimal(1).plus(monthlyRate).pow(12).minus(1);
      expect(compoundedAnnual.toNumber()).toBeCloseTo(annualRate, 6);
    });
  });

  describe('calculateDiscountFactor', () => {
    it('should return 1 for period 0', () => {
      const monthlyRate = toDecimal(0.01);
      const result = calculateDiscountFactor(monthlyRate, 0);
      expect(result.toNumber()).toBe(1);
    });

    it('should calculate discount factor for period 1', () => {
      // 1 / (1 + 0.01)^1 = 1/1.01 ≈ 0.9901
      const monthlyRate = toDecimal(0.01);
      const result = calculateDiscountFactor(monthlyRate, 1);
      expect(result.toNumber()).toBeCloseTo(0.9901, 4);
    });

    it('should calculate discount factor for period 12', () => {
      // 1 / (1 + 0.01)^12 ≈ 0.8874
      const monthlyRate = toDecimal(0.01);
      const result = calculateDiscountFactor(monthlyRate, 12);
      expect(result.toNumber()).toBeCloseTo(0.8874, 4);
    });

    it('should decrease over time', () => {
      const monthlyRate = toDecimal(0.01);
      const df1 = calculateDiscountFactor(monthlyRate, 1);
      const df6 = calculateDiscountFactor(monthlyRate, 6);
      const df12 = calculateDiscountFactor(monthlyRate, 12);

      expect(df6.toNumber()).toBeLessThan(df1.toNumber());
      expect(df12.toNumber()).toBeLessThan(df6.toNumber());
    });

    it('should throw for negative period', () => {
      const monthlyRate = toDecimal(0.01);
      expect(() => calculateDiscountFactor(monthlyRate, -1)).toThrow(
        'Period must be non-negative'
      );
    });

    it('should handle zero monthly rate', () => {
      const monthlyRate = toDecimal(0);
      const result = calculateDiscountFactor(monthlyRate, 12);
      expect(result.toNumber()).toBe(1);
    });

    it('should handle high monthly rate', () => {
      // 5% monthly rate, period 12
      // 1 / (1.05)^12 ≈ 0.5568
      const monthlyRate = toDecimal(0.05);
      const result = calculateDiscountFactor(monthlyRate, 12);
      expect(result.toNumber()).toBeCloseTo(0.5568, 4);
    });
  });

  describe('calculatePresentValue', () => {
    it('should calculate present value with discount factor', () => {
      const amount = '1000.0000';
      const discountFactor = toDecimal(0.9);

      const result = calculatePresentValue(amount, discountFactor);

      expect(result.toNumber()).toBeCloseTo(900, 2);
    });

    it('should handle discount factor of 1 (no discounting)', () => {
      const amount = '5000.0000';
      const discountFactor = toDecimal(1);

      const result = calculatePresentValue(amount, discountFactor);

      expect(result.toNumber()).toBe(5000);
    });

    it('should handle negative cash flows', () => {
      const amount = '-2000.0000';
      const discountFactor = toDecimal(0.95);

      const result = calculatePresentValue(amount, discountFactor);

      expect(result.toNumber()).toBeCloseTo(-1900, 2);
    });

    it('should maintain precision', () => {
      const amount = '12345.6789';
      const discountFactor = toDecimal(0.9523);

      const result = calculatePresentValue(amount, discountFactor);

      // 12345.6789 * 0.9523 ≈ 11756.5589
      expect(result.toNumber()).toBeCloseTo(11756.559, 2);
    });
  });

  describe('calculateNPV', () => {
    it('should calculate NPV for uniform cash flows', () => {
      const cashFlows: CashFlow[] = [
        { period: 1, amount: '10000.0000' },
        { period: 2, amount: '10000.0000' },
        { period: 3, amount: '10000.0000' },
      ];
      const config: NPVConfig = { annualDiscountRate: 0.12 };

      const result = calculateNPV(cashFlows, config);

      // NPV should be less than 30000 due to discounting
      expect(parseFloat(result.npv)).toBeLessThan(30000);
      expect(parseFloat(result.npv)).toBeGreaterThan(28000);
      expect(result.totalPeriods).toBe(3);
      expect(result.annualDiscountRate).toBe(0.12);
    });

    it('should return zero NPV for empty cash flows', () => {
      const result = calculateNPV([], { annualDiscountRate: 0.10 });

      expect(result.npv).toBe('0.0000');
      expect(result.totalPeriods).toBe(0);
      expect(result.averageDiscountFactor).toBe(1);
    });

    it('should calculate undiscounted total correctly', () => {
      const cashFlows: CashFlow[] = [
        { period: 1, amount: '5000.0000' },
        { period: 2, amount: '10000.0000' },
        { period: 3, amount: '15000.0000' },
      ];
      const config: NPVConfig = { annualDiscountRate: 0.10 };

      const result = calculateNPV(cashFlows, config);

      expect(result.undiscountedTotal).toBe('30000.0000');
    });

    it('should handle negative cash flows', () => {
      const cashFlows: CashFlow[] = [
        { period: 1, amount: '-5000.0000' },
        { period: 2, amount: '10000.0000' },
        { period: 3, amount: '10000.0000' },
      ];
      const config: NPVConfig = { annualDiscountRate: 0.12 };

      const result = calculateNPV(cashFlows, config);

      expect(parseFloat(result.npv)).toBeGreaterThan(0);
      expect(result.undiscountedTotal).toBe('15000.0000');
    });

    it('should use simple division when compounding is disabled', () => {
      const cashFlows: CashFlow[] = [
        { period: 12, amount: '10000.0000' },
      ];

      const withCompounding = calculateNPV(cashFlows, {
        annualDiscountRate: 0.12,
        useMonthlyCompounding: true,
      });

      const withoutCompounding = calculateNPV(cashFlows, {
        annualDiscountRate: 0.12,
        useMonthlyCompounding: false,
      });

      // Without compounding (simple 1% monthly), the discount is more aggressive
      expect(parseFloat(withoutCompounding.npv)).toBeLessThan(
        parseFloat(withCompounding.npv)
      );
    });

    it('should calculate correct monthly discount rate', () => {
      const config: NPVConfig = { annualDiscountRate: 0.12 };
      const result = calculateNPV(
        [{ period: 1, amount: '1000.0000' }],
        config
      );

      expect(result.monthlyDiscountRate).toBeCloseTo(0.009489, 5);
    });

    it('should handle zero discount rate', () => {
      const cashFlows: CashFlow[] = [
        { period: 1, amount: '10000.0000' },
        { period: 12, amount: '10000.0000' },
      ];
      const config: NPVConfig = { annualDiscountRate: 0 };

      const result = calculateNPV(cashFlows, config);

      expect(result.npv).toBe('20000.0000');
      expect(result.averageDiscountFactor).toBe(1);
    });
  });

  describe('calculatePeriodPresentValues', () => {
    it('should calculate present value for each period', () => {
      const cashFlows: CashFlow[] = [
        { period: 1, amount: '10000.0000' },
        { period: 2, amount: '10000.0000' },
        { period: 3, amount: '10000.0000' },
      ];
      const config: NPVConfig = { annualDiscountRate: 0.12 };

      const result = calculatePeriodPresentValues(cashFlows, config);

      expect(result).toHaveLength(3);
      expect(result[0]!.period).toBe(1);
      expect(result[0]!.nominalAmount).toBe('10000.0000');
      expect(result[0]!.discountFactor).toBeGreaterThan(0.99);
      expect(parseFloat(result[0]!.presentValue)).toBeLessThan(10000);
    });

    it('should show decreasing discount factors over time', () => {
      const cashFlows: CashFlow[] = Array.from({ length: 12 }, (_, i) => ({
        period: i + 1,
        amount: '1000.0000',
      }));
      const config: NPVConfig = { annualDiscountRate: 0.12 };

      const result = calculatePeriodPresentValues(cashFlows, config);

      for (let i = 1; i < result.length; i++) {
        expect(result[i]!.discountFactor).toBeLessThan(result[i - 1]!.discountFactor);
      }
    });
  });

  describe('calculateTimeAdjustedDelta', () => {
    it('should calculate time-adjusted delta for a decision', () => {
      const result = calculateTimeAdjustedDelta(
        createTestUUID(),
        '120000.0000', // $120,000 total over period
        12, // 12 months
        0.10 // 10% annual discount rate
      );

      expect(result.undiscountedDelta).toBe('120000.0000');
      expect(result.horizonMonths).toBe(12);
      expect(parseFloat(result.presentValue)).toBeLessThan(120000);
      expect(result.discountFactor).toBeLessThan(1);
      expect(result.monthlyDiscountRate).toBeCloseTo(0.00833, 4);
    });

    it('should calculate annualized value', () => {
      const result = calculateTimeAdjustedDelta(
        createTestUUID(),
        '240000.0000',
        24, // 24 months (2 years)
        0.10
      );

      // Annualized = PV / 24 * 12
      const expectedAnnualized = parseFloat(result.presentValue) / 24 * 12;
      expect(parseFloat(result.annualizedValue)).toBeCloseTo(expectedAnnualized, 0);
    });

    it('should handle zero discount rate', () => {
      const result = calculateTimeAdjustedDelta(
        createTestUUID(),
        '100000.0000',
        12,
        0
      );

      expect(result.presentValue).toBe('100000.0000');
      expect(result.discountFactor).toBe(1);
    });

    it('should handle negative delta (costs)', () => {
      const result = calculateTimeAdjustedDelta(
        createTestUUID(),
        '-50000.0000',
        6,
        0.12
      );

      expect(result.undiscountedDelta).toBe('-50000.0000');
      expect(parseFloat(result.presentValue)).toBeLessThan(0);
    });
  });

  describe('calculateSinglePeriodNPV', () => {
    it('should calculate present value of future lump sum', () => {
      // $10,000 received in month 12 with 12% annual rate
      const result = calculateSinglePeriodNPV('10000.0000', 12, 0.12);

      // 10000 / (1 + 0.01)^12 ≈ 8874.49
      expect(parseFloat(result)).toBeCloseTo(8874.49, 0);
    });

    it('should return full amount for period 0', () => {
      const result = calculateSinglePeriodNPV('10000.0000', 0, 0.12);

      expect(result).toBe('10000.0000');
    });

    it('should handle long time horizons', () => {
      // $10,000 received in month 60 (5 years)
      const result = calculateSinglePeriodNPV('10000.0000', 60, 0.12);

      // Should be significantly discounted
      expect(parseFloat(result)).toBeLessThan(6000);
    });
  });

  describe('calculateCumulativeNPV', () => {
    it('should calculate cumulative present values', () => {
      const cashFlows: CashFlow[] = [
        { period: 1, amount: '10000.0000' },
        { period: 2, amount: '10000.0000' },
        { period: 3, amount: '10000.0000' },
      ];
      const config: NPVConfig = { annualDiscountRate: 0.12 };

      const result = calculateCumulativeNPV(cashFlows, config);

      expect(result).toHaveLength(3);
      expect(result[0]!.period).toBe(1);

      // Each cumulative should be greater than the previous
      for (let i = 1; i < result.length; i++) {
        expect(parseFloat(result[i]!.cumulativePV)).toBeGreaterThan(
          parseFloat(result[i - 1]!.cumulativePV)
        );
      }
    });

    it('should handle out-of-order cash flows', () => {
      const cashFlows: CashFlow[] = [
        { period: 3, amount: '10000.0000' },
        { period: 1, amount: '10000.0000' },
        { period: 2, amount: '10000.0000' },
      ];
      const config: NPVConfig = { annualDiscountRate: 0.12 };

      const result = calculateCumulativeNPV(cashFlows, config);

      // Should be sorted by period
      expect(result[0]!.period).toBe(1);
      expect(result[1]!.period).toBe(2);
      expect(result[2]!.period).toBe(3);
    });

    it('should handle mixed positive and negative cash flows', () => {
      const cashFlows: CashFlow[] = [
        { period: 1, amount: '-5000.0000' },
        { period: 2, amount: '10000.0000' },
        { period: 3, amount: '10000.0000' },
      ];
      const config: NPVConfig = { annualDiscountRate: 0.10 };

      const result = calculateCumulativeNPV(cashFlows, config);

      // First cumulative is negative
      expect(parseFloat(result[0]!.cumulativePV)).toBeLessThan(0);
      // Final cumulative should be positive
      expect(parseFloat(result[2]!.cumulativePV)).toBeGreaterThan(0);
    });
  });

  describe('NPVEngine class', () => {
    it('should create engine with config', () => {
      const engine = new NPVEngine({ annualDiscountRate: 0.10 });

      expect(engine.annualRate).toBe(0.10);
      expect(engine.monthlyRate).toBeCloseTo(0.00833, 4);
    });

    it('should calculate NPV through instance', () => {
      const engine = new NPVEngine({ annualDiscountRate: 0.12 });

      const cashFlows: CashFlow[] = [
        { period: 1, amount: '10000.0000' },
        { period: 2, amount: '10000.0000' },
      ];

      const result = engine.npv(cashFlows);

      expect(result.totalPeriods).toBe(2);
      expect(parseFloat(result.npv)).toBeLessThan(20000);
    });

    it('should calculate discount factor for specific period', () => {
      const engine = new NPVEngine({ annualDiscountRate: 0.12 });

      const df1 = engine.discountFactor(1);
      const df12 = engine.discountFactor(12);

      expect(df1).toBeGreaterThan(df12);
      expect(df1).toBeCloseTo(0.9901, 4);
    });

    it('should calculate period present values', () => {
      const engine = new NPVEngine({ annualDiscountRate: 0.10 });

      const cashFlows: CashFlow[] = [
        { period: 1, amount: '5000.0000' },
        { period: 6, amount: '10000.0000' },
      ];

      const result = engine.periodPresentValues(cashFlows);

      expect(result).toHaveLength(2);
      expect(result[0]!.period).toBe(1);
      expect(result[1]!.period).toBe(6);
    });

    it('should calculate time-adjusted delta', () => {
      const engine = new NPVEngine({ annualDiscountRate: 0.08 });

      const result = engine.timeAdjustedDelta(
        createTestUUID(),
        '60000.0000',
        12
      );

      expect(result.horizonMonths).toBe(12);
      expect(parseFloat(result.presentValue)).toBeLessThan(60000);
    });

    it('should calculate cumulative NPV', () => {
      const engine = new NPVEngine({ annualDiscountRate: 0.10 });

      const cashFlows: CashFlow[] = [
        { period: 1, amount: '10000.0000' },
        { period: 2, amount: '10000.0000' },
        { period: 3, amount: '10000.0000' },
      ];

      const result = engine.cumulativeNPV(cashFlows);

      expect(result).toHaveLength(3);
    });

    it('should create new engine with different discount rate', () => {
      const engine = new NPVEngine({ annualDiscountRate: 0.10 });
      const newEngine = engine.withDiscountRate(0.15);

      expect(engine.annualRate).toBe(0.10);
      expect(newEngine.annualRate).toBe(0.15);
    });
  });

  describe('Mathematical Accuracy', () => {
    it('should match manual NPV calculation', () => {
      // Manual NPV calculation for verification:
      // Cash flows: $1000 per month for 3 months
      // Annual rate: 12% => Monthly rate: 1%
      // PV1 = 1000 / 1.01 = 990.0990
      // PV2 = 1000 / 1.01^2 = 980.2960
      // PV3 = 1000 / 1.01^3 = 970.5901
      // Total NPV ≈ 2941.0 (using simple monthly rate)

      const cashFlows: CashFlow[] = [
        { period: 1, amount: '1000.0000' },
        { period: 2, amount: '1000.0000' },
        { period: 3, amount: '1000.0000' },
      ];

      const result = calculateNPV(cashFlows, {
        annualDiscountRate: 0.12,
        useMonthlyCompounding: false, // Simple division for easier manual calc
      });

      expect(parseFloat(result.npv)).toBeCloseTo(2941.0, 0);
    });

    it('should correctly discount a single future payment', () => {
      // Present value of $10,000 in 1 year at 10% annual rate
      // PV = 10000 / (1.10)^1 = 9090.91

      // Using monthly: 10000 / (1 + 0.10/12)^12 ≈ 9052.87
      const result = calculateSinglePeriodNPV('10000.0000', 12, 0.10);

      expect(parseFloat(result)).toBeCloseTo(9052.87, 0);
    });

    it('should produce reasonable average discount factor', () => {
      const cashFlows: CashFlow[] = Array.from({ length: 12 }, (_, i) => ({
        period: i + 1,
        amount: '1000.0000',
      }));

      const result = calculateNPV(cashFlows, { annualDiscountRate: 0.12 });

      // Average discount factor should be around 0.94-0.95 for 12-month period
      expect(result.averageDiscountFactor).toBeGreaterThan(0.93);
      expect(result.averageDiscountFactor).toBeLessThan(0.97);
    });
  });

  describe('Determinism', () => {
    it('should produce identical results for identical inputs', () => {
      const cashFlows: CashFlow[] = [
        { period: 1, amount: '12345.6789' },
        { period: 6, amount: '98765.4321' },
        { period: 12, amount: '55555.5555' },
      ];
      const config: NPVConfig = { annualDiscountRate: 0.0875 };

      const results: NPVResult[] = [];
      for (let i = 0; i < 10; i++) {
        results.push(calculateNPV(cashFlows, config));
      }

      const firstNPV = results[0]!.npv;
      for (const result of results) {
        expect(result.npv).toBe(firstNPV);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle very high discount rate', () => {
      const cashFlows: CashFlow[] = [
        { period: 12, amount: '10000.0000' },
      ];

      const result = calculateNPV(cashFlows, { annualDiscountRate: 1.0 }); // 100%

      expect(parseFloat(result.npv)).toBeLessThan(5000);
    });

    it('should handle very low discount rate', () => {
      const cashFlows: CashFlow[] = [
        { period: 12, amount: '10000.0000' },
      ];

      const result = calculateNPV(cashFlows, { annualDiscountRate: 0.001 }); // 0.1%

      expect(parseFloat(result.npv)).toBeCloseTo(10000, -1);
    });

    it('should handle single cash flow', () => {
      const cashFlows: CashFlow[] = [
        { period: 1, amount: '50000.0000' },
      ];

      const result = calculateNPV(cashFlows, { annualDiscountRate: 0.10 });

      expect(result.totalPeriods).toBe(1);
      expect(parseFloat(result.npv)).toBeLessThan(50000);
    });

    it('should handle very long horizon', () => {
      const cashFlows: CashFlow[] = Array.from({ length: 120 }, (_, i) => ({
        period: i + 1,
        amount: '1000.0000',
      }));

      const result = calculateNPV(cashFlows, { annualDiscountRate: 0.10 });

      expect(result.totalPeriods).toBe(120);
      // 10 years of $1000/month = $120k nominal, but NPV should be much less
      expect(parseFloat(result.npv)).toBeLessThan(100000);
    });

    it('should handle zero-amount cash flows', () => {
      const cashFlows: CashFlow[] = [
        { period: 1, amount: '0.0000' },
        { period: 2, amount: '10000.0000' },
      ];

      const result = calculateNPV(cashFlows, { annualDiscountRate: 0.10 });

      expect(result.totalPeriods).toBe(2);
    });

    it('should handle non-sequential periods', () => {
      const cashFlows: CashFlow[] = [
        { period: 1, amount: '10000.0000' },
        { period: 6, amount: '10000.0000' },
        { period: 12, amount: '10000.0000' },
      ];

      const result = calculateNPV(cashFlows, { annualDiscountRate: 0.12 });

      expect(result.totalPeriods).toBe(3);
      // NPV should reflect the timing gaps
      expect(parseFloat(result.npv)).toBeLessThan(30000);
    });
  });
});
