/**
 * ROI Calculator Unit Tests
 * Tests for ROI calculations with decimal.js precision.
 */

import {
  ROICalculator,
  ROIMethodology,
  calculateGrossDelta,
  calculateSimpleROI,
  calculateAnnualizedROI,
  calculateROI,
  calculateGrossDeltaFromChain,
  aggregateGrossDeltas,
  DeltaInput,
  ROIResult,
} from '../../../src/calculation/ROICalculator';
import { GrossDelta, AttributionChain, FiscalPeriod } from '../../../src/contracts';
import { toDecimal } from '../../../src/lib/financial';

// Helper to create a UUID-like string for testing
const createTestUUID = (suffix: string = '1'): string =>
  `00000000-0000-0000-0000-00000000000${suffix}`;

// Helper to create a test fiscal period
const createTestFiscalPeriod = (): FiscalPeriod => ({
  year: 2024,
  period: 1,
  startDate: '2024-01-01T00:00:00.000Z',
  endDate: '2024-01-31T23:59:59.999Z',
});

describe('ROICalculator', () => {
  describe('calculateGrossDelta', () => {
    it('should calculate positive net delta when savings exceed costs', () => {
      const input: DeltaInput = {
        totalSavings: '100000.0000',
        totalCosts: '25000.0000',
        decisionRecordId: createTestUUID(),
      };

      const result = calculateGrossDelta(input);

      expect(result.totalSavings).toBe('100000.0000');
      expect(result.totalCosts).toBe('25000.0000');
      expect(result.netDelta).toBe('75000.0000');
      expect(result.savingsToCostRatio).toBeCloseTo(4.0, 4);
      expect(result.decisionRecordId).toBe(input.decisionRecordId);
    });

    it('should calculate negative net delta when costs exceed savings', () => {
      const input: DeltaInput = {
        totalSavings: '10000.0000',
        totalCosts: '30000.0000',
        decisionRecordId: createTestUUID(),
      };

      const result = calculateGrossDelta(input);

      expect(result.netDelta).toBe('-20000.0000');
      expect(result.savingsToCostRatio).toBeCloseTo(0.3333, 4);
    });

    it('should handle zero costs with null ratio', () => {
      const input: DeltaInput = {
        totalSavings: '50000.0000',
        totalCosts: '0.0000',
        decisionRecordId: createTestUUID(),
      };

      const result = calculateGrossDelta(input);

      expect(result.netDelta).toBe('50000.0000');
      expect(result.savingsToCostRatio).toBeNull();
    });

    it('should handle zero savings', () => {
      const input: DeltaInput = {
        totalSavings: '0.0000',
        totalCosts: '15000.0000',
        decisionRecordId: createTestUUID(),
      };

      const result = calculateGrossDelta(input);

      expect(result.netDelta).toBe('-15000.0000');
      expect(result.savingsToCostRatio).toBeCloseTo(0, 4);
    });

    it('should handle both zero (break-even)', () => {
      const input: DeltaInput = {
        totalSavings: '0.0000',
        totalCosts: '0.0000',
        decisionRecordId: createTestUUID(),
      };

      const result = calculateGrossDelta(input);

      expect(result.netDelta).toBe('0.0000');
      expect(result.savingsToCostRatio).toBeNull();
    });

    it('should maintain 4 decimal place precision', () => {
      const input: DeltaInput = {
        totalSavings: '12345.6789',
        totalCosts: '9876.5432',
        decisionRecordId: createTestUUID(),
      };

      const result = calculateGrossDelta(input);

      // 12345.6789 - 9876.5432 = 2469.1357
      expect(result.netDelta).toBe('2469.1357');
    });

    it('should handle very large values without precision loss', () => {
      const input: DeltaInput = {
        totalSavings: '999999999999.9999',
        totalCosts: '111111111111.1111',
        decisionRecordId: createTestUUID(),
      };

      const result = calculateGrossDelta(input);

      expect(result.netDelta).toBe('888888888888.8888');
    });

    it('should handle very small values with precision', () => {
      const input: DeltaInput = {
        totalSavings: '0.0001',
        totalCosts: '0.0001',
        decisionRecordId: createTestUUID(),
      };

      const result = calculateGrossDelta(input);

      expect(result.netDelta).toBe('0.0000');
      expect(result.savingsToCostRatio).toBeCloseTo(1, 4);
    });
  });

  describe('calculateSimpleROI', () => {
    it('should calculate positive ROI correctly', () => {
      // ROI = (Benefit - Cost) / Cost = netDelta / cost
      // If savings = 150000, costs = 100000, net = 50000
      // ROI = 50000 / 100000 = 0.50 (50%)
      const grossDelta: GrossDelta = {
        decisionRecordId: createTestUUID(),
        totalSavings: '150000.0000',
        totalCosts: '100000.0000',
        netDelta: '50000.0000',
        savingsToCostRatio: 1.5,
      };

      const result = calculateSimpleROI(grossDelta);

      expect(result.toNumber()).toBeCloseTo(0.5, 4);
    });

    it('should calculate negative ROI for losses', () => {
      // If savings = 80000, costs = 100000, net = -20000
      // ROI = -20000 / 100000 = -0.20 (-20%)
      const grossDelta: GrossDelta = {
        decisionRecordId: createTestUUID(),
        totalSavings: '80000.0000',
        totalCosts: '100000.0000',
        netDelta: '-20000.0000',
        savingsToCostRatio: 0.8,
      };

      const result = calculateSimpleROI(grossDelta);

      expect(result.toNumber()).toBeCloseTo(-0.2, 4);
    });

    it('should return zero when costs are zero', () => {
      const grossDelta: GrossDelta = {
        decisionRecordId: createTestUUID(),
        totalSavings: '50000.0000',
        totalCosts: '0.0000',
        netDelta: '50000.0000',
        savingsToCostRatio: null,
      };

      const result = calculateSimpleROI(grossDelta);

      expect(result.toNumber()).toBe(0);
    });

    it('should calculate 100% ROI when benefit equals cost', () => {
      // If savings = 200000, costs = 100000, net = 100000
      // ROI = 100000 / 100000 = 1.0 (100%)
      const grossDelta: GrossDelta = {
        decisionRecordId: createTestUUID(),
        totalSavings: '200000.0000',
        totalCosts: '100000.0000',
        netDelta: '100000.0000',
        savingsToCostRatio: 2.0,
      };

      const result = calculateSimpleROI(grossDelta);

      expect(result.toNumber()).toBeCloseTo(1.0, 4);
    });

    it('should handle break-even scenario', () => {
      const grossDelta: GrossDelta = {
        decisionRecordId: createTestUUID(),
        totalSavings: '100000.0000',
        totalCosts: '100000.0000',
        netDelta: '0.0000',
        savingsToCostRatio: 1.0,
      };

      const result = calculateSimpleROI(grossDelta);

      expect(result.toNumber()).toBe(0);
    });
  });

  describe('calculateAnnualizedROI', () => {
    it('should annualize a 12-month ROI (no change for 1-year period)', () => {
      // For a 12-month period, annual ROI should equal the simple ROI
      // (1 + 0.20)^(12/12) - 1 = 0.20
      const simpleROI = toDecimal('0.20');
      const result = calculateAnnualizedROI(simpleROI, 12);

      expect(result.toNumber()).toBeCloseTo(0.20, 4);
    });

    it('should calculate higher annualized ROI for 6-month period', () => {
      // For a 6-month period with 10% simple ROI:
      // (1 + 0.10)^(12/6) - 1 = (1.10)^2 - 1 = 0.21
      const simpleROI = toDecimal('0.10');
      const result = calculateAnnualizedROI(simpleROI, 6);

      expect(result.toNumber()).toBeCloseTo(0.21, 2);
    });

    it('should calculate lower annualized ROI for 24-month period', () => {
      // For a 24-month period with 20% simple ROI:
      // (1 + 0.20)^(12/24) - 1 = (1.20)^0.5 - 1 ≈ 0.0954
      const simpleROI = toDecimal('0.20');
      const result = calculateAnnualizedROI(simpleROI, 24);

      expect(result.toNumber()).toBeCloseTo(0.0954, 3);
    });

    it('should throw for zero horizon months', () => {
      const simpleROI = toDecimal('0.10');

      expect(() => calculateAnnualizedROI(simpleROI, 0)).toThrow(
        'Horizon months must be positive'
      );
    });

    it('should throw for negative horizon months', () => {
      const simpleROI = toDecimal('0.10');

      expect(() => calculateAnnualizedROI(simpleROI, -6)).toThrow(
        'Horizon months must be positive'
      );
    });

    it('should handle negative ROI (loss) correctly', () => {
      // For a loss, we use linear annualization
      const simpleROI = toDecimal('-0.30');
      const result = calculateAnnualizedROI(simpleROI, 6);

      // Linear annualization: -0.30 * (12/6) = -0.60
      expect(result.toNumber()).toBeCloseTo(-0.60, 2);
    });

    it('should handle very small positive ROI', () => {
      const simpleROI = toDecimal('0.01');
      const result = calculateAnnualizedROI(simpleROI, 12);

      expect(result.toNumber()).toBeCloseTo(0.01, 4);
    });

    it('should handle large ROI values', () => {
      // 200% simple ROI over 12 months
      const simpleROI = toDecimal('2.00');
      const result = calculateAnnualizedROI(simpleROI, 12);

      expect(result.toNumber()).toBeCloseTo(2.00, 2);
    });
  });

  describe('calculateROI', () => {
    const grossDelta: GrossDelta = {
      decisionRecordId: createTestUUID(),
      totalSavings: '150000.0000',
      totalCosts: '100000.0000',
      netDelta: '50000.0000',
      savingsToCostRatio: 1.5,
    };

    it('should calculate simple ROI with SIMPLE methodology', () => {
      const result = calculateROI(grossDelta, {
        methodology: ROIMethodology.SIMPLE,
      });

      expect(result.methodology).toBe(ROIMethodology.SIMPLE);
      expect(result.roi).toBeCloseTo(0.5, 4);
      expect(result.roiPercentage).toBe('50.00%');
      expect(result.isPositiveReturn).toBe(true);
      expect(result.grossDelta).toBe(grossDelta);
    });

    it('should calculate annualized ROI with ANNUALIZED methodology', () => {
      const result = calculateROI(grossDelta, {
        methodology: ROIMethodology.ANNUALIZED,
        horizonMonths: 6,
      });

      expect(result.methodology).toBe(ROIMethodology.ANNUALIZED);
      // (1 + 0.5)^2 - 1 = 1.25
      expect(result.roi).toBeCloseTo(1.25, 2);
      expect(result.isPositiveReturn).toBe(true);
    });

    it('should throw when annualized methodology lacks horizon', () => {
      expect(() =>
        calculateROI(grossDelta, {
          methodology: ROIMethodology.ANNUALIZED,
        })
      ).toThrow('Horizon months required for annualized ROI calculation');
    });

    it('should throw when horizon is zero for annualized', () => {
      expect(() =>
        calculateROI(grossDelta, {
          methodology: ROIMethodology.ANNUALIZED,
          horizonMonths: 0,
        })
      ).toThrow('Horizon months required for annualized ROI calculation');
    });

    it('should identify negative return correctly', () => {
      const lossyDelta: GrossDelta = {
        decisionRecordId: createTestUUID(),
        totalSavings: '50000.0000',
        totalCosts: '100000.0000',
        netDelta: '-50000.0000',
        savingsToCostRatio: 0.5,
      };

      const result = calculateROI(lossyDelta, {
        methodology: ROIMethodology.SIMPLE,
      });

      expect(result.roi).toBeCloseTo(-0.5, 4);
      expect(result.roiPercentage).toBe('-50.00%');
      expect(result.isPositiveReturn).toBe(false);
    });

    it('should format percentage string correctly', () => {
      const result = calculateROI(grossDelta, {
        methodology: ROIMethodology.SIMPLE,
      });

      expect(result.roiPercentage).toMatch(/^\-?\d+\.\d{2}%$/);
    });
  });

  describe('calculateGrossDeltaFromChain', () => {
    it('should extract positive savings from attribution chain', () => {
      const chain: AttributionChain = {
        decisionRecordId: createTestUUID(),
        primaryAttribution: {
          decisionRecordId: createTestUUID(),
          costCenterId: 'CC001',
          costCenterName: 'Engineering',
          costCenterLevel: 1,
          attributedAmount: '50000.0000',
          fiscalPeriod: createTestFiscalPeriod(),
          attributionBasis: 'DIRECT',
          originalAmount: '50000.0000',
          adjustmentFactor: 1.0,
        },
        overheadAttribution: {
          decisionRecordId: createTestUUID(),
          costCenterId: 'CC001',
          directAmount: '50000.0000',
          indirectOverhead: '0.0000',
          sharedServicesOverhead: '0.0000',
          totalOverhead: '0.0000',
          fullyLoadedAmount: '50000.0000',
          overheadRateVersion: 'v1',
        },
        distributedAttributions: [],
        totalAttributedAmount: '50000.0000',
        attributionMethod: 'DIRECT',
        attributionTimestamp: new Date().toISOString(),
      };

      const result = calculateGrossDeltaFromChain(chain);

      expect(result.totalSavings).toBe('50000.0000');
      expect(result.totalCosts).toBe('0.0000');
      expect(result.netDelta).toBe('50000.0000');
    });

    it('should handle negative amount as cost', () => {
      const chain: AttributionChain = {
        decisionRecordId: createTestUUID(),
        primaryAttribution: {
          decisionRecordId: createTestUUID(),
          costCenterId: 'CC001',
          costCenterName: 'Engineering',
          costCenterLevel: 1,
          attributedAmount: '-30000.0000',
          fiscalPeriod: createTestFiscalPeriod(),
          attributionBasis: 'DIRECT',
          originalAmount: '-30000.0000',
          adjustmentFactor: 1.0,
        },
        overheadAttribution: {
          decisionRecordId: createTestUUID(),
          costCenterId: 'CC001',
          directAmount: '-30000.0000',
          indirectOverhead: '0.0000',
          sharedServicesOverhead: '0.0000',
          totalOverhead: '0.0000',
          fullyLoadedAmount: '-30000.0000',
          overheadRateVersion: 'v1',
        },
        distributedAttributions: [],
        totalAttributedAmount: '-30000.0000',
        attributionMethod: 'DIRECT',
        attributionTimestamp: new Date().toISOString(),
      };

      const result = calculateGrossDeltaFromChain(chain);

      expect(result.totalSavings).toBe('0.0000');
      expect(result.totalCosts).toBe('30000.0000');
      expect(result.netDelta).toBe('-30000.0000');
    });
  });

  describe('aggregateGrossDeltas', () => {
    it('should aggregate multiple gross deltas', () => {
      const deltas: GrossDelta[] = [
        {
          decisionRecordId: createTestUUID('1'),
          totalSavings: '100000.0000',
          totalCosts: '20000.0000',
          netDelta: '80000.0000',
          savingsToCostRatio: 5.0,
        },
        {
          decisionRecordId: createTestUUID('2'),
          totalSavings: '50000.0000',
          totalCosts: '30000.0000',
          netDelta: '20000.0000',
          savingsToCostRatio: 1.667,
        },
        {
          decisionRecordId: createTestUUID('3'),
          totalSavings: '25000.0000',
          totalCosts: '10000.0000',
          netDelta: '15000.0000',
          savingsToCostRatio: 2.5,
        },
      ];

      const portfolioId = createTestUUID('P');
      const result = aggregateGrossDeltas(deltas, portfolioId);

      expect(result.decisionRecordId).toBe(portfolioId);
      expect(result.totalSavings).toBe('175000.0000');
      expect(result.totalCosts).toBe('60000.0000');
      expect(result.netDelta).toBe('115000.0000');
      expect(result.savingsToCostRatio).toBeCloseTo(2.9167, 4);
    });

    it('should handle empty array', () => {
      const result = aggregateGrossDeltas([], createTestUUID());

      expect(result.totalSavings).toBe('0.0000');
      expect(result.totalCosts).toBe('0.0000');
      expect(result.netDelta).toBe('0.0000');
      expect(result.savingsToCostRatio).toBeNull();
    });

    it('should handle single delta', () => {
      const deltas: GrossDelta[] = [
        {
          decisionRecordId: createTestUUID('1'),
          totalSavings: '100000.0000',
          totalCosts: '25000.0000',
          netDelta: '75000.0000',
          savingsToCostRatio: 4.0,
        },
      ];

      const result = aggregateGrossDeltas(deltas, createTestUUID('P'));

      expect(result.totalSavings).toBe('100000.0000');
      expect(result.totalCosts).toBe('25000.0000');
      expect(result.netDelta).toBe('75000.0000');
    });

    it('should handle mix of positive and negative net deltas', () => {
      const deltas: GrossDelta[] = [
        {
          decisionRecordId: createTestUUID('1'),
          totalSavings: '100000.0000',
          totalCosts: '20000.0000',
          netDelta: '80000.0000',
          savingsToCostRatio: 5.0,
        },
        {
          decisionRecordId: createTestUUID('2'),
          totalSavings: '10000.0000',
          totalCosts: '50000.0000',
          netDelta: '-40000.0000',
          savingsToCostRatio: 0.2,
        },
      ];

      const result = aggregateGrossDeltas(deltas, createTestUUID('P'));

      expect(result.totalSavings).toBe('110000.0000');
      expect(result.totalCosts).toBe('70000.0000');
      expect(result.netDelta).toBe('40000.0000');
    });
  });

  describe('ROICalculator class', () => {
    it('should create calculator with default SIMPLE methodology', () => {
      const calculator = new ROICalculator();
      const delta = calculator.grossDelta({
        totalSavings: '100000.0000',
        totalCosts: '50000.0000',
        decisionRecordId: createTestUUID(),
      });

      expect(delta.netDelta).toBe('50000.0000');
    });

    it('should calculate ROI using configured methodology', () => {
      const calculator = new ROICalculator({
        methodology: ROIMethodology.SIMPLE,
      });

      const delta: GrossDelta = {
        decisionRecordId: createTestUUID(),
        totalSavings: '150000.0000',
        totalCosts: '100000.0000',
        netDelta: '50000.0000',
        savingsToCostRatio: 1.5,
      };

      const result = calculator.roi(delta);

      expect(result.methodology).toBe(ROIMethodology.SIMPLE);
      expect(result.roi).toBeCloseTo(0.5, 4);
    });

    it('should calculate from values directly', () => {
      const calculator = new ROICalculator({
        methodology: ROIMethodology.SIMPLE,
      });

      const result = calculator.calculateFromValues({
        totalSavings: '200000.0000',
        totalCosts: '100000.0000',
        decisionRecordId: createTestUUID(),
      });

      expect(result.roi).toBeCloseTo(1.0, 4);
      expect(result.roiPercentage).toBe('100.00%');
    });

    it('should calculate portfolio ROI', () => {
      const calculator = new ROICalculator({
        methodology: ROIMethodology.SIMPLE,
      });

      const deltas: GrossDelta[] = [
        {
          decisionRecordId: createTestUUID('1'),
          totalSavings: '100000.0000',
          totalCosts: '50000.0000',
          netDelta: '50000.0000',
          savingsToCostRatio: 2.0,
        },
        {
          decisionRecordId: createTestUUID('2'),
          totalSavings: '50000.0000',
          totalCosts: '25000.0000',
          netDelta: '25000.0000',
          savingsToCostRatio: 2.0,
        },
      ];

      const result = calculator.portfolioROI(deltas, createTestUUID('P'));

      // Total: savings=150000, costs=75000, net=75000
      // ROI = 75000/75000 = 1.0 (100%)
      expect(result.roi).toBeCloseTo(1.0, 4);
    });

    it('should create new calculator with different config', () => {
      const calculator = new ROICalculator({
        methodology: ROIMethodology.SIMPLE,
      });

      const annualizedCalculator = calculator.withConfig({
        methodology: ROIMethodology.ANNUALIZED,
        horizonMonths: 6,
      });

      const delta: GrossDelta = {
        decisionRecordId: createTestUUID(),
        totalSavings: '150000.0000',
        totalCosts: '100000.0000',
        netDelta: '50000.0000',
        savingsToCostRatio: 1.5,
      };

      const simpleResult = calculator.roi(delta);
      const annualizedResult = annualizedCalculator.roi(delta);

      expect(simpleResult.methodology).toBe(ROIMethodology.SIMPLE);
      expect(annualizedResult.methodology).toBe(ROIMethodology.ANNUALIZED);
      expect(annualizedResult.roi).toBeGreaterThan(simpleResult.roi);
    });
  });

  describe('Determinism', () => {
    it('should produce identical results for identical inputs', () => {
      const input: DeltaInput = {
        totalSavings: '123456.7890',
        totalCosts: '98765.4321',
        decisionRecordId: createTestUUID(),
      };

      const results: GrossDelta[] = [];
      for (let i = 0; i < 10; i++) {
        results.push(calculateGrossDelta(input));
      }

      // All results should be identical
      const firstResult = results[0]!;
      for (const result of results) {
        expect(result.totalSavings).toBe(firstResult.totalSavings);
        expect(result.totalCosts).toBe(firstResult.totalCosts);
        expect(result.netDelta).toBe(firstResult.netDelta);
        expect(result.savingsToCostRatio).toBe(firstResult.savingsToCostRatio);
      }
    });

    it('should produce deterministic ROI calculations', () => {
      const delta: GrossDelta = {
        decisionRecordId: createTestUUID(),
        totalSavings: '150000.0000',
        totalCosts: '100000.0000',
        netDelta: '50000.0000',
        savingsToCostRatio: 1.5,
      };

      const config = {
        methodology: ROIMethodology.ANNUALIZED,
        horizonMonths: 18,
      };

      const results: ROIResult[] = [];
      for (let i = 0; i < 10; i++) {
        results.push(calculateROI(delta, config));
      }

      const firstROI = results[0]!.roi;
      for (const result of results) {
        expect(result.roi).toBe(firstROI);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle maximum safe precision values', () => {
      const input: DeltaInput = {
        totalSavings: '9999999999999999.9999',
        totalCosts: '0.0001',
        decisionRecordId: createTestUUID(),
      };

      const result = calculateGrossDelta(input);

      expect(result.netDelta).toBe('9999999999999999.9998');
    });

    it('should handle equal savings and costs (break-even)', () => {
      const input: DeltaInput = {
        totalSavings: '50000.0000',
        totalCosts: '50000.0000',
        decisionRecordId: createTestUUID(),
      };

      const delta = calculateGrossDelta(input);
      const roi = calculateSimpleROI(delta);

      expect(delta.netDelta).toBe('0.0000');
      expect(roi.toNumber()).toBe(0);
    });

    it('should handle string numbers without decimals', () => {
      const input: DeltaInput = {
        totalSavings: '100000',
        totalCosts: '50000',
        decisionRecordId: createTestUUID(),
      };

      const result = calculateGrossDelta(input);

      expect(result.totalSavings).toBe('100000.0000');
      expect(result.totalCosts).toBe('50000.0000');
      expect(result.netDelta).toBe('50000.0000');
    });

    it('should handle very long horizon for annualized ROI', () => {
      const simpleROI = toDecimal('0.50');
      const result = calculateAnnualizedROI(simpleROI, 120); // 10 years

      // (1.5)^(12/120) - 1 = (1.5)^0.1 - 1 ≈ 0.0414
      expect(result.toNumber()).toBeCloseTo(0.0414, 3);
    });

    it('should handle very short horizon for annualized ROI', () => {
      const simpleROI = toDecimal('0.10');
      const result = calculateAnnualizedROI(simpleROI, 1); // 1 month

      // (1.1)^12 - 1 ≈ 2.138
      expect(result.toNumber()).toBeCloseTo(2.138, 2);
    });
  });
});
