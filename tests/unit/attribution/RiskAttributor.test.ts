/**
 * RiskAttributor Unit Tests
 * Tests for risk weighting logic including composite risk calculation,
 * risk component computation, and risk adjustment application.
 */

import {
  RiskAttributor,
  RiskAttribution,
} from '../../../src/attribution/RiskAttributor';
import {
  CanonicalDecisionRecord,
  FiscalPeriod,
  DecisionCategory,
  ImpactType,
} from '../../../src/contracts';
import { RiskWeightMatrix, DEFAULT_RISK_MATRIX } from '../../../src/contracts/costops';

// =============================================================================
// Mock Data Factories
// =============================================================================

function createMockRiskMatrix(overrides: Partial<RiskWeightMatrix> = {}): RiskWeightMatrix {
  return {
    categoryId: 'RISK-DEFAULT',
    categoryName: 'Default Risk Category',
    baseWeight: 1.0,
    volatilityMultiplier: 0.5,
    confidenceDecayRate: 0.3,
    maxWeight: 2.5,
    ...overrides,
  };
}

function createMockFiscalPeriod(overrides: Partial<FiscalPeriod> = {}): FiscalPeriod {
  return {
    year: 2024,
    period: 1,
    startDate: '2024-01-01T00:00:00Z',
    endDate: '2024-01-31T23:59:59Z',
    ...overrides,
  };
}

function createMockDecisionRecord(
  overrides: Partial<CanonicalDecisionRecord> = {}
): CanonicalDecisionRecord {
  return {
    recordId: 'DR-001',
    sourceDecisionId: 'SIM-001',
    decisionTimestamp: '2024-01-15T10:00:00Z',
    decisionCategory: DecisionCategory.COST_REDUCTION,
    primaryCostCenterId: 'CC-001',
    secondaryCostCenters: [],
    glAccountImpacts: [
      {
        glAccountId: 'GL-5100',
        impactType: ImpactType.CREDIT,
        amount: '10000.0000',
        period: createMockFiscalPeriod(),
      },
    ],
    grossImpactAmount: '10000.0000',
    confidenceScore: 0.85,
    impactHorizonMonths: 12,
    riskCategoryId: 'RISK-001',
    volatilityScore: 0.2,
    sourceSystem: 'simulation-engine',
    normalizationTimestamp: '2024-01-15T10:05:00Z',
    rawChecksum: 'abc123',
    ...overrides,
  };
}

// =============================================================================
// Test Suite: RiskAttributor
// =============================================================================

describe('RiskAttributor', () => {
  describe('constructor', () => {
    it('should initialize with risk matrices', () => {
      const matrices = [
        createMockRiskMatrix({ categoryId: 'RISK-001' }),
        createMockRiskMatrix({ categoryId: 'RISK-002' }),
      ];

      const attributor = new RiskAttributor(matrices);

      expect(attributor.hasRiskMatrix('RISK-001')).toBe(true);
      expect(attributor.hasRiskMatrix('RISK-002')).toBe(true);
      expect(attributor.hasRiskMatrix('RISK-999')).toBe(false);
    });

    it('should initialize with empty matrices array', () => {
      const attributor = new RiskAttributor([]);
      expect(attributor.hasRiskMatrix('RISK-001')).toBe(false);
    });

    it('should use custom default matrix when provided', () => {
      const customDefault = createMockRiskMatrix({
        categoryId: 'CUSTOM-DEFAULT',
        baseWeight: 1.5,
      });

      const attributor = new RiskAttributor([], customDefault);
      const matrix = attributor.getRiskMatrix('NONEXISTENT');

      expect(matrix.categoryId).toBe('CUSTOM-DEFAULT');
      expect(matrix.baseWeight).toBe(1.5);
    });

    it('should use DEFAULT_RISK_MATRIX when no custom default provided', () => {
      const attributor = new RiskAttributor([]);
      const matrix = attributor.getRiskMatrix('NONEXISTENT');

      expect(matrix.categoryId).toBe(DEFAULT_RISK_MATRIX.categoryId);
    });
  });

  describe('calculateRiskFactor', () => {
    describe('base risk calculation', () => {
      it('should calculate composite risk factor with perfect confidence', () => {
        const matrices = [
          createMockRiskMatrix({
            categoryId: 'RISK-001',
            baseWeight: 1.0,
            confidenceDecayRate: 0.3,
            volatilityMultiplier: 0.5,
            maxWeight: 2.5,
          }),
        ];
        const attributor = new RiskAttributor(matrices);
        const decision = createMockDecisionRecord({
          riskCategoryId: 'RISK-001',
          confidenceScore: 1.0, // Perfect confidence
          volatilityScore: 0.0, // No volatility
        });

        const result = attributor.calculateRiskFactor(decision);

        // Base weight = 1.0
        // Confidence factor = (1 - 1.0) * 0.3 = 0
        // Volatility adjustment = 0 * 0.5 = 0
        // Composite = 1.0 + 0 + 0 = 1.0
        expect(result.compositeRiskFactor).toBe(1.0);
        expect(result.isCapped).toBe(false);
        expect(result.matrixUsed).toBe('RISK-001');
      });

      it('should calculate composite risk factor with low confidence', () => {
        const matrices = [
          createMockRiskMatrix({
            categoryId: 'RISK-001',
            baseWeight: 1.0,
            confidenceDecayRate: 0.5,
            volatilityMultiplier: 0.0,
            maxWeight: 3.0,
          }),
        ];
        const attributor = new RiskAttributor(matrices);
        const decision = createMockDecisionRecord({
          riskCategoryId: 'RISK-001',
          confidenceScore: 0.5, // 50% confidence
          volatilityScore: 0.0,
        });

        const result = attributor.calculateRiskFactor(decision);

        // Base weight = 1.0
        // Confidence factor = (1 - 0.5) * 0.5 = 0.25
        // Composite = 1.0 + 0.25 = 1.25
        expect(result.compositeRiskFactor).toBe(1.25);
        expect(result.riskComponents.confidenceFactor).toBe(0.25);
      });

      it('should calculate composite risk factor with high volatility', () => {
        const matrices = [
          createMockRiskMatrix({
            categoryId: 'RISK-001',
            baseWeight: 1.0,
            confidenceDecayRate: 0.0,
            volatilityMultiplier: 2.0,
            maxWeight: 5.0,
          }),
        ];
        const attributor = new RiskAttributor(matrices);
        const decision = createMockDecisionRecord({
          riskCategoryId: 'RISK-001',
          confidenceScore: 1.0,
          volatilityScore: 0.8, // High volatility
        });

        const result = attributor.calculateRiskFactor(decision);

        // Base weight = 1.0
        // Volatility adjustment = 0.8 * 2.0 = 1.6
        // Composite = 1.0 + 1.6 = 2.6
        expect(result.compositeRiskFactor).toBe(2.6);
        expect(result.riskComponents.volatilityAdjustment).toBe(1.6);
      });

      it('should calculate composite with both confidence and volatility factors', () => {
        const matrices = [
          createMockRiskMatrix({
            categoryId: 'RISK-001',
            baseWeight: 1.0,
            confidenceDecayRate: 0.4,
            volatilityMultiplier: 0.5,
            maxWeight: 5.0,
          }),
        ];
        const attributor = new RiskAttributor(matrices);
        const decision = createMockDecisionRecord({
          riskCategoryId: 'RISK-001',
          confidenceScore: 0.7, // 70% confidence
          volatilityScore: 0.3, // 30% volatility
        });

        const result = attributor.calculateRiskFactor(decision);

        // Base weight = 1.0
        // Confidence factor = (1 - 0.7) * 0.4 = 0.12
        // Volatility adjustment = 0.3 * 0.5 = 0.15
        // Composite = 1.0 + 0.12 + 0.15 = 1.27
        expect(result.compositeRiskFactor).toBeCloseTo(1.27, 10);
        expect(result.riskComponents.baseWeight).toBe(1.0);
        expect(result.riskComponents.confidenceFactor).toBeCloseTo(0.12, 10);
        expect(result.riskComponents.volatilityAdjustment).toBeCloseTo(0.15, 10);
      });
    });

    describe('risk capping', () => {
      it('should cap composite risk factor at max weight', () => {
        const matrices = [
          createMockRiskMatrix({
            categoryId: 'RISK-001',
            baseWeight: 2.0,
            confidenceDecayRate: 0.5,
            volatilityMultiplier: 1.0,
            maxWeight: 2.5,
          }),
        ];
        const attributor = new RiskAttributor(matrices);
        const decision = createMockDecisionRecord({
          riskCategoryId: 'RISK-001',
          confidenceScore: 0.0, // Zero confidence
          volatilityScore: 1.0, // Max volatility
        });

        const result = attributor.calculateRiskFactor(decision);

        // Base weight = 2.0
        // Confidence factor = (1 - 0) * 0.5 = 0.5
        // Volatility adjustment = 1.0 * 1.0 = 1.0
        // Raw composite = 2.0 + 0.5 + 1.0 = 3.5
        // Capped at 2.5
        expect(result.compositeRiskFactor).toBe(2.5);
        expect(result.isCapped).toBe(true);
      });

      it('should not cap when composite is below max weight', () => {
        const matrices = [
          createMockRiskMatrix({
            categoryId: 'RISK-001',
            baseWeight: 1.0,
            confidenceDecayRate: 0.1,
            volatilityMultiplier: 0.1,
            maxWeight: 5.0,
          }),
        ];
        const attributor = new RiskAttributor(matrices);
        const decision = createMockDecisionRecord({
          riskCategoryId: 'RISK-001',
          confidenceScore: 0.8,
          volatilityScore: 0.2,
        });

        const result = attributor.calculateRiskFactor(decision);

        expect(result.isCapped).toBe(false);
        expect(result.compositeRiskFactor).toBeLessThan(5.0);
      });

      it('should handle edge case where composite equals max weight', () => {
        const matrices = [
          createMockRiskMatrix({
            categoryId: 'RISK-001',
            baseWeight: 2.0,
            confidenceDecayRate: 0.0,
            volatilityMultiplier: 0.0,
            maxWeight: 2.0,
          }),
        ];
        const attributor = new RiskAttributor(matrices);
        const decision = createMockDecisionRecord({
          riskCategoryId: 'RISK-001',
          confidenceScore: 1.0,
          volatilityScore: 0.0,
        });

        const result = attributor.calculateRiskFactor(decision);

        expect(result.compositeRiskFactor).toBe(2.0);
        expect(result.isCapped).toBe(false);
      });
    });

    describe('risk category fallback', () => {
      it('should use default matrix when category not found', () => {
        const matrices = [
          createMockRiskMatrix({ categoryId: 'RISK-001' }),
        ];
        const attributor = new RiskAttributor(matrices);
        const decision = createMockDecisionRecord({
          riskCategoryId: 'RISK-UNKNOWN',
        });

        const result = attributor.calculateRiskFactor(decision);

        expect(result.matrixUsed).toBe(DEFAULT_RISK_MATRIX.categoryId);
      });

      it('should use matching matrix when category exists', () => {
        const matrices = [
          createMockRiskMatrix({
            categoryId: 'RISK-SPECIAL',
            baseWeight: 1.5,
          }),
        ];
        const attributor = new RiskAttributor(matrices);
        const decision = createMockDecisionRecord({
          riskCategoryId: 'RISK-SPECIAL',
        });

        const result = attributor.calculateRiskFactor(decision);

        expect(result.matrixUsed).toBe('RISK-SPECIAL');
        expect(result.riskComponents.baseWeight).toBe(1.5);
      });
    });

    describe('risk components', () => {
      it('should return correct risk components breakdown', () => {
        const matrices = [
          createMockRiskMatrix({
            categoryId: 'RISK-001',
            baseWeight: 1.2,
            confidenceDecayRate: 0.25,
            volatilityMultiplier: 0.75,
            maxWeight: 5.0,
          }),
        ];
        const attributor = new RiskAttributor(matrices);
        const decision = createMockDecisionRecord({
          riskCategoryId: 'RISK-001',
          confidenceScore: 0.6,
          volatilityScore: 0.4,
        });

        const result = attributor.calculateRiskFactor(decision);

        expect(result.riskComponents).toEqual({
          baseWeight: 1.2,
          confidenceFactor: 0.1, // (1 - 0.6) * 0.25 = 0.1
          volatilityAdjustment: 0.3, // 0.4 * 0.75 = 0.3
        });
      });

      it('should handle zero confidence score', () => {
        const matrices = [
          createMockRiskMatrix({
            categoryId: 'RISK-001',
            baseWeight: 1.0,
            confidenceDecayRate: 0.5,
            volatilityMultiplier: 0.0,
            maxWeight: 10.0,
          }),
        ];
        const attributor = new RiskAttributor(matrices);
        const decision = createMockDecisionRecord({
          riskCategoryId: 'RISK-001',
          confidenceScore: 0.0,
          volatilityScore: 0.0,
        });

        const result = attributor.calculateRiskFactor(decision);

        // Confidence factor = (1 - 0) * 0.5 = 0.5
        expect(result.riskComponents.confidenceFactor).toBe(0.5);
        expect(result.compositeRiskFactor).toBe(1.5);
      });
    });

    describe('edge cases', () => {
      it('should handle zero volatility multiplier', () => {
        const matrices = [
          createMockRiskMatrix({
            categoryId: 'RISK-001',
            baseWeight: 1.0,
            confidenceDecayRate: 0.0,
            volatilityMultiplier: 0.0,
            maxWeight: 5.0,
          }),
        ];
        const attributor = new RiskAttributor(matrices);
        const decision = createMockDecisionRecord({
          riskCategoryId: 'RISK-001',
          confidenceScore: 0.5,
          volatilityScore: 1.0, // High volatility but zero multiplier
        });

        const result = attributor.calculateRiskFactor(decision);

        expect(result.riskComponents.volatilityAdjustment).toBe(0);
        expect(result.compositeRiskFactor).toBe(1.0);
      });

      it('should handle zero confidence decay rate', () => {
        const matrices = [
          createMockRiskMatrix({
            categoryId: 'RISK-001',
            baseWeight: 1.0,
            confidenceDecayRate: 0.0,
            volatilityMultiplier: 0.5,
            maxWeight: 5.0,
          }),
        ];
        const attributor = new RiskAttributor(matrices);
        const decision = createMockDecisionRecord({
          riskCategoryId: 'RISK-001',
          confidenceScore: 0.1, // Low confidence but zero decay rate
          volatilityScore: 0.0,
        });

        const result = attributor.calculateRiskFactor(decision);

        expect(result.riskComponents.confidenceFactor).toBe(0);
        expect(result.compositeRiskFactor).toBe(1.0);
      });
    });
  });

  describe('getRiskMatrix', () => {
    it('should return correct matrix for existing category', () => {
      const matrices = [
        createMockRiskMatrix({
          categoryId: 'RISK-001',
          categoryName: 'Low Risk',
          baseWeight: 0.8,
        }),
        createMockRiskMatrix({
          categoryId: 'RISK-002',
          categoryName: 'High Risk',
          baseWeight: 1.5,
        }),
      ];
      const attributor = new RiskAttributor(matrices);

      const matrix1 = attributor.getRiskMatrix('RISK-001');
      const matrix2 = attributor.getRiskMatrix('RISK-002');

      expect(matrix1.categoryName).toBe('Low Risk');
      expect(matrix1.baseWeight).toBe(0.8);
      expect(matrix2.categoryName).toBe('High Risk');
      expect(matrix2.baseWeight).toBe(1.5);
    });

    it('should return default matrix for non-existing category', () => {
      const attributor = new RiskAttributor([]);

      const matrix = attributor.getRiskMatrix('NONEXISTENT');

      expect(matrix).toEqual(DEFAULT_RISK_MATRIX);
    });
  });

  describe('hasRiskMatrix', () => {
    it('should return true for existing category', () => {
      const matrices = [createMockRiskMatrix({ categoryId: 'RISK-001' })];
      const attributor = new RiskAttributor(matrices);

      expect(attributor.hasRiskMatrix('RISK-001')).toBe(true);
    });

    it('should return false for non-existing category', () => {
      const matrices = [createMockRiskMatrix({ categoryId: 'RISK-001' })];
      const attributor = new RiskAttributor(matrices);

      expect(attributor.hasRiskMatrix('RISK-999')).toBe(false);
    });
  });

  describe('applyRiskFactor', () => {
    it('should divide amount by risk factor', () => {
      const attributor = new RiskAttributor([]);

      const result = attributor.applyRiskFactor('10000.0000', 2.0);

      // 10000 / 2.0 = 5000
      expect(result).toBe('5000.0000');
    });

    it('should handle risk factor of 1.0 (no adjustment)', () => {
      const attributor = new RiskAttributor([]);

      const result = attributor.applyRiskFactor('10000.0000', 1.0);

      expect(result).toBe('10000.0000');
    });

    it('should handle fractional risk factors', () => {
      const attributor = new RiskAttributor([]);

      const result = attributor.applyRiskFactor('10000.0000', 1.25);

      // 10000 / 1.25 = 8000
      expect(result).toBe('8000.0000');
    });

    it('should handle large amounts with precision', () => {
      const attributor = new RiskAttributor([]);

      const result = attributor.applyRiskFactor('999999999.9999', 1.5);

      expect(parseFloat(result)).toBeCloseTo(666666666.6666, 2);
    });
  });

  describe('getRiskAdjustedAmount', () => {
    it('should return Decimal divided by risk factor', () => {
      const attributor = new RiskAttributor([]);

      const result = attributor.getRiskAdjustedAmount('10000.0000', 2.0);

      expect(result.toNumber()).toBeCloseTo(5000, 4);
    });

    it('should handle risk factor of 1.0', () => {
      const attributor = new RiskAttributor([]);

      const result = attributor.getRiskAdjustedAmount('10000.0000', 1.0);

      expect(result.toNumber()).toBe(10000);
    });
  });

  describe('batchCalculateRiskFactors', () => {
    it('should calculate risk factors for multiple decisions', () => {
      const matrices = [createMockRiskMatrix({ categoryId: 'RISK-001' })];
      const attributor = new RiskAttributor(matrices);

      const decisions = [
        createMockDecisionRecord({
          recordId: 'DR-001',
          riskCategoryId: 'RISK-001',
          confidenceScore: 0.9,
        }),
        createMockDecisionRecord({
          recordId: 'DR-002',
          riskCategoryId: 'RISK-001',
          confidenceScore: 0.7,
        }),
        createMockDecisionRecord({
          recordId: 'DR-003',
          riskCategoryId: 'RISK-001',
          confidenceScore: 0.5,
        }),
      ];

      const results = attributor.batchCalculateRiskFactors(decisions);

      expect(results.size).toBe(3);
      expect(results.has('DR-001')).toBe(true);
      expect(results.has('DR-002')).toBe(true);
      expect(results.has('DR-003')).toBe(true);

      // Lower confidence should result in higher risk factor
      const risk1 = results.get('DR-001')!.compositeRiskFactor;
      const risk2 = results.get('DR-002')!.compositeRiskFactor;
      const risk3 = results.get('DR-003')!.compositeRiskFactor;

      expect(risk1).toBeLessThan(risk2);
      expect(risk2).toBeLessThan(risk3);
    });

    it('should return empty map for empty decisions array', () => {
      const attributor = new RiskAttributor([]);

      const results = attributor.batchCalculateRiskFactors([]);

      expect(results.size).toBe(0);
    });

    it('should handle mixed risk categories', () => {
      const matrices = [
        createMockRiskMatrix({ categoryId: 'RISK-LOW', baseWeight: 0.8 }),
        createMockRiskMatrix({ categoryId: 'RISK-HIGH', baseWeight: 1.5 }),
      ];
      const attributor = new RiskAttributor(matrices);

      const decisions = [
        createMockDecisionRecord({
          recordId: 'DR-001',
          riskCategoryId: 'RISK-LOW',
        }),
        createMockDecisionRecord({
          recordId: 'DR-002',
          riskCategoryId: 'RISK-HIGH',
        }),
      ];

      const results = attributor.batchCalculateRiskFactors(decisions);

      expect(results.get('DR-001')!.matrixUsed).toBe('RISK-LOW');
      expect(results.get('DR-002')!.matrixUsed).toBe('RISK-HIGH');
    });
  });

  describe('getRiskStatistics', () => {
    it('should calculate correct statistics for multiple attributions', () => {
      const attributions: RiskAttribution[] = [
        {
          decisionRecordId: 'DR-001',
          riskCategoryId: 'RISK-001',
          compositeRiskFactor: 1.2,
          riskComponents: { baseWeight: 1.0, confidenceFactor: 0.1, volatilityAdjustment: 0.1 },
          isCapped: false,
          matrixUsed: 'RISK-001',
        },
        {
          decisionRecordId: 'DR-002',
          riskCategoryId: 'RISK-001',
          compositeRiskFactor: 1.5,
          riskComponents: { baseWeight: 1.0, confidenceFactor: 0.3, volatilityAdjustment: 0.2 },
          isCapped: false,
          matrixUsed: 'RISK-001',
        },
        {
          decisionRecordId: 'DR-003',
          riskCategoryId: 'RISK-002',
          compositeRiskFactor: 2.0,
          riskComponents: { baseWeight: 1.5, confidenceFactor: 0.3, volatilityAdjustment: 0.2 },
          isCapped: true,
          matrixUsed: 'RISK-002',
        },
      ];

      const attributor = new RiskAttributor([]);
      const stats = attributor.getRiskStatistics(attributions);

      expect(stats.count).toBe(3);
      expect(stats.averageRiskFactor).toBeCloseTo((1.2 + 1.5 + 2.0) / 3, 10);
      expect(stats.minRiskFactor).toBe(1.2);
      expect(stats.maxRiskFactor).toBe(2.0);
      expect(stats.cappedCount).toBe(1);
      expect(stats.categoryDistribution.get('RISK-001')).toBe(2);
      expect(stats.categoryDistribution.get('RISK-002')).toBe(1);
    });

    it('should return zero statistics for empty attributions', () => {
      const attributor = new RiskAttributor([]);
      const stats = attributor.getRiskStatistics([]);

      expect(stats.count).toBe(0);
      expect(stats.averageRiskFactor).toBe(0);
      expect(stats.minRiskFactor).toBe(0);
      expect(stats.maxRiskFactor).toBe(0);
      expect(stats.cappedCount).toBe(0);
      expect(stats.categoryDistribution.size).toBe(0);
    });

    it('should handle single attribution', () => {
      const attributions: RiskAttribution[] = [
        {
          decisionRecordId: 'DR-001',
          riskCategoryId: 'RISK-SOLO',
          compositeRiskFactor: 1.75,
          riskComponents: { baseWeight: 1.0, confidenceFactor: 0.5, volatilityAdjustment: 0.25 },
          isCapped: false,
          matrixUsed: 'RISK-SOLO',
        },
      ];

      const attributor = new RiskAttributor([]);
      const stats = attributor.getRiskStatistics(attributions);

      expect(stats.count).toBe(1);
      expect(stats.averageRiskFactor).toBe(1.75);
      expect(stats.minRiskFactor).toBe(1.75);
      expect(stats.maxRiskFactor).toBe(1.75);
      expect(stats.cappedCount).toBe(0);
      expect(stats.categoryDistribution.get('RISK-SOLO')).toBe(1);
    });

    it('should count all capped attributions', () => {
      const attributions: RiskAttribution[] = [
        {
          decisionRecordId: 'DR-001',
          riskCategoryId: 'RISK-001',
          compositeRiskFactor: 2.5,
          riskComponents: { baseWeight: 1.0, confidenceFactor: 1.0, volatilityAdjustment: 1.0 },
          isCapped: true,
          matrixUsed: 'RISK-001',
        },
        {
          decisionRecordId: 'DR-002',
          riskCategoryId: 'RISK-001',
          compositeRiskFactor: 2.5,
          riskComponents: { baseWeight: 1.0, confidenceFactor: 1.0, volatilityAdjustment: 1.0 },
          isCapped: true,
          matrixUsed: 'RISK-001',
        },
      ];

      const attributor = new RiskAttributor([]);
      const stats = attributor.getRiskStatistics(attributions);

      expect(stats.cappedCount).toBe(2);
    });
  });

  describe('integration scenarios', () => {
    it('should correctly process a realistic risk scenario', () => {
      // Define risk matrices for different decision categories
      const matrices = [
        createMockRiskMatrix({
          categoryId: 'COST_REDUCTION',
          categoryName: 'Cost Reduction Risk',
          baseWeight: 1.0,
          confidenceDecayRate: 0.3,
          volatilityMultiplier: 0.5,
          maxWeight: 2.0,
        }),
        createMockRiskMatrix({
          categoryId: 'VENDOR_SELECTION',
          categoryName: 'Vendor Selection Risk',
          baseWeight: 1.2,
          confidenceDecayRate: 0.4,
          volatilityMultiplier: 0.7,
          maxWeight: 2.5,
        }),
        createMockRiskMatrix({
          categoryId: 'CAPACITY_PLANNING',
          categoryName: 'Capacity Planning Risk',
          baseWeight: 1.3,
          confidenceDecayRate: 0.5,
          volatilityMultiplier: 0.8,
          maxWeight: 3.0,
        }),
      ];

      const attributor = new RiskAttributor(matrices);

      // Test cost reduction decision with high confidence
      const costReductionDecision = createMockDecisionRecord({
        recordId: 'DR-COST',
        riskCategoryId: 'COST_REDUCTION',
        confidenceScore: 0.9,
        volatilityScore: 0.1,
      });

      const costResult = attributor.calculateRiskFactor(costReductionDecision);
      expect(costResult.matrixUsed).toBe('COST_REDUCTION');
      expect(costResult.compositeRiskFactor).toBeLessThan(1.5);

      // Test vendor selection decision with medium confidence
      const vendorDecision = createMockDecisionRecord({
        recordId: 'DR-VENDOR',
        riskCategoryId: 'VENDOR_SELECTION',
        confidenceScore: 0.7,
        volatilityScore: 0.4,
      });

      const vendorResult = attributor.calculateRiskFactor(vendorDecision);
      expect(vendorResult.matrixUsed).toBe('VENDOR_SELECTION');
      expect(vendorResult.compositeRiskFactor).toBeGreaterThan(costResult.compositeRiskFactor);

      // Test capacity planning decision with low confidence and high volatility
      const capacityDecision = createMockDecisionRecord({
        recordId: 'DR-CAPACITY',
        riskCategoryId: 'CAPACITY_PLANNING',
        confidenceScore: 0.5,
        volatilityScore: 0.8,
      });

      const capacityResult = attributor.calculateRiskFactor(capacityDecision);
      expect(capacityResult.matrixUsed).toBe('CAPACITY_PLANNING');
      expect(capacityResult.compositeRiskFactor).toBeGreaterThan(vendorResult.compositeRiskFactor);
    });
  });
});
