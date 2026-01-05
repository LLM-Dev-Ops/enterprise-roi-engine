/**
 * Sensitivity Engine Unit Tests
 * Tests for sensitivity analysis and tornado diagrams.
 */

import {
  SensitivityEngine,
  SensitivityFactorConfig,
  SensitivityFactorType,
  SensitivityAnalysisConfig,
  calculateElasticity,
  calculateNPVWithDiscountRate,
  applyCashFlowMultiplier,
  filterCashFlowsByHorizon,
  analyzeSingleFactor,
  performSensitivityAnalysis,
  generateStandardFactors,
  calculateDiscountRateSensitivityCurve,
} from '../../../src/calculation/SensitivityEngine';
import { CashFlow } from '../../../src/calculation/NPVEngine';
import { toDecimal } from '../../../src/lib/financial';

// Helper to create test cash flows
const createTestCashFlows = (
  amount: string,
  periods: number
): CashFlow[] => {
  return Array.from({ length: periods }, (_, i) => ({
    period: i + 1,
    amount,
  }));
};

// Helper to create test analysis config
const createTestConfig = (
  cashFlows: CashFlow[],
  discountRate: number = 0.10
): SensitivityAnalysisConfig => ({
  baseNPVConfig: { annualDiscountRate: discountRate },
  baseCashFlows: cashFlows,
  currency: 'USD',
  asOfDate: '2024-01-01T00:00:00.000Z',
});

describe('SensitivityEngine', () => {
  describe('calculateElasticity', () => {
    it('should calculate elasticity correctly', () => {
      // If NPV changes by 20% when factor changes by 10%, elasticity = 2
      const baseNPV = toDecimal('100000');
      const newNPV = toDecimal('120000'); // 20% increase
      const baseFactorValue = 1.0;
      const newFactorValue = 1.1; // 10% increase

      const result = calculateElasticity(baseNPV, newNPV, baseFactorValue, newFactorValue);

      expect(result).toBeCloseTo(2.0, 1);
    });

    it('should return 0 when base factor is zero', () => {
      const result = calculateElasticity(
        toDecimal('100000'),
        toDecimal('110000'),
        0,
        0.1
      );

      expect(result).toBe(0);
    });

    it('should return 0 when base NPV is zero', () => {
      const result = calculateElasticity(
        toDecimal('0'),
        toDecimal('10000'),
        1.0,
        1.1
      );

      expect(result).toBe(0);
    });

    it('should return 0 when factor change is zero', () => {
      const result = calculateElasticity(
        toDecimal('100000'),
        toDecimal('110000'),
        1.0,
        1.0
      );

      expect(result).toBe(0);
    });

    it('should handle negative elasticity', () => {
      // NPV decreases when factor increases
      const baseNPV = toDecimal('100000');
      const newNPV = toDecimal('90000'); // 10% decrease
      const baseFactorValue = 1.0;
      const newFactorValue = 1.1; // 10% increase

      const result = calculateElasticity(baseNPV, newNPV, baseFactorValue, newFactorValue);

      expect(result).toBeCloseTo(-1.0, 1);
    });

    it('should handle fractional elasticity', () => {
      // NPV changes by 5% when factor changes by 10%
      const baseNPV = toDecimal('100000');
      const newNPV = toDecimal('105000');
      const baseFactorValue = 0.10;
      const newFactorValue = 0.11; // 10% change

      const result = calculateElasticity(baseNPV, newNPV, baseFactorValue, newFactorValue);

      expect(result).toBeCloseTo(0.5, 1);
    });
  });

  describe('calculateNPVWithDiscountRate', () => {
    it('should calculate NPV with given discount rate', () => {
      const cashFlows = createTestCashFlows('10000.0000', 12);

      const result = calculateNPVWithDiscountRate(cashFlows, 0.12);

      expect(result.toNumber()).toBeLessThan(120000);
      expect(result.toNumber()).toBeGreaterThan(100000);
    });

    it('should return higher NPV with lower discount rate', () => {
      const cashFlows = createTestCashFlows('10000.0000', 12);

      const lowRate = calculateNPVWithDiscountRate(cashFlows, 0.05);
      const highRate = calculateNPVWithDiscountRate(cashFlows, 0.15);

      expect(lowRate.toNumber()).toBeGreaterThan(highRate.toNumber());
    });

    it('should return sum of cash flows with zero discount rate', () => {
      const cashFlows = createTestCashFlows('1000.0000', 12);

      const result = calculateNPVWithDiscountRate(cashFlows, 0);

      expect(result.toNumber()).toBe(12000);
    });
  });

  describe('applyCashFlowMultiplier', () => {
    it('should multiply all cash flows by factor', () => {
      const cashFlows: CashFlow[] = [
        { period: 1, amount: '1000.0000' },
        { period: 2, amount: '2000.0000' },
      ];

      const result = applyCashFlowMultiplier(cashFlows, 1.5);

      expect(result[0]!.amount).toBe('1500.0000');
      expect(result[1]!.amount).toBe('3000.0000');
    });

    it('should handle multiplier of 1 (no change)', () => {
      const cashFlows: CashFlow[] = [
        { period: 1, amount: '1000.0000' },
      ];

      const result = applyCashFlowMultiplier(cashFlows, 1.0);

      expect(result[0]!.amount).toBe('1000.0000');
    });

    it('should handle multiplier less than 1', () => {
      const cashFlows: CashFlow[] = [
        { period: 1, amount: '1000.0000' },
      ];

      const result = applyCashFlowMultiplier(cashFlows, 0.8);

      expect(result[0]!.amount).toBe('800.0000');
    });

    it('should handle negative cash flows', () => {
      const cashFlows: CashFlow[] = [
        { period: 1, amount: '-1000.0000' },
      ];

      const result = applyCashFlowMultiplier(cashFlows, 2.0);

      expect(result[0]!.amount).toBe('-2000.0000');
    });

    it('should preserve period numbers', () => {
      const cashFlows: CashFlow[] = [
        { period: 3, amount: '1000.0000' },
        { period: 7, amount: '2000.0000' },
      ];

      const result = applyCashFlowMultiplier(cashFlows, 1.5);

      expect(result[0]!.period).toBe(3);
      expect(result[1]!.period).toBe(7);
    });
  });

  describe('filterCashFlowsByHorizon', () => {
    it('should filter cash flows to specified horizon', () => {
      const cashFlows = createTestCashFlows('1000.0000', 24);

      const result = filterCashFlowsByHorizon(cashFlows, 12);

      expect(result).toHaveLength(12);
      expect(result[result.length - 1]!.period).toBe(12);
    });

    it('should include all cash flows if horizon exceeds length', () => {
      const cashFlows = createTestCashFlows('1000.0000', 6);

      const result = filterCashFlowsByHorizon(cashFlows, 12);

      expect(result).toHaveLength(6);
    });

    it('should handle zero horizon', () => {
      const cashFlows = createTestCashFlows('1000.0000', 12);

      const result = filterCashFlowsByHorizon(cashFlows, 0);

      expect(result).toHaveLength(0);
    });

    it('should handle non-sequential periods', () => {
      const cashFlows: CashFlow[] = [
        { period: 1, amount: '1000.0000' },
        { period: 6, amount: '2000.0000' },
        { period: 12, amount: '3000.0000' },
        { period: 18, amount: '4000.0000' },
      ];

      const result = filterCashFlowsByHorizon(cashFlows, 12);

      expect(result).toHaveLength(3);
      expect(result.map(cf => cf.period)).toEqual([1, 6, 12]);
    });
  });

  describe('analyzeSingleFactor', () => {
    it('should analyze discount rate factor', () => {
      const cashFlows = createTestCashFlows('10000.0000', 12);
      const config = createTestConfig(cashFlows, 0.10);

      const factor: SensitivityFactorConfig = {
        factorName: 'Discount Rate',
        baseValue: 0.10,
        lowValue: 0.05,
        highValue: 0.15,
        factorType: SensitivityFactorType.DISCOUNT_RATE,
      };

      const result = analyzeSingleFactor(config, factor);

      expect(result.factorName).toBe('Discount Rate');
      expect(result.baseValue).toBe(0.10);
      expect(result.lowValue).toBe(0.05);
      expect(result.highValue).toBe(0.15);
      // Higher discount rate = lower NPV, so impact should be negative range
      expect(parseFloat(result.impactOnNPV.amount)).toBeLessThan(0);
    });

    it('should analyze benefit multiplier factor', () => {
      const cashFlows = createTestCashFlows('10000.0000', 12);
      const config = createTestConfig(cashFlows, 0.10);

      const factor: SensitivityFactorConfig = {
        factorName: 'Benefit Multiplier',
        baseValue: 1.0,
        lowValue: 0.8,
        highValue: 1.2,
        factorType: SensitivityFactorType.BENEFIT_MULTIPLIER,
      };

      const result = analyzeSingleFactor(config, factor);

      // Higher benefit = higher NPV, positive impact
      expect(parseFloat(result.impactOnNPV.amount)).toBeGreaterThan(0);
    });

    it('should analyze cost multiplier factor with negative cash flows', () => {
      const cashFlows: CashFlow[] = [
        { period: 1, amount: '-5000.0000' }, // Cost
        { period: 2, amount: '15000.0000' }, // Benefit
      ];
      const config = createTestConfig(cashFlows, 0.10);

      const factor: SensitivityFactorConfig = {
        factorName: 'Cost Multiplier',
        baseValue: 1.0,
        lowValue: 0.8,
        highValue: 1.2,
        factorType: SensitivityFactorType.COST_MULTIPLIER,
      };

      const result = analyzeSingleFactor(config, factor);

      // Higher costs = lower NPV (more negative)
      expect(result.factorName).toBe('Cost Multiplier');
    });

    it('should analyze time horizon factor', () => {
      const cashFlows = createTestCashFlows('10000.0000', 24);
      const config = createTestConfig(cashFlows, 0.10);

      const factor: SensitivityFactorConfig = {
        factorName: 'Time Horizon',
        baseValue: 24,
        lowValue: 12,
        highValue: 36,
        factorType: SensitivityFactorType.TIME_HORIZON,
      };

      const result = analyzeSingleFactor(config, factor);

      // Longer horizon = more cash flows = higher NPV
      expect(parseFloat(result.impactOnNPV.amount)).toBeGreaterThan(0);
    });

    it('should calculate elasticity', () => {
      const cashFlows = createTestCashFlows('10000.0000', 12);
      const config = createTestConfig(cashFlows, 0.10);

      const factor: SensitivityFactorConfig = {
        factorName: 'Test Factor',
        baseValue: 1.0,
        lowValue: 0.9,
        highValue: 1.1,
        factorType: SensitivityFactorType.BENEFIT_MULTIPLIER,
      };

      const result = analyzeSingleFactor(config, factor);

      // Elasticity should be close to 1 for direct multiplier relationship
      expect(Math.abs(result.elasticity)).toBeCloseTo(1.0, 0);
    });
  });

  describe('performSensitivityAnalysis', () => {
    it('should analyze multiple factors and sort by impact', () => {
      const cashFlows = createTestCashFlows('10000.0000', 12);
      const config = createTestConfig(cashFlows, 0.10);

      const factors = generateStandardFactors(0.10, 12);

      const result = performSensitivityAnalysis(config, factors);

      expect(result.factors.length).toBe(4);
      expect(result.tornadoOrder.length).toBe(4);

      // Factors should be sorted by absolute impact (descending)
      for (let i = 1; i < result.factors.length; i++) {
        const prevImpact = Math.abs(parseFloat(result.factors[i - 1]!.impactOnNPV.amount));
        const currImpact = Math.abs(parseFloat(result.factors[i]!.impactOnNPV.amount));
        expect(prevImpact).toBeGreaterThanOrEqual(currImpact);
      }
    });

    it('should return tornado order as factor names', () => {
      const cashFlows = createTestCashFlows('10000.0000', 12);
      const config = createTestConfig(cashFlows, 0.10);

      const factors: SensitivityFactorConfig[] = [
        {
          factorName: 'Factor A',
          baseValue: 1.0,
          lowValue: 0.9,
          highValue: 1.1,
          factorType: SensitivityFactorType.BENEFIT_MULTIPLIER,
        },
        {
          factorName: 'Factor B',
          baseValue: 0.10,
          lowValue: 0.05,
          highValue: 0.15,
          factorType: SensitivityFactorType.DISCOUNT_RATE,
        },
      ];

      const result = performSensitivityAnalysis(config, factors);

      expect(result.tornadoOrder).toContain('Factor A');
      expect(result.tornadoOrder).toContain('Factor B');
    });

    it('should handle empty factors array', () => {
      const config = createTestConfig(createTestCashFlows('10000.0000', 12));

      const result = performSensitivityAnalysis(config, []);

      expect(result.factors).toHaveLength(0);
      expect(result.tornadoOrder).toHaveLength(0);
    });
  });

  describe('generateStandardFactors', () => {
    it('should generate 4 standard factors', () => {
      const factors = generateStandardFactors(0.10, 12);

      expect(factors).toHaveLength(4);
    });

    it('should include discount rate factor', () => {
      const factors = generateStandardFactors(0.10, 12);

      const discountFactor = factors.find(
        f => f.factorType === SensitivityFactorType.DISCOUNT_RATE
      );

      expect(discountFactor).toBeDefined();
      expect(discountFactor!.baseValue).toBe(0.10);
      expect(discountFactor!.lowValue).toBe(0.05);
      expect(discountFactor!.highValue).toBe(0.15);
    });

    it('should include cost multiplier factor', () => {
      const factors = generateStandardFactors(0.10, 12);

      const costFactor = factors.find(
        f => f.factorType === SensitivityFactorType.COST_MULTIPLIER
      );

      expect(costFactor).toBeDefined();
      expect(costFactor!.baseValue).toBe(1.0);
      expect(costFactor!.lowValue).toBe(0.8);
      expect(costFactor!.highValue).toBe(1.2);
    });

    it('should include benefit multiplier factor', () => {
      const factors = generateStandardFactors(0.10, 12);

      const benefitFactor = factors.find(
        f => f.factorType === SensitivityFactorType.BENEFIT_MULTIPLIER
      );

      expect(benefitFactor).toBeDefined();
      expect(benefitFactor!.baseValue).toBe(1.0);
    });

    it('should include time horizon factor', () => {
      const factors = generateStandardFactors(0.10, 24);

      const horizonFactor = factors.find(
        f => f.factorType === SensitivityFactorType.TIME_HORIZON
      );

      expect(horizonFactor).toBeDefined();
      expect(horizonFactor!.baseValue).toBe(24);
      expect(horizonFactor!.lowValue).toBe(12);
      expect(horizonFactor!.highValue).toBe(36);
    });

    it('should ensure minimum time horizon of 1', () => {
      const factors = generateStandardFactors(0.10, 1);

      const horizonFactor = factors.find(
        f => f.factorType === SensitivityFactorType.TIME_HORIZON
      );

      expect(horizonFactor!.lowValue).toBe(1);
    });
  });

  describe('calculateDiscountRateSensitivityCurve', () => {
    it('should calculate NPV at multiple discount rates', () => {
      const cashFlows = createTestCashFlows('10000.0000', 12);
      const ratePoints = [0.05, 0.10, 0.15, 0.20];

      const result = calculateDiscountRateSensitivityCurve(cashFlows, ratePoints);

      expect(result).toHaveLength(4);
      expect(result.map(r => r.rate)).toEqual(ratePoints);
    });

    it('should show decreasing NPV with increasing rate', () => {
      const cashFlows = createTestCashFlows('10000.0000', 12);
      const ratePoints = [0.05, 0.10, 0.15, 0.20];

      const result = calculateDiscountRateSensitivityCurve(cashFlows, ratePoints);

      for (let i = 1; i < result.length; i++) {
        expect(parseFloat(result[i]!.npv)).toBeLessThan(parseFloat(result[i - 1]!.npv));
      }
    });

    it('should handle empty rate points', () => {
      const cashFlows = createTestCashFlows('10000.0000', 12);

      const result = calculateDiscountRateSensitivityCurve(cashFlows, []);

      expect(result).toHaveLength(0);
    });

    it('should handle zero discount rate', () => {
      const cashFlows = createTestCashFlows('1000.0000', 12);

      const result = calculateDiscountRateSensitivityCurve(cashFlows, [0]);

      expect(result[0]!.rate).toBe(0);
      expect(result[0]!.npv).toBe('12000.0000');
    });
  });

  describe('SensitivityEngine class', () => {
    it('should create engine with config', () => {
      const cashFlows = createTestCashFlows('10000.0000', 12);
      const config = createTestConfig(cashFlows, 0.10);
      const engine = new SensitivityEngine(config);

      expect(engine.baseConfig.annualDiscountRate).toBe(0.10);
    });

    it('should analyze single factor', () => {
      const cashFlows = createTestCashFlows('10000.0000', 12);
      const config = createTestConfig(cashFlows, 0.10);
      const engine = new SensitivityEngine(config);

      const factor: SensitivityFactorConfig = {
        factorName: 'Test',
        baseValue: 1.0,
        lowValue: 0.8,
        highValue: 1.2,
        factorType: SensitivityFactorType.BENEFIT_MULTIPLIER,
      };

      const result = engine.analyzeFactor(factor);

      expect(result.factorName).toBe('Test');
    });

    it('should perform full analysis', () => {
      const cashFlows = createTestCashFlows('10000.0000', 12);
      const config = createTestConfig(cashFlows, 0.10);
      const engine = new SensitivityEngine(config);

      const factors = generateStandardFactors(0.10, 12);
      const result = engine.analyze(factors);

      expect(result.factors.length).toBe(4);
    });

    it('should perform standard analysis', () => {
      const cashFlows = createTestCashFlows('10000.0000', 12);
      const config = createTestConfig(cashFlows, 0.10);
      const engine = new SensitivityEngine(config);

      const result = engine.analyzeStandard();

      expect(result.factors.length).toBe(4);
    });

    it('should calculate discount rate curve with defaults', () => {
      const cashFlows = createTestCashFlows('10000.0000', 12);
      const config = createTestConfig(cashFlows, 0.10);
      const engine = new SensitivityEngine(config);

      const result = engine.discountRateCurve();

      expect(result.length).toBe(8); // Default 8 rate points
    });

    it('should calculate discount rate curve with custom points', () => {
      const cashFlows = createTestCashFlows('10000.0000', 12);
      const config = createTestConfig(cashFlows, 0.10);
      const engine = new SensitivityEngine(config);

      const result = engine.discountRateCurve([0.05, 0.15]);

      expect(result.length).toBe(2);
    });

    it('should calculate what-if scenario', () => {
      const cashFlows = createTestCashFlows('10000.0000', 12);
      const config = createTestConfig(cashFlows, 0.10);
      const engine = new SensitivityEngine(config);

      const result = engine.whatIf((cfs) =>
        cfs.map(cf => ({ ...cf, amount: '20000.0000' }))
      );

      // Doubled cash flows should roughly double NPV
      expect(parseFloat(result)).toBeGreaterThan(200000);
    });

    it('should create new engine with different cash flows', () => {
      const cashFlows1 = createTestCashFlows('10000.0000', 12);
      const config = createTestConfig(cashFlows1, 0.10);
      const engine = new SensitivityEngine(config);

      const cashFlows2 = createTestCashFlows('20000.0000', 12);
      const newEngine = engine.withCashFlows(cashFlows2);

      const result1 = engine.discountRateCurve([0.10])[0]!;
      const result2 = newEngine.discountRateCurve([0.10])[0]!;

      expect(parseFloat(result2.npv)).toBeCloseTo(parseFloat(result1.npv) * 2, -2);
    });

    it('should create new engine with different discount rate', () => {
      const cashFlows = createTestCashFlows('10000.0000', 12);
      const config = createTestConfig(cashFlows, 0.10);
      const engine = new SensitivityEngine(config);

      const newEngine = engine.withDiscountRate(0.15);

      expect(engine.baseConfig.annualDiscountRate).toBe(0.10);
      expect(newEngine.baseConfig.annualDiscountRate).toBe(0.15);
    });
  });

  describe('Determinism', () => {
    it('should produce identical results for identical inputs', () => {
      const cashFlows = createTestCashFlows('12345.6789', 12);
      const config = createTestConfig(cashFlows, 0.0875);
      const factors = generateStandardFactors(0.0875, 12);

      const results = [];
      for (let i = 0; i < 5; i++) {
        results.push(performSensitivityAnalysis(config, factors));
      }

      const firstTornadoOrder = results[0]!.tornadoOrder;
      for (const result of results) {
        expect(result.tornadoOrder).toEqual(firstTornadoOrder);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle very small cash flows', () => {
      const cashFlows: CashFlow[] = [
        { period: 1, amount: '0.0001' },
      ];
      const config = createTestConfig(cashFlows, 0.10);

      const factor: SensitivityFactorConfig = {
        factorName: 'Test',
        baseValue: 1.0,
        lowValue: 0.5,
        highValue: 1.5,
        factorType: SensitivityFactorType.BENEFIT_MULTIPLIER,
      };

      const result = analyzeSingleFactor(config, factor);

      expect(result.impactOnNPV.amount).toBeDefined();
    });

    it('should handle very large cash flows', () => {
      const cashFlows: CashFlow[] = [
        { period: 1, amount: '999999999.9999' },
      ];
      const config = createTestConfig(cashFlows, 0.10);

      const factor: SensitivityFactorConfig = {
        factorName: 'Test',
        baseValue: 1.0,
        lowValue: 0.9,
        highValue: 1.1,
        factorType: SensitivityFactorType.BENEFIT_MULTIPLIER,
      };

      const result = analyzeSingleFactor(config, factor);

      expect(parseFloat(result.impactOnNPV.amount)).toBeGreaterThan(0);
    });

    it('should handle single period cash flow', () => {
      const cashFlows: CashFlow[] = [
        { period: 1, amount: '10000.0000' },
      ];
      const config = createTestConfig(cashFlows, 0.10);

      const factors = generateStandardFactors(0.10, 1);
      const result = performSensitivityAnalysis(config, factors);

      expect(result.factors.length).toBe(4);
    });

    it('should handle zero base discount rate', () => {
      const factors = generateStandardFactors(0, 12);

      const discountFactor = factors.find(
        f => f.factorType === SensitivityFactorType.DISCOUNT_RATE
      );

      expect(discountFactor!.baseValue).toBe(0);
      expect(discountFactor!.lowValue).toBe(0);
      expect(discountFactor!.highValue).toBe(0);
    });

    it('should handle mixed positive and negative cash flows', () => {
      const cashFlows: CashFlow[] = [
        { period: 1, amount: '-10000.0000' },
        { period: 2, amount: '5000.0000' },
        { period: 3, amount: '8000.0000' },
      ];
      const config = createTestConfig(cashFlows, 0.10);

      const factors = generateStandardFactors(0.10, 3);
      const result = performSensitivityAnalysis(config, factors);

      expect(result.factors.length).toBe(4);
    });
  });
});
