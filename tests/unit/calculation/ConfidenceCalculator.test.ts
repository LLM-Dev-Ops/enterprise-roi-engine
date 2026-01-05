/**
 * Confidence Calculator Unit Tests
 * Tests for confidence intervals and risk adjustment calculations.
 */

import {
  ConfidenceCalculator,
  ConfidenceConfig,
  RiskWeightConfig,
  Z_SCORES,
  STANDARD_CONFIDENCE_LEVELS,
  calculateUncertaintyFactor,
  calculateMargin,
  calculateIntervalBounds,
  generateConfidenceIntervals,
  calculateRiskComponents,
  calculateRiskFactor,
  calculateRiskAdjustedDelta,
} from '../../../src/calculation/ConfidenceCalculator';
import { toDecimal } from '../../../src/lib/financial';

// Helper to create a UUID-like string for testing
const createTestUUID = (suffix: string = '1'): string =>
  `00000000-0000-0000-0000-00000000000${suffix}`;

describe('ConfidenceCalculator', () => {
  describe('Z_SCORES constant', () => {
    it('should have correct Z-score for 50% confidence', () => {
      expect(Z_SCORES[50]).toBeCloseTo(0.674, 3);
    });

    it('should have correct Z-score for 75% confidence', () => {
      expect(Z_SCORES[75]).toBeCloseTo(1.150, 3);
    });

    it('should have correct Z-score for 90% confidence', () => {
      expect(Z_SCORES[90]).toBeCloseTo(1.645, 3);
    });

    it('should have correct Z-score for 95% confidence', () => {
      expect(Z_SCORES[95]).toBeCloseTo(1.960, 3);
    });

    it('should have correct Z-score for 99% confidence', () => {
      expect(Z_SCORES[99]).toBeCloseTo(2.576, 3);
    });
  });

  describe('STANDARD_CONFIDENCE_LEVELS constant', () => {
    it('should contain all standard levels', () => {
      expect(STANDARD_CONFIDENCE_LEVELS).toEqual([50, 75, 90, 95, 99]);
    });
  });

  describe('calculateUncertaintyFactor', () => {
    it('should calculate uncertainty from confidence and volatility', () => {
      // (1 - 0.8) * (1 + 0.3) = 0.2 * 1.3 = 0.26
      const result = calculateUncertaintyFactor(0.8, 0.3);
      expect(result.toNumber()).toBeCloseTo(0.26, 4);
    });

    it('should return 0 for perfect confidence (1.0)', () => {
      const result = calculateUncertaintyFactor(1.0, 0.5);
      expect(result.toNumber()).toBe(0);
    });

    it('should return high uncertainty for zero confidence', () => {
      // (1 - 0) * (1 + 0.5) = 1.5
      const result = calculateUncertaintyFactor(0, 0.5);
      expect(result.toNumber()).toBe(1.5);
    });

    it('should handle zero volatility', () => {
      // (1 - 0.7) * (1 + 0) = 0.3
      const result = calculateUncertaintyFactor(0.7, 0);
      expect(result.toNumber()).toBeCloseTo(0.3, 4);
    });

    it('should handle maximum volatility (1.0)', () => {
      // (1 - 0.5) * (1 + 1.0) = 0.5 * 2 = 1.0
      const result = calculateUncertaintyFactor(0.5, 1.0);
      expect(result.toNumber()).toBe(1.0);
    });

    it('should clamp confidence above 1 to 1', () => {
      // (1 - 1) * (1 + 0.3) = 0
      const result = calculateUncertaintyFactor(1.5, 0.3);
      expect(result.toNumber()).toBe(0);
    });

    it('should clamp confidence below 0 to 0', () => {
      // (1 - 0) * (1 + 0.3) = 1.3
      const result = calculateUncertaintyFactor(-0.5, 0.3);
      expect(result.toNumber()).toBeCloseTo(1.3, 4);
    });

    it('should clamp volatility below 0 to 0', () => {
      // (1 - 0.8) * (1 + 0) = 0.2
      const result = calculateUncertaintyFactor(0.8, -0.2);
      expect(result.toNumber()).toBeCloseTo(0.2, 4);
    });

    it('should clamp volatility above 1 to 1', () => {
      // (1 - 0.8) * (1 + 1) = 0.4
      const result = calculateUncertaintyFactor(0.8, 1.5);
      expect(result.toNumber()).toBeCloseTo(0.4, 4);
    });
  });

  describe('calculateMargin', () => {
    it('should calculate margin correctly', () => {
      // |100000| * 0.2 * 1.96 = 39200
      const baseValue = '100000.0000';
      const uncertaintyFactor = toDecimal(0.2);
      const zScore = 1.96;

      const result = calculateMargin(baseValue, uncertaintyFactor, zScore);

      expect(result.toNumber()).toBeCloseTo(39200, 0);
    });

    it('should handle negative base value (uses absolute)', () => {
      const baseValue = '-50000.0000';
      const uncertaintyFactor = toDecimal(0.1);
      const zScore = 1.645;

      const result = calculateMargin(baseValue, uncertaintyFactor, zScore);

      // |-50000| * 0.1 * 1.645 = 8225
      expect(result.toNumber()).toBeCloseTo(8225, 0);
    });

    it('should return 0 for zero uncertainty', () => {
      const baseValue = '100000.0000';
      const uncertaintyFactor = toDecimal(0);
      const zScore = 1.96;

      const result = calculateMargin(baseValue, uncertaintyFactor, zScore);

      expect(result.toNumber()).toBe(0);
    });

    it('should return 0 for zero base value', () => {
      const baseValue = '0.0000';
      const uncertaintyFactor = toDecimal(0.2);
      const zScore = 1.96;

      const result = calculateMargin(baseValue, uncertaintyFactor, zScore);

      expect(result.toNumber()).toBe(0);
    });

    it('should accept Decimal as base value', () => {
      const baseValue = toDecimal('100000.0000');
      const uncertaintyFactor = toDecimal(0.1);
      const zScore = 2.0;

      const result = calculateMargin(baseValue, uncertaintyFactor, zScore);

      expect(result.toNumber()).toBe(20000);
    });
  });

  describe('calculateIntervalBounds', () => {
    it('should calculate interval bounds for 95% confidence', () => {
      const baseValue = '100000.0000';
      const uncertaintyFactor = toDecimal(0.2);

      const result = calculateIntervalBounds(baseValue, uncertaintyFactor, 95);

      expect(result.confidenceLevel).toBe(95);
      // Margin = 100000 * 0.2 * 1.96 = 39200
      expect(parseFloat(result.margin)).toBeCloseTo(39200, 0);
      expect(parseFloat(result.lowerBound)).toBeCloseTo(60800, 0);
      expect(parseFloat(result.upperBound)).toBeCloseTo(139200, 0);
    });

    it('should throw for unsupported confidence level', () => {
      const baseValue = '100000.0000';
      const uncertaintyFactor = toDecimal(0.2);

      expect(() =>
        calculateIntervalBounds(baseValue, uncertaintyFactor, 80)
      ).toThrow('Unsupported confidence level: 80');
    });

    it('should produce wider intervals for higher confidence levels', () => {
      const baseValue = '100000.0000';
      const uncertaintyFactor = toDecimal(0.2);

      const bounds90 = calculateIntervalBounds(baseValue, uncertaintyFactor, 90);
      const bounds95 = calculateIntervalBounds(baseValue, uncertaintyFactor, 95);
      const bounds99 = calculateIntervalBounds(baseValue, uncertaintyFactor, 99);

      expect(parseFloat(bounds95.margin)).toBeGreaterThan(parseFloat(bounds90.margin));
      expect(parseFloat(bounds99.margin)).toBeGreaterThan(parseFloat(bounds95.margin));
    });

    it('should produce symmetric intervals around base value', () => {
      const baseValue = '100000.0000';
      const uncertaintyFactor = toDecimal(0.15);

      const result = calculateIntervalBounds(baseValue, uncertaintyFactor, 90);

      const distToLower = 100000 - parseFloat(result.lowerBound);
      const distToUpper = parseFloat(result.upperBound) - 100000;

      expect(distToLower).toBeCloseTo(distToUpper, 0);
    });

    it('should handle negative base value', () => {
      const baseValue = '-50000.0000';
      const uncertaintyFactor = toDecimal(0.2);

      const result = calculateIntervalBounds(baseValue, uncertaintyFactor, 95);

      // Base is negative, so bounds should also be negative
      expect(parseFloat(result.lowerBound)).toBeLessThan(parseFloat(result.upperBound));
      expect(parseFloat(result.lowerBound)).toBeLessThan(-50000);
      expect(parseFloat(result.upperBound)).toBeGreaterThan(-50000);
    });
  });

  describe('generateConfidenceIntervals', () => {
    it('should generate intervals for all standard confidence levels', () => {
      const config: ConfidenceConfig = {
        confidenceScore: 0.8,
        volatilityScore: 0.3,
      };

      const result = generateConfidenceIntervals('100000.0000', config);

      expect(result.intervals.size).toBe(5);
      expect(result.intervals.has(50)).toBe(true);
      expect(result.intervals.has(75)).toBe(true);
      expect(result.intervals.has(90)).toBe(true);
      expect(result.intervals.has(95)).toBe(true);
      expect(result.intervals.has(99)).toBe(true);
    });

    it('should generate intervals for custom confidence levels', () => {
      const config: ConfidenceConfig = {
        confidenceScore: 0.8,
        volatilityScore: 0.3,
        confidenceLevels: [90, 95],
      };

      const result = generateConfidenceIntervals('100000.0000', config);

      expect(result.intervals.size).toBe(2);
      expect(result.intervals.has(90)).toBe(true);
      expect(result.intervals.has(95)).toBe(true);
    });

    it('should include base value and uncertainty factor', () => {
      const config: ConfidenceConfig = {
        confidenceScore: 0.8,
        volatilityScore: 0.3,
      };

      const result = generateConfidenceIntervals('100000.0000', config);

      expect(result.baseValue).toBe('100000.0000');
      expect(result.uncertaintyFactor).toBeCloseTo(0.26, 4);
    });

    it('should calculate p10, p50, p90 values', () => {
      const config: ConfidenceConfig = {
        confidenceScore: 0.8,
        volatilityScore: 0.3,
      };

      const result = generateConfidenceIntervals('100000.0000', config);

      // p50 should be the base value
      expect(result.p50Value).toBe('100000.0000');
      // p10 should be less than p50
      expect(parseFloat(result.p10Value)).toBeLessThan(parseFloat(result.p50Value));
      // p90 should be greater than p50
      expect(parseFloat(result.p90Value)).toBeGreaterThan(parseFloat(result.p50Value));
    });

    it('should produce symmetric p10/p90 values', () => {
      const config: ConfidenceConfig = {
        confidenceScore: 0.7,
        volatilityScore: 0.4,
      };

      const result = generateConfidenceIntervals('100000.0000', config);

      const distToP10 = 100000 - parseFloat(result.p10Value);
      const distToP90 = parseFloat(result.p90Value) - 100000;

      expect(distToP10).toBeCloseTo(distToP90, 0);
    });
  });

  describe('calculateRiskComponents', () => {
    const defaultRiskConfig: RiskWeightConfig = {
      baseWeight: 1.0,
      volatilityMultiplier: 0.5,
      confidenceDecayRate: 0.3,
      maxWeight: 2.5,
    };

    it('should calculate confidence factor correctly', () => {
      // confidenceFactor = 1 - (1 - confidence) * decayRate
      // = 1 - (1 - 0.8) * 0.3 = 1 - 0.06 = 0.94
      const result = calculateRiskComponents(0.8, 0.3, defaultRiskConfig);

      expect(result.confidenceFactor).toBeCloseTo(0.94, 4);
    });

    it('should calculate volatility adjustment correctly', () => {
      // volatilityAdjustment = volatility * multiplier
      // = 0.3 * 0.5 = 0.15
      const result = calculateRiskComponents(0.8, 0.3, defaultRiskConfig);

      expect(result.volatilityAdjustment).toBeCloseTo(0.15, 4);
    });

    it('should include base weight', () => {
      const result = calculateRiskComponents(0.8, 0.3, defaultRiskConfig);

      expect(result.baseWeight).toBe(1.0);
    });

    it('should clamp confidence factor to [0, 1]', () => {
      // With very low confidence, factor could go negative without clamping
      const lowConfidence = calculateRiskComponents(0.0, 0.3, {
        ...defaultRiskConfig,
        confidenceDecayRate: 1.5, // Aggressive decay
      });

      expect(lowConfidence.confidenceFactor).toBeGreaterThanOrEqual(0);
      expect(lowConfidence.confidenceFactor).toBeLessThanOrEqual(1);
    });

    it('should clamp volatility adjustment to non-negative', () => {
      const result = calculateRiskComponents(0.8, -0.5, defaultRiskConfig);

      expect(result.volatilityAdjustment).toBe(0);
    });

    it('should handle perfect confidence (1.0)', () => {
      // confidenceFactor = 1 - (1 - 1.0) * 0.3 = 1
      const result = calculateRiskComponents(1.0, 0.3, defaultRiskConfig);

      expect(result.confidenceFactor).toBe(1);
    });

    it('should handle zero volatility', () => {
      const result = calculateRiskComponents(0.8, 0.0, defaultRiskConfig);

      expect(result.volatilityAdjustment).toBe(0);
    });
  });

  describe('calculateRiskFactor', () => {
    it('should calculate risk factor from components', () => {
      // riskFactor = baseWeight * confidenceFactor * (1 + volatilityAdjustment)
      // = 1.0 * 0.94 * 1.15 = 1.081
      const components = {
        baseWeight: 1.0,
        confidenceFactor: 0.94,
        volatilityAdjustment: 0.15,
      };

      const result = calculateRiskFactor(components, 2.5);

      expect(result).toBeCloseTo(1.081, 3);
    });

    it('should clamp to maxWeight', () => {
      const components = {
        baseWeight: 2.0,
        confidenceFactor: 1.0,
        volatilityAdjustment: 1.0,
      };

      // Raw: 2.0 * 1.0 * 2.0 = 4.0, but max is 2.5
      const result = calculateRiskFactor(components, 2.5);

      expect(result).toBe(2.5);
    });

    it('should allow factors below maxWeight', () => {
      const components = {
        baseWeight: 1.0,
        confidenceFactor: 0.5,
        volatilityAdjustment: 0.1,
      };

      // Raw: 1.0 * 0.5 * 1.1 = 0.55
      const result = calculateRiskFactor(components, 2.5);

      expect(result).toBeCloseTo(0.55, 3);
    });
  });

  describe('calculateRiskAdjustedDelta', () => {
    const defaultRiskConfig: RiskWeightConfig = {
      baseWeight: 1.0,
      volatilityMultiplier: 0.5,
      confidenceDecayRate: 0.3,
      maxWeight: 2.5,
    };

    it('should calculate risk-adjusted delta', () => {
      const result = calculateRiskAdjustedDelta(
        createTestUUID(),
        '50000.0000', // grossNetDelta
        '100000.0000', // totalSavings
        '50000.0000', // totalCosts
        0.8, // confidenceScore
        0.3, // volatilityScore
        'TEST_CATEGORY',
        defaultRiskConfig
      );

      expect(result.grossNetDelta).toBe('50000.0000');
      expect(result.riskCategory).toBe('TEST_CATEGORY');
      expect(result.riskFactor).toBeCloseTo(1.081, 2);
    });

    it('should reduce savings by dividing by risk factor', () => {
      const result = calculateRiskAdjustedDelta(
        createTestUUID(),
        '50000.0000',
        '100000.0000',
        '50000.0000',
        0.8,
        0.3,
        'TEST',
        defaultRiskConfig
      );

      // Adjusted savings = savings / riskFactor
      // Lower riskFactor = more savings; Higher riskFactor = less savings
      expect(parseFloat(result.adjustedSavings)).toBeLessThan(100000);
    });

    it('should increase costs by multiplying by risk factor', () => {
      const result = calculateRiskAdjustedDelta(
        createTestUUID(),
        '50000.0000',
        '100000.0000',
        '50000.0000',
        0.8,
        0.3,
        'TEST',
        defaultRiskConfig
      );

      // Adjusted costs = costs * riskFactor
      expect(parseFloat(result.adjustedCosts)).toBeGreaterThan(50000);
    });

    it('should calculate adjusted net delta', () => {
      const result = calculateRiskAdjustedDelta(
        createTestUUID(),
        '50000.0000',
        '100000.0000',
        '50000.0000',
        0.8,
        0.3,
        'TEST',
        defaultRiskConfig
      );

      // adjustedNetDelta = adjustedSavings - adjustedCosts
      const expectedNet =
        parseFloat(result.adjustedSavings) - parseFloat(result.adjustedCosts);
      expect(parseFloat(result.adjustedNetDelta)).toBeCloseTo(expectedNet, 2);
    });

    it('should include risk components', () => {
      const result = calculateRiskAdjustedDelta(
        createTestUUID(),
        '50000.0000',
        '100000.0000',
        '50000.0000',
        0.8,
        0.3,
        'TEST',
        defaultRiskConfig
      );

      expect(result.riskComponents.baseWeight).toBe(1.0);
      expect(result.riskComponents.confidenceFactor).toBeCloseTo(0.94, 2);
      expect(result.riskComponents.volatilityAdjustment).toBeCloseTo(0.15, 2);
    });

    it('should handle high confidence (less risk adjustment)', () => {
      const highConfResult = calculateRiskAdjustedDelta(
        createTestUUID(),
        '50000.0000',
        '100000.0000',
        '50000.0000',
        0.95, // High confidence
        0.1, // Low volatility
        'TEST',
        defaultRiskConfig
      );

      const lowConfResult = calculateRiskAdjustedDelta(
        createTestUUID(),
        '50000.0000',
        '100000.0000',
        '50000.0000',
        0.5, // Low confidence
        0.5, // High volatility
        'TEST',
        defaultRiskConfig
      );

      // High confidence should result in more favorable adjusted delta
      expect(parseFloat(highConfResult.adjustedNetDelta)).toBeGreaterThan(
        parseFloat(lowConfResult.adjustedNetDelta)
      );
    });
  });

  describe('ConfidenceCalculator class', () => {
    it('should create calculator with default config', () => {
      const calculator = new ConfidenceCalculator();

      expect(calculator.confidenceLevels).toEqual(STANDARD_CONFIDENCE_LEVELS);
    });

    it('should create calculator with custom confidence config', () => {
      const calculator = new ConfidenceCalculator({
        confidenceScore: 0.9,
        volatilityScore: 0.2,
        confidenceLevels: [90, 95],
      });

      expect(calculator.confidenceLevels).toEqual([90, 95]);
    });

    it('should calculate uncertainty factor', () => {
      const calculator = new ConfidenceCalculator({
        confidenceScore: 0.8,
        volatilityScore: 0.3,
      });

      const result = calculator.uncertaintyFactor();

      expect(result).toBeCloseTo(0.26, 4);
    });

    it('should calculate uncertainty with override config', () => {
      const calculator = new ConfidenceCalculator({
        confidenceScore: 0.8,
        volatilityScore: 0.3,
      });

      const result = calculator.uncertaintyFactor({
        confidenceScore: 0.9,
        volatilityScore: 0.1,
      });

      // (1 - 0.9) * (1 + 0.1) = 0.11
      expect(result).toBeCloseTo(0.11, 4);
    });

    it('should generate confidence intervals', () => {
      const calculator = new ConfidenceCalculator({
        confidenceScore: 0.8,
        volatilityScore: 0.3,
      });

      const result = calculator.intervals('100000.0000');

      expect(result.baseValue).toBe('100000.0000');
      expect(result.intervals.size).toBe(5);
    });

    it('should calculate specific interval bounds', () => {
      const calculator = new ConfidenceCalculator({
        confidenceScore: 0.8,
        volatilityScore: 0.3,
      });

      const result = calculator.bounds('100000.0000', 95);

      expect(result.confidenceLevel).toBe(95);
      expect(parseFloat(result.lowerBound)).toBeLessThan(100000);
      expect(parseFloat(result.upperBound)).toBeGreaterThan(100000);
    });

    it('should calculate risk components', () => {
      const calculator = new ConfidenceCalculator(
        { confidenceScore: 0.8, volatilityScore: 0.3 },
        { baseWeight: 1.0, volatilityMultiplier: 0.5, confidenceDecayRate: 0.3, maxWeight: 2.5 }
      );

      const result = calculator.riskComponents();

      expect(result.baseWeight).toBe(1.0);
      expect(result.confidenceFactor).toBeCloseTo(0.94, 2);
      expect(result.volatilityAdjustment).toBeCloseTo(0.15, 2);
    });

    it('should adjust delta with risk', () => {
      const calculator = new ConfidenceCalculator(
        { confidenceScore: 0.8, volatilityScore: 0.3 },
        { baseWeight: 1.0, volatilityMultiplier: 0.5, confidenceDecayRate: 0.3, maxWeight: 2.5 }
      );

      const result = calculator.adjustDelta(
        createTestUUID(),
        '50000.0000',
        '100000.0000',
        '50000.0000',
        'TEST_CATEGORY'
      );

      expect(result.riskCategory).toBe('TEST_CATEGORY');
      expect(parseFloat(result.adjustedNetDelta)).toBeDefined();
    });

    it('should create new calculator with different config', () => {
      const calculator = new ConfidenceCalculator({
        confidenceScore: 0.8,
        volatilityScore: 0.3,
      });

      const newCalculator = calculator.withConfig({
        confidenceScore: 0.9,
      });

      const originalUncertainty = calculator.uncertaintyFactor();
      const newUncertainty = newCalculator.uncertaintyFactor();

      expect(newUncertainty).toBeLessThan(originalUncertainty);
    });

    it('should create new calculator with different risk config', () => {
      const calculator = new ConfidenceCalculator(
        { confidenceScore: 0.8, volatilityScore: 0.3 },
        { baseWeight: 1.0, volatilityMultiplier: 0.5, confidenceDecayRate: 0.3, maxWeight: 2.5 }
      );

      const newCalculator = calculator.withRiskConfig({
        baseWeight: 1.5,
      });

      const originalComponents = calculator.riskComponents();
      const newComponents = newCalculator.riskComponents();

      expect(originalComponents.baseWeight).toBe(1.0);
      expect(newComponents.baseWeight).toBe(1.5);
    });
  });

  describe('Mathematical Accuracy', () => {
    it('should produce mathematically correct uncertainty factor', () => {
      // Manual calculation: (1 - 0.75) * (1 + 0.25) = 0.25 * 1.25 = 0.3125
      const result = calculateUncertaintyFactor(0.75, 0.25);

      expect(result.toNumber()).toBe(0.3125);
    });

    it('should produce mathematically correct margin', () => {
      // Manual: |50000| * 0.2 * 1.645 = 16450
      const result = calculateMargin('50000.0000', toDecimal(0.2), 1.645);

      expect(result.toNumber()).toBe(16450);
    });

    it('should produce correct interval bounds', () => {
      // For 90% CI with Z=1.645, uncertainty=0.2, base=100000
      // Margin = 100000 * 0.2 * 1.645 = 32900
      // Lower = 100000 - 32900 = 67100
      // Upper = 100000 + 32900 = 132900
      const result = calculateIntervalBounds('100000.0000', toDecimal(0.2), 90);

      expect(parseFloat(result.margin)).toBeCloseTo(32900, 0);
      expect(parseFloat(result.lowerBound)).toBeCloseTo(67100, 0);
      expect(parseFloat(result.upperBound)).toBeCloseTo(132900, 0);
    });
  });

  describe('Determinism', () => {
    it('should produce identical results for identical inputs', () => {
      const config: ConfidenceConfig = {
        confidenceScore: 0.85,
        volatilityScore: 0.35,
      };

      const results = [];
      for (let i = 0; i < 10; i++) {
        results.push(generateConfidenceIntervals('123456.7890', config));
      }

      const firstP10 = results[0]!.p10Value;
      const firstP90 = results[0]!.p90Value;
      const firstUncertainty = results[0]!.uncertaintyFactor;

      for (const result of results) {
        expect(result.p10Value).toBe(firstP10);
        expect(result.p90Value).toBe(firstP90);
        expect(result.uncertaintyFactor).toBe(firstUncertainty);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero base value', () => {
      const config: ConfidenceConfig = {
        confidenceScore: 0.8,
        volatilityScore: 0.3,
      };

      const result = generateConfidenceIntervals('0.0000', config);

      expect(result.baseValue).toBe('0.0000');
      expect(result.p10Value).toBe('0.0000');
      expect(result.p50Value).toBe('0.0000');
      expect(result.p90Value).toBe('0.0000');
    });

    it('should handle very large base value', () => {
      const config: ConfidenceConfig = {
        confidenceScore: 0.8,
        volatilityScore: 0.3,
      };

      const result = generateConfidenceIntervals('999999999999.9999', config);

      expect(parseFloat(result.p10Value)).toBeLessThan(parseFloat(result.p50Value));
      expect(parseFloat(result.p90Value)).toBeGreaterThan(parseFloat(result.p50Value));
    });

    it('should handle very small base value', () => {
      const config: ConfidenceConfig = {
        confidenceScore: 0.8,
        volatilityScore: 0.3,
      };

      const result = generateConfidenceIntervals('0.0001', config);

      expect(result.baseValue).toBe('0.0001');
    });

    it('should handle extreme confidence (near 0)', () => {
      const config: ConfidenceConfig = {
        confidenceScore: 0.01,
        volatilityScore: 0.99,
      };

      const result = generateConfidenceIntervals('100000.0000', config);

      // Very wide intervals expected
      expect(parseFloat(result.p90Value) - parseFloat(result.p10Value)).toBeGreaterThan(100000);
    });

    it('should handle extreme confidence (near 1)', () => {
      const config: ConfidenceConfig = {
        confidenceScore: 0.99,
        volatilityScore: 0.01,
      };

      const result = generateConfidenceIntervals('100000.0000', config);

      // Very narrow intervals expected
      expect(parseFloat(result.p90Value) - parseFloat(result.p10Value)).toBeLessThan(10000);
    });

    it('should handle negative base value for risk adjustment', () => {
      const defaultRiskConfig: RiskWeightConfig = {
        baseWeight: 1.0,
        volatilityMultiplier: 0.5,
        confidenceDecayRate: 0.3,
        maxWeight: 2.5,
      };

      const result = calculateRiskAdjustedDelta(
        createTestUUID(),
        '-25000.0000',
        '25000.0000',
        '50000.0000',
        0.8,
        0.3,
        'TEST',
        defaultRiskConfig
      );

      expect(parseFloat(result.adjustedNetDelta)).toBeLessThan(0);
    });
  });
});
