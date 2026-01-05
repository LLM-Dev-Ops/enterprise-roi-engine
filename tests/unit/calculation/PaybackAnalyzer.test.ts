/**
 * Payback Analyzer Unit Tests
 * Tests for payback period analysis (simple and discounted).
 */

import {
  PaybackAnalyzer,
  PaybackConfig,
  PaybackResult,
  calculateSimplePaybackPeriod,
  calculateDiscountedPaybackPeriod,
  calculatePaybackPeriod,
  analyzePayback,
  calculateInterpolatedPaybackPeriod,
  generateUniformCashFlows,
} from '../../../src/calculation/PaybackAnalyzer';
import { CashFlow } from '../../../src/calculation/NPVEngine';

describe('PaybackAnalyzer', () => {
  describe('generateUniformCashFlows', () => {
    it('should generate uniform cash flows for given horizon', () => {
      const cashFlows = generateUniformCashFlows('1000.0000', 12);

      expect(cashFlows).toHaveLength(12);
      expect(cashFlows[0]!.period).toBe(1);
      expect(cashFlows[0]!.amount).toBe('1000.0000');
      expect(cashFlows[11]!.period).toBe(12);
    });

    it('should handle single month', () => {
      const cashFlows = generateUniformCashFlows('5000.0000', 1);

      expect(cashFlows).toHaveLength(1);
      expect(cashFlows[0]!.period).toBe(1);
    });

    it('should handle zero horizon', () => {
      const cashFlows = generateUniformCashFlows('1000.0000', 0);

      expect(cashFlows).toHaveLength(0);
    });
  });

  describe('calculateSimplePaybackPeriod', () => {
    it('should calculate payback for uniform cash flows', () => {
      // Investment: $10,000, Monthly savings: $1,000
      // Payback at month 10
      const cashFlows = generateUniformCashFlows('1000.0000', 24);

      const result = calculateSimplePaybackPeriod(cashFlows, '10000.0000');

      expect(result).toBe(10);
    });

    it('should return 0 for zero investment', () => {
      const cashFlows = generateUniformCashFlows('1000.0000', 12);

      const result = calculateSimplePaybackPeriod(cashFlows, '0.0000');

      expect(result).toBe(0);
    });

    it('should return 0 for negative investment', () => {
      const cashFlows = generateUniformCashFlows('1000.0000', 12);

      const result = calculateSimplePaybackPeriod(cashFlows, '-5000.0000');

      expect(result).toBe(0);
    });

    it('should return null if payback is never achieved', () => {
      // Investment: $100,000, Total savings over 12 months: $12,000
      const cashFlows = generateUniformCashFlows('1000.0000', 12);

      const result = calculateSimplePaybackPeriod(cashFlows, '100000.0000');

      expect(result).toBeNull();
    });

    it('should handle exact payback (cumulative equals investment)', () => {
      // Investment: $5,000, Monthly savings: $1,000
      // Exact payback at month 5
      const cashFlows = generateUniformCashFlows('1000.0000', 12);

      const result = calculateSimplePaybackPeriod(cashFlows, '5000.0000');

      expect(result).toBe(5);
    });

    it('should handle non-uniform cash flows', () => {
      const cashFlows: CashFlow[] = [
        { period: 1, amount: '500.0000' },
        { period: 2, amount: '1000.0000' },
        { period: 3, amount: '2000.0000' },
        { period: 4, amount: '3000.0000' },
      ];

      // Cumulative: 500, 1500, 3500, 6500
      // Investment of $3500 pays back at period 3
      const result = calculateSimplePaybackPeriod(cashFlows, '3500.0000');

      expect(result).toBe(3);
    });

    it('should handle out-of-order cash flows', () => {
      const cashFlows: CashFlow[] = [
        { period: 3, amount: '2000.0000' },
        { period: 1, amount: '1000.0000' },
        { period: 2, amount: '1500.0000' },
      ];

      // Sorted cumulative: 1000, 2500, 4500
      // Investment of $2500 pays back at period 2
      const result = calculateSimplePaybackPeriod(cashFlows, '2500.0000');

      expect(result).toBe(2);
    });

    it('should handle negative cash flows in the mix', () => {
      const cashFlows: CashFlow[] = [
        { period: 1, amount: '2000.0000' },
        { period: 2, amount: '-500.0000' }, // Loss in period 2
        { period: 3, amount: '3000.0000' },
        { period: 4, amount: '2000.0000' },
      ];

      // Cumulative: 2000, 1500, 4500, 6500
      // Investment of $3000 pays back at period 3
      const result = calculateSimplePaybackPeriod(cashFlows, '3000.0000');

      expect(result).toBe(3);
    });
  });

  describe('calculateDiscountedPaybackPeriod', () => {
    it('should calculate discounted payback (longer than simple)', () => {
      // Investment: $10,000, Monthly savings: $1,000
      // Simple payback at month 10
      // Discounted payback should be slightly later due to discounting
      const cashFlows = generateUniformCashFlows('1000.0000', 24);

      const simpleResult = calculateSimplePaybackPeriod(cashFlows, '10000.0000');
      const discountedResult = calculateDiscountedPaybackPeriod(
        cashFlows,
        '10000.0000',
        0.12
      );

      expect(discountedResult).not.toBeNull();
      expect(discountedResult!).toBeGreaterThan(simpleResult!);
    });

    it('should return 0 for zero investment', () => {
      const cashFlows = generateUniformCashFlows('1000.0000', 12);

      const result = calculateDiscountedPaybackPeriod(
        cashFlows,
        '0.0000',
        0.10
      );

      expect(result).toBe(0);
    });

    it('should return null if discounted payback never achieved', () => {
      const cashFlows = generateUniformCashFlows('1000.0000', 12);

      const result = calculateDiscountedPaybackPeriod(
        cashFlows,
        '50000.0000',
        0.12
      );

      expect(result).toBeNull();
    });

    it('should equal simple payback when discount rate is zero', () => {
      const cashFlows = generateUniformCashFlows('1000.0000', 24);

      const simpleResult = calculateSimplePaybackPeriod(cashFlows, '10000.0000');
      const discountedResult = calculateDiscountedPaybackPeriod(
        cashFlows,
        '10000.0000',
        0
      );

      expect(discountedResult).toBe(simpleResult);
    });

    it('should handle high discount rates', () => {
      const cashFlows = generateUniformCashFlows('1000.0000', 60);

      // With high discount rate, payback takes much longer
      const result = calculateDiscountedPaybackPeriod(
        cashFlows,
        '10000.0000',
        0.24 // 24% annual
      );

      // May not even achieve payback in 60 months
      // At 24% annual, monthly rate ~2%, cumulative heavily discounted
      expect(result).not.toBeNull();
      expect(result!).toBeGreaterThan(10);
    });
  });

  describe('calculatePaybackPeriod', () => {
    it('should return complete result with simple payback', () => {
      const cashFlows = generateUniformCashFlows('2000.0000', 24);
      const config: PaybackConfig = {
        initialInvestment: '12000.0000',
      };

      const result = calculatePaybackPeriod(cashFlows, config);

      expect(result.paybackPeriodMonths).toBe(6);
      expect(result.paybackPeriodYears).toBe(0.5);
      expect(result.isDiscounted).toBe(false);
      expect(result.discountRate).toBe(0);
      expect(result.achievesPayback).toBe(true);
      expect(result.breakEvenPeriod).toBe(6);
    });

    it('should return complete result with discounted payback', () => {
      const cashFlows = generateUniformCashFlows('2000.0000', 24);
      const config: PaybackConfig = {
        initialInvestment: '12000.0000',
        annualDiscountRate: 0.10,
      };

      const result = calculatePaybackPeriod(cashFlows, config);

      expect(result.paybackPeriodMonths).toBeGreaterThan(6);
      expect(result.isDiscounted).toBe(true);
      expect(result.discountRate).toBe(0.10);
      expect(result.achievesPayback).toBe(true);
    });

    it('should calculate cumulative cash flow at end', () => {
      const cashFlows = generateUniformCashFlows('1000.0000', 12);
      const config: PaybackConfig = {
        initialInvestment: '8000.0000',
      };

      const result = calculatePaybackPeriod(cashFlows, config);

      // 12 * 1000 - 8000 = 4000
      expect(result.cumulativeCashFlow).toBe('4000.0000');
    });

    it('should handle no payback scenario', () => {
      const cashFlows = generateUniformCashFlows('500.0000', 12);
      const config: PaybackConfig = {
        initialInvestment: '100000.0000',
      };

      const result = calculatePaybackPeriod(cashFlows, config);

      expect(result.paybackPeriodMonths).toBeNull();
      expect(result.paybackPeriodYears).toBeNull();
      expect(result.achievesPayback).toBe(false);
      // Cumulative: 6000 - 100000 = -94000
      expect(result.cumulativeCashFlow).toBe('-94000.0000');
    });

    it('should convert months to years correctly', () => {
      const cashFlows = generateUniformCashFlows('5000.0000', 36);
      const config: PaybackConfig = {
        initialInvestment: '60000.0000',
      };

      const result = calculatePaybackPeriod(cashFlows, config);

      expect(result.paybackPeriodMonths).toBe(12);
      expect(result.paybackPeriodYears).toBe(1);
    });
  });

  describe('analyzePayback', () => {
    it('should provide detailed period-by-period breakdown', () => {
      const cashFlows = generateUniformCashFlows('1000.0000', 6);
      const config: PaybackConfig = {
        initialInvestment: '3000.0000',
      };

      const analysis = analyzePayback(cashFlows, config);

      expect(analysis.periodDetails).toHaveLength(6);
      expect(analysis.initialInvestment).toBe('3000.0000');
      expect(analysis.result.achievesPayback).toBe(true);
    });

    it('should show cash flow progression', () => {
      const cashFlows: CashFlow[] = [
        { period: 1, amount: '1000.0000' },
        { period: 2, amount: '2000.0000' },
        { period: 3, amount: '3000.0000' },
      ];
      const config: PaybackConfig = {
        initialInvestment: '4000.0000',
      };

      const analysis = analyzePayback(cashFlows, config);

      expect(analysis.periodDetails[0]!.period).toBe(1);
      expect(analysis.periodDetails[0]!.cashFlow).toBe('1000.0000');
      expect(analysis.periodDetails[0]!.cumulativeCashFlow).toBe('-3000.0000'); // -4000 + 1000
      expect(analysis.periodDetails[1]!.cumulativeCashFlow).toBe('-1000.0000'); // -3000 + 2000
      expect(analysis.periodDetails[2]!.cumulativeCashFlow).toBe('2000.0000'); // -1000 + 3000
    });

    it('should calculate discount factors for each period', () => {
      const cashFlows = generateUniformCashFlows('1000.0000', 6);
      const config: PaybackConfig = {
        initialInvestment: '3000.0000',
        annualDiscountRate: 0.12,
      };

      const analysis = analyzePayback(cashFlows, config);

      // Discount factors should decrease over time
      for (let i = 1; i < analysis.periodDetails.length; i++) {
        expect(analysis.periodDetails[i]!.discountFactor).toBeLessThan(
          analysis.periodDetails[i - 1]!.discountFactor
        );
      }
    });

    it('should show remaining to payback', () => {
      const cashFlows = generateUniformCashFlows('1000.0000', 6);
      const config: PaybackConfig = {
        initialInvestment: '4000.0000',
      };

      const analysis = analyzePayback(cashFlows, config);

      // After period 1: remaining = 4000 - 1000 = 3000
      expect(analysis.periodDetails[0]!.remainingToPayback).toBe('3000.0000');
      // After period 4: remaining = 4000 - 4000 = 0
      expect(analysis.periodDetails[3]!.remainingToPayback).toBe('0.0000');
      // After period 5: already paid back, remaining = 0
      expect(analysis.periodDetails[4]!.remainingToPayback).toBe('0.0000');
    });

    it('should calculate discounted cash flows', () => {
      const cashFlows: CashFlow[] = [
        { period: 1, amount: '10000.0000' },
      ];
      const config: PaybackConfig = {
        initialInvestment: '9000.0000',
        annualDiscountRate: 0.12,
      };

      const analysis = analyzePayback(cashFlows, config);

      // Discounted cash flow should be less than nominal
      expect(parseFloat(analysis.periodDetails[0]!.discountedCashFlow)).toBeLessThan(10000);
      expect(parseFloat(analysis.periodDetails[0]!.discountedCashFlow)).toBeCloseTo(9901, 0);
    });
  });

  describe('calculateInterpolatedPaybackPeriod', () => {
    it('should interpolate payback period within a month', () => {
      const cashFlows: CashFlow[] = [
        { period: 1, amount: '3000.0000' },
        { period: 2, amount: '5000.0000' },
      ];
      const config: PaybackConfig = {
        initialInvestment: '5000.0000',
      };

      const result = calculateInterpolatedPaybackPeriod(cashFlows, config);

      // After period 1: cumulative = -2000 (need 2000 more)
      // Period 2 provides 5000
      // Need 2000/5000 = 0.4 of period 2
      // Interpolated = 1 + 0.4 = 1.4 months
      expect(result).toBeCloseTo(1.4, 1);
    });

    it('should return 0 for zero investment', () => {
      const cashFlows = generateUniformCashFlows('1000.0000', 12);
      const config: PaybackConfig = {
        initialInvestment: '0.0000',
      };

      const result = calculateInterpolatedPaybackPeriod(cashFlows, config);

      expect(result).toBe(0);
    });

    it('should handle exact payback at period boundary', () => {
      const cashFlows = generateUniformCashFlows('1000.0000', 12);
      const config: PaybackConfig = {
        initialInvestment: '5000.0000',
      };

      const result = calculateInterpolatedPaybackPeriod(cashFlows, config);

      expect(result).toBe(5);
    });

    it('should return null if payback never achieved', () => {
      const cashFlows = generateUniformCashFlows('100.0000', 12);
      const config: PaybackConfig = {
        initialInvestment: '10000.0000',
      };

      const result = calculateInterpolatedPaybackPeriod(cashFlows, config);

      expect(result).toBeNull();
    });

    it('should work with discounted cash flows', () => {
      const cashFlows = generateUniformCashFlows('1000.0000', 24);
      const config: PaybackConfig = {
        initialInvestment: '10000.0000',
        annualDiscountRate: 0.12,
      };

      const simpleInterpolated = calculateInterpolatedPaybackPeriod(
        cashFlows,
        { ...config, annualDiscountRate: 0 }
      );
      const discountedInterpolated = calculateInterpolatedPaybackPeriod(cashFlows, config);

      expect(discountedInterpolated).toBeGreaterThan(simpleInterpolated!);
    });

    it('should handle first period payback', () => {
      const cashFlows: CashFlow[] = [
        { period: 1, amount: '10000.0000' },
        { period: 2, amount: '5000.0000' },
      ];
      const config: PaybackConfig = {
        initialInvestment: '5000.0000',
      };

      const result = calculateInterpolatedPaybackPeriod(cashFlows, config);

      // Payback at 5000/10000 = 0.5 of period 1
      expect(result).toBeCloseTo(0.5, 2);
    });
  });

  describe('PaybackAnalyzer class', () => {
    it('should create analyzer with config', () => {
      const analyzer = new PaybackAnalyzer({
        initialInvestment: '10000.0000',
        annualDiscountRate: 0.10,
      });

      expect(analyzer.investment).toBe('10000.0000');
    });

    it('should calculate simple payback', () => {
      const analyzer = new PaybackAnalyzer({
        initialInvestment: '6000.0000',
        annualDiscountRate: 0.10,
      });

      const cashFlows = generateUniformCashFlows('1000.0000', 12);
      const result = analyzer.simplePayback(cashFlows);

      expect(result.paybackPeriodMonths).toBe(6);
      expect(result.isDiscounted).toBe(false);
    });

    it('should calculate discounted payback', () => {
      const analyzer = new PaybackAnalyzer({
        initialInvestment: '6000.0000',
        annualDiscountRate: 0.10,
      });

      const cashFlows = generateUniformCashFlows('1000.0000', 12);
      const result = analyzer.discountedPayback(cashFlows);

      expect(result.paybackPeriodMonths).toBeGreaterThan(6);
      expect(result.isDiscounted).toBe(true);
    });

    it('should perform detailed analysis', () => {
      const analyzer = new PaybackAnalyzer({
        initialInvestment: '5000.0000',
      });

      const cashFlows = generateUniformCashFlows('1000.0000', 12);
      const analysis = analyzer.analyze(cashFlows);

      expect(analysis.periodDetails).toHaveLength(12);
      expect(analysis.result.achievesPayback).toBe(true);
    });

    it('should calculate interpolated payback', () => {
      const analyzer = new PaybackAnalyzer({
        initialInvestment: '5500.0000',
      });

      const cashFlows = generateUniformCashFlows('1000.0000', 12);
      const result = analyzer.interpolatedPayback(cashFlows);

      expect(result).toBeCloseTo(5.5, 1);
    });

    it('should check if investment pays back within time', () => {
      const analyzer = new PaybackAnalyzer({
        initialInvestment: '10000.0000',
      });

      const cashFlows = generateUniformCashFlows('2000.0000', 12);

      expect(analyzer.paysBackWithin(cashFlows, 6)).toBe(true);
      expect(analyzer.paysBackWithin(cashFlows, 4)).toBe(false);
    });

    it('should create new analyzer with different investment', () => {
      const analyzer = new PaybackAnalyzer({
        initialInvestment: '10000.0000',
      });

      const newAnalyzer = analyzer.withInvestment('20000.0000');

      expect(analyzer.investment).toBe('10000.0000');
      expect(newAnalyzer.investment).toBe('20000.0000');
    });

    it('should create new analyzer with different discount rate', () => {
      const analyzer = new PaybackAnalyzer({
        initialInvestment: '10000.0000',
        annualDiscountRate: 0.10,
      });

      const cashFlows = generateUniformCashFlows('1000.0000', 24);

      const newAnalyzer = analyzer.withDiscountRate(0.20);

      const result1 = analyzer.discountedPayback(cashFlows);
      const result2 = newAnalyzer.discountedPayback(cashFlows);

      expect(result2.paybackPeriodMonths).toBeGreaterThan(result1.paybackPeriodMonths!);
    });
  });

  describe('Mathematical Accuracy', () => {
    it('should match manual simple payback calculation', () => {
      // Investment: $12,000
      // Monthly savings: $2,000
      // Payback = 12000 / 2000 = 6 months
      const cashFlows = generateUniformCashFlows('2000.0000', 12);

      const result = calculateSimplePaybackPeriod(cashFlows, '12000.0000');

      expect(result).toBe(6);
    });

    it('should calculate discounted payback accurately', () => {
      // With 12% annual rate (1% monthly), discounted payback should be slightly longer
      // Month 1 PV: 2000 / 1.01 = 1980.20
      // Month 2 PV: 2000 / 1.01^2 = 1960.59
      // etc...
      // Need to accumulate 12000

      const cashFlows = generateUniformCashFlows('2000.0000', 24);

      const result = calculateDiscountedPaybackPeriod(
        cashFlows,
        '12000.0000',
        0.12
      );

      expect(result).toBeGreaterThan(6);
      expect(result).toBeLessThan(8);
    });
  });

  describe('Determinism', () => {
    it('should produce identical results for identical inputs', () => {
      const cashFlows = generateUniformCashFlows('1234.5678', 24);
      const config: PaybackConfig = {
        initialInvestment: '12345.6789',
        annualDiscountRate: 0.0875,
      };

      const results: PaybackResult[] = [];
      for (let i = 0; i < 10; i++) {
        results.push(calculatePaybackPeriod(cashFlows, config));
      }

      const firstResult = results[0]!;
      for (const result of results) {
        expect(result.paybackPeriodMonths).toBe(firstResult.paybackPeriodMonths);
        expect(result.cumulativeCashFlow).toBe(firstResult.cumulativeCashFlow);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large investment', () => {
      const cashFlows = generateUniformCashFlows('1000000.0000', 120);
      const config: PaybackConfig = {
        initialInvestment: '50000000.0000',
      };

      const result = calculatePaybackPeriod(cashFlows, config);

      expect(result.paybackPeriodMonths).toBe(50);
    });

    it('should handle very small cash flows', () => {
      const cashFlows = generateUniformCashFlows('0.0100', 120);
      const config: PaybackConfig = {
        initialInvestment: '1.0000',
      };

      const result = calculatePaybackPeriod(cashFlows, config);

      expect(result.paybackPeriodMonths).toBe(100);
    });

    it('should handle immediate payback (first period)', () => {
      const cashFlows: CashFlow[] = [
        { period: 1, amount: '10000.0000' },
      ];
      const config: PaybackConfig = {
        initialInvestment: '5000.0000',
      };

      const result = calculatePaybackPeriod(cashFlows, config);

      expect(result.paybackPeriodMonths).toBe(1);
    });

    it('should handle gaps in cash flow periods', () => {
      const cashFlows: CashFlow[] = [
        { period: 1, amount: '1000.0000' },
        { period: 6, amount: '5000.0000' },
        { period: 12, amount: '5000.0000' },
      ];
      const config: PaybackConfig = {
        initialInvestment: '5000.0000',
      };

      const result = calculatePaybackPeriod(cashFlows, config);

      // 1000 in period 1, then 5000 in period 6 gets us to 6000
      expect(result.paybackPeriodMonths).toBe(6);
    });

    it('should handle all negative cash flows (no payback possible)', () => {
      const cashFlows: CashFlow[] = [
        { period: 1, amount: '-1000.0000' },
        { period: 2, amount: '-1000.0000' },
        { period: 3, amount: '-1000.0000' },
      ];
      const config: PaybackConfig = {
        initialInvestment: '5000.0000',
      };

      const result = calculatePaybackPeriod(cashFlows, config);

      expect(result.achievesPayback).toBe(false);
      expect(result.paybackPeriodMonths).toBeNull();
    });

    it('should handle alternating positive and negative cash flows', () => {
      const cashFlows: CashFlow[] = [
        { period: 1, amount: '3000.0000' },
        { period: 2, amount: '-1000.0000' },
        { period: 3, amount: '3000.0000' },
        { period: 4, amount: '-500.0000' },
        { period: 5, amount: '2000.0000' },
      ];
      const config: PaybackConfig = {
        initialInvestment: '5000.0000',
      };

      const result = calculatePaybackPeriod(cashFlows, config);

      // Cumulative: 3000, 2000, 5000, 4500, 6500
      // Need 5000, achieved at period 3
      expect(result.paybackPeriodMonths).toBe(3);
    });
  });
});
