/**
 * Unit Tests for SummaryGenerator
 * Tests human-readable summary generation and formatting.
 */

import {
  SummaryGenerator,
  SummaryGeneratorOptions,
  createSummaryGenerator,
  generateQuickSummary,
  generateQuickDeltaSummary,
} from '../../../src/export/SummaryGenerator';
import {
  FinancialSummary,
  FinancialDeltaResult,
  PortfolioMetrics,
} from '../../../src/contracts';

// ============================================================================
// Mock Data Factory Functions
// ============================================================================

function createMockFinancialSummary(overrides: Partial<FinancialSummary> = {}): FinancialSummary {
  const now = new Date().toISOString();
  return {
    totalInvestment: { amount: '10000.0000', currency: 'USD', asOfDate: now },
    totalBenefit: { amount: '50000.0000', currency: 'USD', asOfDate: now },
    netBenefit: { amount: '40000.0000', currency: 'USD', asOfDate: now },
    roi: 4.0,
    roiMethodology: 'Net Present Value / Total Investment',
    paybackPeriodMonths: 6,
    npv: { amount: '38000.0000', currency: 'USD', asOfDate: now },
    discountRate: 0.1,
    irr: 0.25,
    confidenceInterval: {
      confidenceLevel: 90,
      lowerBound: '32000.00',
      upperBound: '48000.00',
      margin: '8000.00',
    },
    ...overrides,
  };
}

function createMockPortfolioMetrics(overrides: Partial<PortfolioMetrics> = {}): PortfolioMetrics {
  return {
    totalGrossSavings: '60000.00',
    totalRiskAdjustedSavings: '51000.00',
    totalPresentValue: '45000.00',
    averageRiskAdjustmentFactor: 0.85,
    averageDiscountFactor: 0.88,
    weightedUncertaintyFactor: 0.15,
    decisionCount: 5,
    positiveNPVCount: 4,
    calculationTimestamp: new Date().toISOString(),
    ...overrides,
  };
}

function createMockDeltaResult(overrides: Partial<FinancialDeltaResult> = {}): FinancialDeltaResult {
  return {
    calculationId: 'calc-001',
    deltas: [],
    portfolioMetrics: createMockPortfolioMetrics(),
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ============================================================================
// Test Suites
// ============================================================================

describe('SummaryGenerator', () => {
  let generator: SummaryGenerator;
  let options: SummaryGeneratorOptions;

  beforeEach(() => {
    options = {
      currency: 'USD',
      locale: 'en-US',
      precision: 2,
      includeConfidenceInterval: true,
      confidenceLevel: 90,
    };
    generator = new SummaryGenerator(options);
  });

  describe('constructor', () => {
    it('should create an instance with provided options', () => {
      expect(generator).toBeInstanceOf(SummaryGenerator);
    });

    it('should use default values for optional options', () => {
      const minimalOptions: SummaryGeneratorOptions = { currency: 'EUR' };
      const minimalGenerator = new SummaryGenerator(minimalOptions);
      expect(minimalGenerator).toBeInstanceOf(SummaryGenerator);
    });
  });

  describe('createSummaryGenerator factory', () => {
    it('should create a new SummaryGenerator instance', () => {
      const newGenerator = createSummaryGenerator({ currency: 'USD' });
      expect(newGenerator).toBeInstanceOf(SummaryGenerator);
    });
  });

  describe('generateHeadlineSummary', () => {
    it('should generate headline for positive savings', () => {
      const summary = createMockFinancialSummary();
      const headline = generator.generateHeadlineSummary(summary);

      expect(headline).toContain('save');
      expect(headline).toContain('$');
      expect(headline).toContain('per year');
    });

    it('should generate headline for negative (cost) outcome', () => {
      const summary = createMockFinancialSummary({
        netBenefit: { amount: '-5000.0000', currency: 'USD', asOfDate: new Date().toISOString() },
      });
      const headline = generator.generateHeadlineSummary(summary);

      expect(headline).toContain('cost');
      expect(headline).toContain('$');
      expect(headline).toContain('per year');
    });

    it('should generate headline for neutral outcome', () => {
      const summary = createMockFinancialSummary({
        netBenefit: { amount: '0.0000', currency: 'USD', asOfDate: new Date().toISOString() },
      });
      const headline = generator.generateHeadlineSummary(summary);

      expect(headline).toContain('neutral');
    });

    it('should include confidence interval when enabled', () => {
      const summary = createMockFinancialSummary();
      const headline = generator.generateHeadlineSummary(summary);

      expect(headline).toContain('90% CI');
      expect(headline).toContain('$32,000.00');
      expect(headline).toContain('$48,000.00');
    });

    it('should exclude confidence interval when disabled', () => {
      const noIntervalGenerator = new SummaryGenerator({
        currency: 'USD',
        includeConfidenceInterval: false,
      });
      const summary = createMockFinancialSummary();
      const headline = noIntervalGenerator.generateHeadlineSummary(summary);

      expect(headline).not.toContain('CI');
    });

    it('should format currency correctly for USD', () => {
      const summary = createMockFinancialSummary();
      const headline = generator.generateHeadlineSummary(summary);

      expect(headline).toMatch(/\$[\d,]+\.\d{2}/);
    });

    it('should format currency correctly for EUR', () => {
      const eurGenerator = new SummaryGenerator({
        currency: 'EUR',
        locale: 'de-DE',
      });
      const summary = createMockFinancialSummary({
        netBenefit: { amount: '40000.0000', currency: 'EUR', asOfDate: new Date().toISOString() },
        confidenceInterval: {
          confidenceLevel: 90,
          lowerBound: '32000.00',
          upperBound: '48000.00',
          margin: '8000.00',
        },
      });
      const headline = eurGenerator.generateHeadlineSummary(summary);

      // EUR formatting varies by locale but should include the amount
      expect(headline).toBeDefined();
      expect(headline.length).toBeGreaterThan(0);
    });
  });

  describe('generateFromDeltaResult', () => {
    it('should generate complete summary with headline, detailed, and bullets', () => {
      const deltaResult = createMockDeltaResult();
      const result = generator.generateFromDeltaResult(deltaResult);

      expect(result.headline).toBeDefined();
      expect(result.detailed).toBeDefined();
      expect(result.bullets).toBeDefined();
      expect(result.bullets.length).toBeGreaterThan(0);
    });

    it('should include decision count in headline', () => {
      const deltaResult = createMockDeltaResult();
      const result = generator.generateFromDeltaResult(deltaResult);

      expect(result.headline).toContain('5 decisions');
    });

    it('should indicate positive NPV correctly', () => {
      const deltaResult = createMockDeltaResult();
      const result = generator.generateFromDeltaResult(deltaResult);

      expect(result.headline).toContain('generate');
      expect(result.headline).toContain('net present value');
    });

    it('should indicate negative NPV correctly', () => {
      const deltaResult = createMockDeltaResult({
        portfolioMetrics: createMockPortfolioMetrics({
          totalPresentValue: '-10000.00',
        }),
      });
      const result = generator.generateFromDeltaResult(deltaResult);

      expect(result.headline).toContain('net cost');
    });

    it('should include detailed metrics summary', () => {
      const deltaResult = createMockDeltaResult();
      const result = generator.generateFromDeltaResult(deltaResult);

      expect(result.detailed).toContain('5 decisions');
      expect(result.detailed).toContain('4 with positive NPV');
      expect(result.detailed).toContain('Gross savings');
    });

    it('should generate appropriate bullet points', () => {
      const deltaResult = createMockDeltaResult();
      const result = generator.generateFromDeltaResult(deltaResult);

      expect(result.bullets).toContain('5 decisions analyzed');
      expect(result.bullets).toContain('4 decisions with positive NPV');
      expect(result.bullets.some(b => b.includes('Gross savings'))).toBe(true);
      expect(result.bullets.some(b => b.includes('Risk-adjusted savings'))).toBe(true);
      expect(result.bullets.some(b => b.includes('Total present value'))).toBe(true);
    });
  });

  describe('generateFromSummary', () => {
    it('should generate complete summary from FinancialSummary', () => {
      const summary = createMockFinancialSummary();
      const result = generator.generateFromSummary(summary);

      expect(result.headline).toBeDefined();
      expect(result.detailed).toBeDefined();
      expect(result.bullets).toBeDefined();
    });

    it('should include all key financial metrics in detailed', () => {
      const summary = createMockFinancialSummary();
      const result = generator.generateFromSummary(summary);

      expect(result.detailed).toContain('Total Investment');
      expect(result.detailed).toContain('Total Benefit');
      expect(result.detailed).toContain('Net Benefit');
      expect(result.detailed).toContain('NPV');
      expect(result.detailed).toContain('ROI');
      expect(result.detailed).toContain('Payback Period');
    });

    it('should include IRR when available', () => {
      const summary = createMockFinancialSummary({ irr: 0.25 });
      const result = generator.generateFromSummary(summary);

      expect(result.detailed).toContain('IRR');
      expect(result.detailed).toContain('25.0%');
    });

    it('should exclude IRR when null', () => {
      const summary = createMockFinancialSummary({ irr: null });
      const result = generator.generateFromSummary(summary);

      // IRR should not appear in bullets
      expect(result.bullets.every(b => !b.includes('Internal rate of return'))).toBe(true);
    });

    it('should format payback period correctly', () => {
      const result6Months = generator.generateFromSummary(
        createMockFinancialSummary({ paybackPeriodMonths: 6 })
      );
      expect(result6Months.bullets.some(b => b.includes('6 months'))).toBe(true);

      const result18Months = generator.generateFromSummary(
        createMockFinancialSummary({ paybackPeriodMonths: 18 })
      );
      expect(result18Months.bullets.some(b => b.includes('1 year and 6 months'))).toBe(true);

      const result24Months = generator.generateFromSummary(
        createMockFinancialSummary({ paybackPeriodMonths: 24 })
      );
      expect(result24Months.bullets.some(b => b.includes('2 years'))).toBe(true);
    });

    it('should handle null payback period', () => {
      const summary = createMockFinancialSummary({ paybackPeriodMonths: null });
      const result = generator.generateFromSummary(summary);

      expect(result.bullets.some(b => b.includes('N/A'))).toBe(true);
    });

    it('should include confidence interval in bullets', () => {
      const summary = createMockFinancialSummary();
      const result = generator.generateFromSummary(summary);

      expect(result.bullets.some(b => b.includes('90% confidence range'))).toBe(true);
    });
  });

  describe('generateExecutiveSummary', () => {
    it('should generate markdown formatted executive summary', () => {
      const summary = createMockFinancialSummary();
      const execSummary = generator.generateExecutiveSummary(summary);

      expect(execSummary).toContain('## Executive Summary');
      expect(execSummary).toContain('### Key Metrics');
      expect(execSummary).toContain('### Details');
    });

    it('should include bullet points with markdown formatting', () => {
      const summary = createMockFinancialSummary();
      const execSummary = generator.generateExecutiveSummary(summary);

      expect(execSummary).toMatch(/- .+/m); // Markdown bullet points
    });

    it('should have proper line breaks', () => {
      const summary = createMockFinancialSummary();
      const execSummary = generator.generateExecutiveSummary(summary);

      expect(execSummary.split('\n').length).toBeGreaterThan(5);
    });
  });

  describe('formatting functions', () => {
    describe('duration formatting', () => {
      it('should format less than 1 month', () => {
        const summary = createMockFinancialSummary({ paybackPeriodMonths: 0.5 });
        const result = generator.generateFromSummary(summary);

        expect(result.bullets.some(b => b.includes('less than 1 month'))).toBe(true);
      });

      it('should format exactly 1 month', () => {
        const summary = createMockFinancialSummary({ paybackPeriodMonths: 1 });
        const result = generator.generateFromSummary(summary);

        expect(result.bullets.some(b => b.includes('1 month'))).toBe(true);
      });

      it('should format multiple months under a year', () => {
        const summary = createMockFinancialSummary({ paybackPeriodMonths: 8 });
        const result = generator.generateFromSummary(summary);

        expect(result.bullets.some(b => b.includes('8 months'))).toBe(true);
      });

      it('should format exactly 1 year', () => {
        const summary = createMockFinancialSummary({ paybackPeriodMonths: 12 });
        const result = generator.generateFromSummary(summary);

        expect(result.bullets.some(b => b.includes('1 year'))).toBe(true);
      });

      it('should format years and months', () => {
        const summary = createMockFinancialSummary({ paybackPeriodMonths: 15 });
        const result = generator.generateFromSummary(summary);

        expect(result.bullets.some(b => b.includes('1 year and 3 months'))).toBe(true);
      });

      it('should format multiple years', () => {
        const summary = createMockFinancialSummary({ paybackPeriodMonths: 36 });
        const result = generator.generateFromSummary(summary);

        expect(result.bullets.some(b => b.includes('3 years'))).toBe(true);
      });
    });

    describe('percentage formatting', () => {
      it('should format ROI correctly', () => {
        const summary = createMockFinancialSummary({ roi: 0.85 });
        const result = generator.generateFromSummary(summary);

        expect(result.bullets.some(b => b.includes('85.0%'))).toBe(true);
      });

      it('should format discount rate correctly', () => {
        const summary = createMockFinancialSummary({ discountRate: 0.1 });
        const result = generator.generateFromSummary(summary);

        expect(result.bullets.some(b => b.includes('10.0%'))).toBe(true);
      });
    });

    describe('currency formatting', () => {
      it('should format large amounts with thousand separators', () => {
        const summary = createMockFinancialSummary({
          netBenefit: { amount: '1234567.8900', currency: 'USD', asOfDate: new Date().toISOString() },
        });
        const headline = generator.generateHeadlineSummary(summary);

        // Should contain comma separators
        expect(headline).toMatch(/\$[\d,]+/);
      });

      it('should handle fallback for unsupported currencies', () => {
        const customGenerator = new SummaryGenerator({
          currency: 'XYZ', // Non-standard currency
          locale: 'en-US',
        });
        const summary = createMockFinancialSummary({
          confidenceInterval: {
            confidenceLevel: 90,
            lowerBound: '1000.00',
            upperBound: '2000.00',
            margin: '500.00',
          },
        });

        // Should not throw
        expect(() => customGenerator.generateHeadlineSummary(summary)).not.toThrow();
      });
    });
  });

  describe('convenience functions', () => {
    describe('generateQuickSummary', () => {
      it('should generate quick summary with default currency', () => {
        const summary = createMockFinancialSummary();
        const quickSummary = generateQuickSummary(summary);

        expect(quickSummary).toBeDefined();
        expect(quickSummary).toContain('$');
      });

      it('should generate quick summary with custom currency', () => {
        const summary = createMockFinancialSummary();
        const quickSummary = generateQuickSummary(summary, 'EUR');

        expect(quickSummary).toBeDefined();
      });
    });

    describe('generateQuickDeltaSummary', () => {
      it('should generate quick summary from delta result', () => {
        const deltaResult = createMockDeltaResult();
        const quickSummary = generateQuickDeltaSummary(deltaResult);

        expect(quickSummary).toBeDefined();
        expect(quickSummary).toContain('5 decisions');
      });

      it('should generate quick summary with custom currency', () => {
        const deltaResult = createMockDeltaResult();
        const quickSummary = generateQuickDeltaSummary(deltaResult, 'GBP');

        expect(quickSummary).toBeDefined();
      });
    });
  });

  describe('edge cases', () => {
    it('should handle zero values gracefully', () => {
      const summary = createMockFinancialSummary({
        totalInvestment: { amount: '0.0000', currency: 'USD', asOfDate: new Date().toISOString() },
        totalBenefit: { amount: '0.0000', currency: 'USD', asOfDate: new Date().toISOString() },
        netBenefit: { amount: '0.0000', currency: 'USD', asOfDate: new Date().toISOString() },
        roi: 0,
      });

      expect(() => generator.generateHeadlineSummary(summary)).not.toThrow();
      expect(() => generator.generateFromSummary(summary)).not.toThrow();
    });

    it('should handle very large values', () => {
      const summary = createMockFinancialSummary({
        netBenefit: { amount: '999999999999.9999', currency: 'USD', asOfDate: new Date().toISOString() },
      });

      const headline = generator.generateHeadlineSummary(summary);
      expect(headline).toBeDefined();
      expect(headline.length).toBeGreaterThan(0);
    });

    it('should handle very small values', () => {
      const summary = createMockFinancialSummary({
        netBenefit: { amount: '0.0001', currency: 'USD', asOfDate: new Date().toISOString() },
      });

      const headline = generator.generateHeadlineSummary(summary);
      expect(headline).toBeDefined();
    });

    it('should handle negative values correctly', () => {
      const summary = createMockFinancialSummary({
        netBenefit: { amount: '-50000.0000', currency: 'USD', asOfDate: new Date().toISOString() },
      });

      const headline = generator.generateHeadlineSummary(summary);
      expect(headline).toContain('cost');
      expect(headline).not.toContain('-'); // Negative sign should be handled by "cost" wording
    });

    it('should handle empty decision results', () => {
      const deltaResult = createMockDeltaResult({
        portfolioMetrics: createMockPortfolioMetrics({
          decisionCount: 0,
          positiveNPVCount: 0,
          totalPresentValue: '0.00',
        }),
      });

      const result = generator.generateFromDeltaResult(deltaResult);
      expect(result.headline).toContain('0 decisions');
    });
  });

  describe('localization', () => {
    it('should respect en-US locale formatting', () => {
      const usGenerator = new SummaryGenerator({
        currency: 'USD',
        locale: 'en-US',
      });
      const summary = createMockFinancialSummary({
        netBenefit: { amount: '1234.5600', currency: 'USD', asOfDate: new Date().toISOString() },
        confidenceInterval: {
          confidenceLevel: 90,
          lowerBound: '1000.00',
          upperBound: '1500.00',
          margin: '250.00',
        },
      });

      const headline = usGenerator.generateHeadlineSummary(summary);
      // US format uses comma for thousands and period for decimal
      expect(headline).toMatch(/\$\d{1,3}(,\d{3})*\.\d{2}/);
    });

    it('should handle de-DE locale with EUR', () => {
      const deGenerator = new SummaryGenerator({
        currency: 'EUR',
        locale: 'de-DE',
      });
      const summary = createMockFinancialSummary({
        netBenefit: { amount: '1234.5600', currency: 'EUR', asOfDate: new Date().toISOString() },
        confidenceInterval: {
          confidenceLevel: 90,
          lowerBound: '1000.00',
          upperBound: '1500.00',
          margin: '250.00',
        },
      });

      // Should not throw with German locale
      expect(() => deGenerator.generateHeadlineSummary(summary)).not.toThrow();
    });
  });
});
