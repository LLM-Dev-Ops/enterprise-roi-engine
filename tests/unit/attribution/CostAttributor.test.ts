/**
 * CostAttributor Unit Tests
 * Tests for cost attribution logic including hierarchy traversal,
 * period adjustments, and allocation methods.
 */

import {
  CostAttributor,
  PeriodAdjustment,
} from '../../../src/attribution/CostAttributor';
import {
  CanonicalDecisionRecord,
  FiscalPeriod,
  DecisionCategory,
  AllocationMethod,
  ImpactType,
  AttributionError,
} from '../../../src/contracts';
import { CostCenter } from '../../../src/contracts/erp';

// =============================================================================
// Mock Data Factories
// =============================================================================

function createMockCostCenter(overrides: Partial<CostCenter> = {}): CostCenter {
  return {
    costCenterId: 'CC-001',
    name: 'Engineering',
    parentCostCenterId: null,
    hierarchyLevel: 1,
    acceptsDirectCharges: true,
    currency: 'USD',
    isActive: true,
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
// Test Suite: CostAttributor
// =============================================================================

describe('CostAttributor', () => {
  describe('constructor', () => {
    it('should initialize with cost centers', () => {
      const costCenters = [
        createMockCostCenter({ costCenterId: 'CC-001' }),
        createMockCostCenter({ costCenterId: 'CC-002', name: 'Operations' }),
      ];

      const attributor = new CostAttributor(costCenters);

      expect(attributor.hasCostCenter('CC-001')).toBe(true);
      expect(attributor.hasCostCenter('CC-002')).toBe(true);
      expect(attributor.hasCostCenter('CC-999')).toBe(false);
    });

    it('should initialize with empty cost centers', () => {
      const attributor = new CostAttributor([]);
      expect(attributor.hasCostCenter('CC-001')).toBe(false);
    });

    it('should initialize with period adjustments', () => {
      const costCenters = [createMockCostCenter()];
      const periodAdjustments: PeriodAdjustment[] = [
        {
          period: { year: 2024, period: 1, startDate: '2024-01-01T00:00:00Z', endDate: '2024-01-31T23:59:59Z' },
          adjustmentFactor: 1.1,
          reason: 'Seasonal adjustment',
        },
      ];

      const attributor = new CostAttributor(costCenters, periodAdjustments);
      expect(attributor).toBeDefined();
    });
  });

  describe('computePrimaryAttribution', () => {
    describe('DIRECT allocation method', () => {
      it('should attribute directly when cost center accepts direct charges', () => {
        const costCenters = [
          createMockCostCenter({
            costCenterId: 'CC-001',
            name: 'Engineering',
            hierarchyLevel: 2,
            acceptsDirectCharges: true,
          }),
        ];
        const attributor = new CostAttributor(costCenters);
        const decision = createMockDecisionRecord({
          primaryCostCenterId: 'CC-001',
          grossImpactAmount: '15000.0000',
        });
        const fiscalPeriod = createMockFiscalPeriod();

        const result = attributor.computePrimaryAttribution(decision, fiscalPeriod);

        expect(result.decisionRecordId).toBe('DR-001');
        expect(result.costCenterId).toBe('CC-001');
        expect(result.costCenterName).toBe('Engineering');
        expect(result.costCenterLevel).toBe(2);
        expect(result.attributedAmount).toBe('15000.0000');
        expect(result.originalAmount).toBe('15000.0000');
        expect(result.adjustmentFactor).toBe(1.0);
        expect(result.attributionBasis).toBe('DIRECT_ATTRIBUTION');
      });

      it('should handle zero amount', () => {
        const costCenters = [createMockCostCenter()];
        const attributor = new CostAttributor(costCenters);
        const decision = createMockDecisionRecord({
          grossImpactAmount: '0.0000',
        });
        const fiscalPeriod = createMockFiscalPeriod();

        const result = attributor.computePrimaryAttribution(decision, fiscalPeriod);

        expect(result.attributedAmount).toBe('0.0000');
        expect(result.originalAmount).toBe('0.0000');
      });

      it('should handle negative amounts (costs)', () => {
        const costCenters = [createMockCostCenter()];
        const attributor = new CostAttributor(costCenters);
        const decision = createMockDecisionRecord({
          grossImpactAmount: '-5000.0000',
        });
        const fiscalPeriod = createMockFiscalPeriod();

        const result = attributor.computePrimaryAttribution(decision, fiscalPeriod);

        expect(result.attributedAmount).toBe('-5000.0000');
      });

      it('should handle large amounts with precision', () => {
        const costCenters = [createMockCostCenter()];
        const attributor = new CostAttributor(costCenters);
        const decision = createMockDecisionRecord({
          grossImpactAmount: '999999999.9999',
        });
        const fiscalPeriod = createMockFiscalPeriod();

        const result = attributor.computePrimaryAttribution(decision, fiscalPeriod);

        expect(result.attributedAmount).toBe('999999999.9999');
      });
    });

    describe('STEP_DOWN allocation method (hierarchy traversal)', () => {
      it('should traverse up hierarchy when primary cost center does not accept direct charges', () => {
        const costCenters = [
          createMockCostCenter({
            costCenterId: 'CC-CHILD',
            name: 'Child Center',
            parentCostCenterId: 'CC-PARENT',
            hierarchyLevel: 3,
            acceptsDirectCharges: false,
          }),
          createMockCostCenter({
            costCenterId: 'CC-PARENT',
            name: 'Parent Center',
            parentCostCenterId: null,
            hierarchyLevel: 2,
            acceptsDirectCharges: true,
          }),
        ];
        const attributor = new CostAttributor(costCenters);
        const decision = createMockDecisionRecord({
          primaryCostCenterId: 'CC-CHILD',
          grossImpactAmount: '10000.0000',
        });
        const fiscalPeriod = createMockFiscalPeriod();

        const result = attributor.computePrimaryAttribution(decision, fiscalPeriod);

        expect(result.costCenterId).toBe('CC-PARENT');
        expect(result.costCenterName).toBe('Parent Center');
        expect(result.costCenterLevel).toBe(2);
        expect(result.attributionBasis).toContain('HIERARCHY_ROLLUP');
        expect(result.attributionBasis).toContain('levels=1');
        expect(result.attributionBasis).toContain('from=CC-CHILD');
      });

      it('should traverse multiple levels up hierarchy', () => {
        const costCenters = [
          createMockCostCenter({
            costCenterId: 'CC-LEVEL3',
            name: 'Level 3',
            parentCostCenterId: 'CC-LEVEL2',
            hierarchyLevel: 3,
            acceptsDirectCharges: false,
          }),
          createMockCostCenter({
            costCenterId: 'CC-LEVEL2',
            name: 'Level 2',
            parentCostCenterId: 'CC-LEVEL1',
            hierarchyLevel: 2,
            acceptsDirectCharges: false,
          }),
          createMockCostCenter({
            costCenterId: 'CC-LEVEL1',
            name: 'Level 1',
            parentCostCenterId: null,
            hierarchyLevel: 1,
            acceptsDirectCharges: true,
          }),
        ];
        const attributor = new CostAttributor(costCenters);
        const decision = createMockDecisionRecord({
          primaryCostCenterId: 'CC-LEVEL3',
        });
        const fiscalPeriod = createMockFiscalPeriod();

        const result = attributor.computePrimaryAttribution(decision, fiscalPeriod);

        expect(result.costCenterId).toBe('CC-LEVEL1');
        expect(result.attributionBasis).toContain('levels=2');
      });
    });

    describe('period adjustments', () => {
      it('should apply period adjustment factor when defined', () => {
        const costCenters = [createMockCostCenter()];
        const periodAdjustments: PeriodAdjustment[] = [
          {
            period: { year: 2024, period: 1, startDate: '2024-01-01T00:00:00Z', endDate: '2024-01-31T23:59:59Z' },
            adjustmentFactor: 1.2,
            reason: 'Q1 seasonal adjustment',
          },
        ];
        const attributor = new CostAttributor(costCenters, periodAdjustments);
        const decision = createMockDecisionRecord({
          grossImpactAmount: '10000.0000',
        });
        const fiscalPeriod = createMockFiscalPeriod({ year: 2024, period: 1 });

        const result = attributor.computePrimaryAttribution(decision, fiscalPeriod);

        expect(result.attributedAmount).toBe('12000.0000');
        expect(result.originalAmount).toBe('10000.0000');
        expect(result.adjustmentFactor).toBe(1.2);
        expect(result.attributionBasis).toContain('adjustment=Q1 seasonal adjustment');
      });

      it('should apply adjustment factor less than 1 (discount)', () => {
        const costCenters = [createMockCostCenter()];
        const periodAdjustments: PeriodAdjustment[] = [
          {
            period: { year: 2024, period: 6, startDate: '2024-06-01T00:00:00Z', endDate: '2024-06-30T23:59:59Z' },
            adjustmentFactor: 0.8,
            reason: 'Mid-year discount',
          },
        ];
        const attributor = new CostAttributor(costCenters, periodAdjustments);
        const decision = createMockDecisionRecord({
          grossImpactAmount: '10000.0000',
        });
        const fiscalPeriod = createMockFiscalPeriod({ year: 2024, period: 6 });

        const result = attributor.computePrimaryAttribution(decision, fiscalPeriod);

        expect(result.attributedAmount).toBe('8000.0000');
        expect(result.adjustmentFactor).toBe(0.8);
      });

      it('should use default factor of 1.0 when no period adjustment defined', () => {
        const costCenters = [createMockCostCenter()];
        const periodAdjustments: PeriodAdjustment[] = [
          {
            period: { year: 2024, period: 1, startDate: '2024-01-01T00:00:00Z', endDate: '2024-01-31T23:59:59Z' },
            adjustmentFactor: 1.5,
            reason: 'Q1 adjustment',
          },
        ];
        const attributor = new CostAttributor(costCenters, periodAdjustments);
        const decision = createMockDecisionRecord({
          grossImpactAmount: '10000.0000',
        });
        // Different period - no adjustment defined for period 2
        const fiscalPeriod = createMockFiscalPeriod({ year: 2024, period: 2 });

        const result = attributor.computePrimaryAttribution(decision, fiscalPeriod);

        expect(result.attributedAmount).toBe('10000.0000');
        expect(result.adjustmentFactor).toBe(1.0);
        expect(result.attributionBasis).not.toContain('adjustment=');
      });
    });

    describe('error handling', () => {
      it('should throw AttributionError when cost center not found', () => {
        const costCenters = [createMockCostCenter({ costCenterId: 'CC-001' })];
        const attributor = new CostAttributor(costCenters);
        const decision = createMockDecisionRecord({
          primaryCostCenterId: 'CC-NONEXISTENT',
        });
        const fiscalPeriod = createMockFiscalPeriod();

        expect(() => {
          attributor.computePrimaryAttribution(decision, fiscalPeriod);
        }).toThrow(AttributionError);

        try {
          attributor.computePrimaryAttribution(decision, fiscalPeriod);
        } catch (error) {
          expect(error).toBeInstanceOf(AttributionError);
          expect((error as AttributionError).message).toContain('Cost center not found');
          expect((error as AttributionError).entityId).toBe('CC-NONEXISTENT');
        }
      });

      it('should throw AttributionError when no cost center in hierarchy accepts direct charges', () => {
        const costCenters = [
          createMockCostCenter({
            costCenterId: 'CC-CHILD',
            parentCostCenterId: 'CC-PARENT',
            acceptsDirectCharges: false,
          }),
          createMockCostCenter({
            costCenterId: 'CC-PARENT',
            parentCostCenterId: null,
            acceptsDirectCharges: false,
          }),
        ];
        const attributor = new CostAttributor(costCenters);
        const decision = createMockDecisionRecord({
          primaryCostCenterId: 'CC-CHILD',
        });
        const fiscalPeriod = createMockFiscalPeriod();

        expect(() => {
          attributor.computePrimaryAttribution(decision, fiscalPeriod);
        }).toThrow(AttributionError);

        try {
          attributor.computePrimaryAttribution(decision, fiscalPeriod);
        } catch (error) {
          expect(error).toBeInstanceOf(AttributionError);
          expect((error as AttributionError).message).toContain('No cost center in hierarchy accepts direct charges');
        }
      });

      it('should throw AttributionError when parent cost center not found in hierarchy', () => {
        const costCenters = [
          createMockCostCenter({
            costCenterId: 'CC-CHILD',
            parentCostCenterId: 'CC-ORPHAN-PARENT', // Parent doesn't exist
            acceptsDirectCharges: false,
          }),
        ];
        const attributor = new CostAttributor(costCenters);
        const decision = createMockDecisionRecord({
          primaryCostCenterId: 'CC-CHILD',
        });
        const fiscalPeriod = createMockFiscalPeriod();

        expect(() => {
          attributor.computePrimaryAttribution(decision, fiscalPeriod);
        }).toThrow(AttributionError);
      });
    });
  });

  describe('hasCostCenter', () => {
    it('should return true for existing cost center', () => {
      const costCenters = [
        createMockCostCenter({ costCenterId: 'CC-001' }),
        createMockCostCenter({ costCenterId: 'CC-002' }),
      ];
      const attributor = new CostAttributor(costCenters);

      expect(attributor.hasCostCenter('CC-001')).toBe(true);
      expect(attributor.hasCostCenter('CC-002')).toBe(true);
    });

    it('should return false for non-existing cost center', () => {
      const costCenters = [createMockCostCenter({ costCenterId: 'CC-001' })];
      const attributor = new CostAttributor(costCenters);

      expect(attributor.hasCostCenter('CC-NONEXISTENT')).toBe(false);
    });

    it('should handle empty string', () => {
      const costCenters = [createMockCostCenter()];
      const attributor = new CostAttributor(costCenters);

      expect(attributor.hasCostCenter('')).toBe(false);
    });
  });

  describe('getHierarchyPath', () => {
    it('should return single-element path for root cost center', () => {
      const costCenters = [
        createMockCostCenter({
          costCenterId: 'CC-ROOT',
          parentCostCenterId: null,
        }),
      ];
      const attributor = new CostAttributor(costCenters);

      const path = attributor.getHierarchyPath('CC-ROOT');

      expect(path).toEqual(['CC-ROOT']);
    });

    it('should return full path from child to root', () => {
      const costCenters = [
        createMockCostCenter({
          costCenterId: 'CC-CHILD',
          parentCostCenterId: 'CC-PARENT',
        }),
        createMockCostCenter({
          costCenterId: 'CC-PARENT',
          parentCostCenterId: 'CC-ROOT',
        }),
        createMockCostCenter({
          costCenterId: 'CC-ROOT',
          parentCostCenterId: null,
        }),
      ];
      const attributor = new CostAttributor(costCenters);

      const path = attributor.getHierarchyPath('CC-CHILD');

      expect(path).toEqual(['CC-CHILD', 'CC-PARENT', 'CC-ROOT']);
    });

    it('should return empty path for non-existing cost center', () => {
      const costCenters = [createMockCostCenter({ costCenterId: 'CC-001' })];
      const attributor = new CostAttributor(costCenters);

      const path = attributor.getHierarchyPath('CC-NONEXISTENT');

      expect(path).toEqual([]);
    });

    it('should handle broken hierarchy (orphan reference)', () => {
      const costCenters = [
        createMockCostCenter({
          costCenterId: 'CC-ORPHAN',
          parentCostCenterId: 'CC-NONEXISTENT',
        }),
      ];
      const attributor = new CostAttributor(costCenters);

      const path = attributor.getHierarchyPath('CC-ORPHAN');

      // Should return path up to the point where it can traverse
      expect(path).toEqual(['CC-ORPHAN']);
    });
  });

  describe('ACTIVITY_BASED allocation (via attribution basis)', () => {
    it('should support activity-based allocation with hierarchy rollup', () => {
      const costCenters = [
        createMockCostCenter({
          costCenterId: 'CC-ACTIVITY',
          name: 'Activity Center',
          parentCostCenterId: 'CC-DEPT',
          hierarchyLevel: 3,
          acceptsDirectCharges: false,
        }),
        createMockCostCenter({
          costCenterId: 'CC-DEPT',
          name: 'Department',
          parentCostCenterId: null,
          hierarchyLevel: 2,
          acceptsDirectCharges: true,
        }),
      ];
      const attributor = new CostAttributor(costCenters);
      const decision = createMockDecisionRecord({
        primaryCostCenterId: 'CC-ACTIVITY',
        secondaryCostCenters: [
          {
            costCenterId: 'CC-DEPT',
            allocationPercentage: 60,
            allocationMethod: AllocationMethod.ACTIVITY_BASED,
          },
        ],
      });
      const fiscalPeriod = createMockFiscalPeriod();

      const result = attributor.computePrimaryAttribution(decision, fiscalPeriod);

      // The primary attribution should roll up to the accepting cost center
      expect(result.costCenterId).toBe('CC-DEPT');
      expect(result.attributionBasis).toContain('HIERARCHY_ROLLUP');
    });
  });

  describe('edge cases', () => {
    it('should handle decimal precision in amounts', () => {
      const costCenters = [createMockCostCenter()];
      const attributor = new CostAttributor(costCenters);
      const decision = createMockDecisionRecord({
        grossImpactAmount: '12345.6789',
      });
      const fiscalPeriod = createMockFiscalPeriod();

      const result = attributor.computePrimaryAttribution(decision, fiscalPeriod);

      expect(result.attributedAmount).toBe('12345.6789');
    });

    it('should handle very small amounts', () => {
      const costCenters = [createMockCostCenter()];
      const attributor = new CostAttributor(costCenters);
      const decision = createMockDecisionRecord({
        grossImpactAmount: '0.0001',
      });
      const fiscalPeriod = createMockFiscalPeriod();

      const result = attributor.computePrimaryAttribution(decision, fiscalPeriod);

      expect(result.attributedAmount).toBe('0.0001');
    });

    it('should handle multiple decisions to same cost center', () => {
      const costCenters = [createMockCostCenter({ costCenterId: 'CC-SHARED' })];
      const attributor = new CostAttributor(costCenters);
      const fiscalPeriod = createMockFiscalPeriod();

      const decision1 = createMockDecisionRecord({
        recordId: 'DR-001',
        primaryCostCenterId: 'CC-SHARED',
        grossImpactAmount: '5000.0000',
      });
      const decision2 = createMockDecisionRecord({
        recordId: 'DR-002',
        primaryCostCenterId: 'CC-SHARED',
        grossImpactAmount: '7500.0000',
      });

      const result1 = attributor.computePrimaryAttribution(decision1, fiscalPeriod);
      const result2 = attributor.computePrimaryAttribution(decision2, fiscalPeriod);

      expect(result1.costCenterId).toBe('CC-SHARED');
      expect(result2.costCenterId).toBe('CC-SHARED');
      expect(result1.attributedAmount).toBe('5000.0000');
      expect(result2.attributedAmount).toBe('7500.0000');
    });

    it('should preserve fiscal period in attribution', () => {
      const costCenters = [createMockCostCenter()];
      const attributor = new CostAttributor(costCenters);
      const decision = createMockDecisionRecord();
      const fiscalPeriod = createMockFiscalPeriod({
        year: 2025,
        period: 6,
        startDate: '2025-06-01T00:00:00Z',
        endDate: '2025-06-30T23:59:59Z',
      });

      const result = attributor.computePrimaryAttribution(decision, fiscalPeriod);

      expect(result.fiscalPeriod.year).toBe(2025);
      expect(result.fiscalPeriod.period).toBe(6);
    });
  });
});
