/**
 * BenefitAttributor Unit Tests
 * Tests for benefit distribution logic including allocation methods,
 * normalization, and validation.
 */

import {
  BenefitAttributor,
} from '../../../src/attribution/BenefitAttributor';
import {
  CanonicalDecisionRecord,
  CostCenterAllocation,
  FiscalPeriod,
  DecisionCategory,
  AllocationMethod,
  ImpactType,
} from '../../../src/contracts';

// =============================================================================
// Mock Data Factories
// =============================================================================

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

function createMockCostCenterAllocation(
  overrides: Partial<CostCenterAllocation> = {}
): CostCenterAllocation {
  return {
    costCenterId: 'CC-002',
    allocationPercentage: 50,
    allocationMethod: AllocationMethod.DIRECT,
    ...overrides,
  };
}

// =============================================================================
// Test Suite: BenefitAttributor
// =============================================================================

describe('BenefitAttributor', () => {
  let benefitAttributor: BenefitAttributor;

  beforeEach(() => {
    benefitAttributor = new BenefitAttributor();
  });

  describe('distributeBenefits', () => {
    describe('DIRECT allocation method', () => {
      it('should distribute 100% to primary cost center when no secondary allocations', () => {
        const decision = createMockDecisionRecord({
          primaryCostCenterId: 'CC-PRIMARY',
          secondaryCostCenters: [],
        });

        const result = benefitAttributor.distributeBenefits(decision, '10000.0000');

        expect(result).toHaveLength(1);
        expect(result[0]!.costCenterId).toBe('CC-PRIMARY');
        expect(result[0]!.amount).toBe('10000.0000');
        expect(result[0]!.allocationPercentage).toBe(100);
        expect(result[0]!.allocationType).toBe('PRIMARY');
        expect(result[0]!.allocationMethod).toBe(AllocationMethod.DIRECT);
      });

      it('should distribute to primary and secondary cost centers', () => {
        const decision = createMockDecisionRecord({
          primaryCostCenterId: 'CC-PRIMARY',
          secondaryCostCenters: [
            createMockCostCenterAllocation({
              costCenterId: 'CC-SECONDARY',
              allocationPercentage: 40,
              allocationMethod: AllocationMethod.DIRECT,
            }),
          ],
        });

        const result = benefitAttributor.distributeBenefits(decision, '10000.0000');

        expect(result).toHaveLength(2);

        const primary = result.find(r => r.allocationType === 'PRIMARY');
        const secondary = result.find(r => r.allocationType === 'SECONDARY');

        expect(primary).toBeDefined();
        expect(primary!.costCenterId).toBe('CC-PRIMARY');
        expect(primary!.allocationPercentage).toBe(60); // 100 - 40 = 60%
        expect(primary!.amount).toBe('6000.0000');

        expect(secondary).toBeDefined();
        expect(secondary!.costCenterId).toBe('CC-SECONDARY');
        expect(secondary!.allocationPercentage).toBe(40);
        expect(secondary!.amount).toBe('4000.0000');
      });

      it('should handle multiple secondary allocations', () => {
        const decision = createMockDecisionRecord({
          primaryCostCenterId: 'CC-PRIMARY',
          secondaryCostCenters: [
            createMockCostCenterAllocation({
              costCenterId: 'CC-SEC-1',
              allocationPercentage: 30,
            }),
            createMockCostCenterAllocation({
              costCenterId: 'CC-SEC-2',
              allocationPercentage: 20,
            }),
            createMockCostCenterAllocation({
              costCenterId: 'CC-SEC-3',
              allocationPercentage: 10,
            }),
          ],
        });

        const result = benefitAttributor.distributeBenefits(decision, '10000.0000');

        expect(result).toHaveLength(4);

        const primary = result.find(r => r.allocationType === 'PRIMARY');
        expect(primary!.allocationPercentage).toBe(40); // 100 - 60 = 40%
        expect(primary!.amount).toBe('4000.0000');

        // Check secondary allocations
        expect(result.filter(r => r.allocationType === 'SECONDARY')).toHaveLength(3);
      });

      it('should not include primary when secondary allocations sum to 100%', () => {
        const decision = createMockDecisionRecord({
          primaryCostCenterId: 'CC-PRIMARY',
          secondaryCostCenters: [
            createMockCostCenterAllocation({
              costCenterId: 'CC-SEC-1',
              allocationPercentage: 60,
            }),
            createMockCostCenterAllocation({
              costCenterId: 'CC-SEC-2',
              allocationPercentage: 40,
            }),
          ],
        });

        const result = benefitAttributor.distributeBenefits(decision, '10000.0000');

        expect(result).toHaveLength(2);
        expect(result.every(r => r.allocationType === 'SECONDARY')).toBe(true);
      });
    });

    describe('STEP_DOWN allocation method', () => {
      it('should handle step-down allocation method', () => {
        const decision = createMockDecisionRecord({
          primaryCostCenterId: 'CC-PRIMARY',
          secondaryCostCenters: [
            createMockCostCenterAllocation({
              costCenterId: 'CC-STEPDOWN',
              allocationPercentage: 50,
              allocationMethod: AllocationMethod.STEP_DOWN,
            }),
          ],
        });

        const result = benefitAttributor.distributeBenefits(decision, '10000.0000');

        expect(result).toHaveLength(2);
        const stepDown = result.find(r => r.costCenterId === 'CC-STEPDOWN');
        expect(stepDown).toBeDefined();
        expect(stepDown!.allocationMethod).toBe(AllocationMethod.STEP_DOWN);
        expect(stepDown!.amount).toBe('5000.0000');
      });
    });

    describe('ACTIVITY_BASED allocation method', () => {
      it('should handle activity-based allocation method', () => {
        const decision = createMockDecisionRecord({
          primaryCostCenterId: 'CC-PRIMARY',
          secondaryCostCenters: [
            createMockCostCenterAllocation({
              costCenterId: 'CC-ACTIVITY',
              allocationPercentage: 70,
              allocationMethod: AllocationMethod.ACTIVITY_BASED,
            }),
          ],
        });

        const result = benefitAttributor.distributeBenefits(decision, '10000.0000');

        expect(result).toHaveLength(2);
        const activity = result.find(r => r.costCenterId === 'CC-ACTIVITY');
        expect(activity).toBeDefined();
        expect(activity!.allocationMethod).toBe(AllocationMethod.ACTIVITY_BASED);
        expect(activity!.amount).toBe('7000.0000');
      });
    });

    describe('normalization', () => {
      it('should normalize percentages when secondary allocations exceed 100%', () => {
        const decision = createMockDecisionRecord({
          primaryCostCenterId: 'CC-PRIMARY',
          secondaryCostCenters: [
            createMockCostCenterAllocation({
              costCenterId: 'CC-SEC-1',
              allocationPercentage: 80,
            }),
            createMockCostCenterAllocation({
              costCenterId: 'CC-SEC-2',
              allocationPercentage: 80,
            }),
          ],
        });

        const result = benefitAttributor.distributeBenefits(decision, '10000.0000');

        // Should normalize: 80 + 80 = 160%, normalized to 100%
        // Each secondary should be 50% after normalization
        expect(result).toHaveLength(2);
        const totalPercentage = result.reduce((sum, r) => sum + r.allocationPercentage, 0);
        expect(totalPercentage).toBe(100);
      });

      it('should handle zero total percentage by distributing equally', () => {
        const decision = createMockDecisionRecord({
          primaryCostCenterId: 'CC-PRIMARY',
          secondaryCostCenters: [
            createMockCostCenterAllocation({
              costCenterId: 'CC-SEC-1',
              allocationPercentage: 0,
            }),
            createMockCostCenterAllocation({
              costCenterId: 'CC-SEC-2',
              allocationPercentage: 0,
            }),
          ],
        });

        const result = benefitAttributor.distributeBenefits(decision, '10000.0000');

        // With zero percentages, should distribute equally among all allocations
        // Primary (0%) + SEC-1 (0%) + SEC-2 (0%) = 3 allocations
        expect(result).toHaveLength(3);
        result.forEach(r => {
          expect(r.allocationPercentage).toBeCloseTo(33.333, 2);
        });
      });
    });

    describe('edge cases', () => {
      it('should handle zero amount', () => {
        const decision = createMockDecisionRecord({
          primaryCostCenterId: 'CC-PRIMARY',
          secondaryCostCenters: [],
        });

        const result = benefitAttributor.distributeBenefits(decision, '0.0000');

        expect(result).toHaveLength(1);
        expect(result[0]!.amount).toBe('0.0000');
      });

      it('should handle negative amount (costs)', () => {
        const decision = createMockDecisionRecord({
          primaryCostCenterId: 'CC-PRIMARY',
          secondaryCostCenters: [
            createMockCostCenterAllocation({
              costCenterId: 'CC-SEC',
              allocationPercentage: 50,
            }),
          ],
        });

        const result = benefitAttributor.distributeBenefits(decision, '-10000.0000');

        expect(result).toHaveLength(2);
        expect(result.find(r => r.allocationType === 'PRIMARY')!.amount).toBe('-5000.0000');
        expect(result.find(r => r.allocationType === 'SECONDARY')!.amount).toBe('-5000.0000');
      });

      it('should handle large amounts with precision', () => {
        const decision = createMockDecisionRecord({
          primaryCostCenterId: 'CC-PRIMARY',
          secondaryCostCenters: [],
        });

        const result = benefitAttributor.distributeBenefits(decision, '999999999.9999');

        expect(result[0]!.amount).toBe('999999999.9999');
      });

      it('should handle very small percentages', () => {
        const decision = createMockDecisionRecord({
          primaryCostCenterId: 'CC-PRIMARY',
          secondaryCostCenters: [
            createMockCostCenterAllocation({
              costCenterId: 'CC-SEC',
              allocationPercentage: 0.01, // Very small percentage
            }),
          ],
        });

        const result = benefitAttributor.distributeBenefits(decision, '10000.0000');

        expect(result).toHaveLength(2);
        // Primary should get 99.99%
        const primary = result.find(r => r.allocationType === 'PRIMARY');
        expect(primary).toBeDefined();
      });
    });

    describe('amount balancing', () => {
      it('should ensure distributed amounts sum to total amount', () => {
        const decision = createMockDecisionRecord({
          primaryCostCenterId: 'CC-PRIMARY',
          secondaryCostCenters: [
            createMockCostCenterAllocation({
              costCenterId: 'CC-SEC-1',
              allocationPercentage: 33.33,
            }),
            createMockCostCenterAllocation({
              costCenterId: 'CC-SEC-2',
              allocationPercentage: 33.33,
            }),
          ],
        });

        const result = benefitAttributor.distributeBenefits(decision, '10000.0000');

        // Sum all distributed amounts
        const totalDistributed = result.reduce(
          (sum, r) => sum + parseFloat(r.amount),
          0
        );

        // Should be approximately 10000 (allowing for rounding)
        expect(totalDistributed).toBeCloseTo(10000, 2);
      });
    });
  });

  describe('createPrimaryOnlyDistribution', () => {
    it('should create a single primary distribution', () => {
      const result = benefitAttributor.createPrimaryOnlyDistribution(
        'CC-PRIMARY',
        '15000.0000'
      );

      expect(result).toHaveLength(1);
      expect(result[0]!.costCenterId).toBe('CC-PRIMARY');
      expect(result[0]!.amount).toBe('15000.0000');
      expect(result[0]!.allocationPercentage).toBe(100);
      expect(result[0]!.allocationType).toBe('PRIMARY');
      expect(result[0]!.allocationMethod).toBe(AllocationMethod.DIRECT);
    });

    it('should handle zero amount', () => {
      const result = benefitAttributor.createPrimaryOnlyDistribution(
        'CC-PRIMARY',
        '0.0000'
      );

      expect(result).toHaveLength(1);
      expect(result[0]!.amount).toBe('0.0000');
    });
  });

  describe('validateAllocations', () => {
    it('should return valid result for allocations summing to 100%', () => {
      const allocations: CostCenterAllocation[] = [
        createMockCostCenterAllocation({
          costCenterId: 'CC-1',
          allocationPercentage: 60,
        }),
        createMockCostCenterAllocation({
          costCenterId: 'CC-2',
          allocationPercentage: 40,
        }),
      ];

      const result = benefitAttributor.validateAllocations(allocations);

      expect(result.isValid).toBe(true);
      expect(result.issues).toHaveLength(0);
      expect(result.totalPercentage).toBe(100);
    });

    it('should return valid result for allocations summing to less than 100%', () => {
      const allocations: CostCenterAllocation[] = [
        createMockCostCenterAllocation({
          costCenterId: 'CC-1',
          allocationPercentage: 30,
        }),
        createMockCostCenterAllocation({
          costCenterId: 'CC-2',
          allocationPercentage: 30,
        }),
      ];

      const result = benefitAttributor.validateAllocations(allocations);

      expect(result.isValid).toBe(true);
      expect(result.totalPercentage).toBe(60);
    });

    it('should return invalid result for allocations exceeding 100%', () => {
      const allocations: CostCenterAllocation[] = [
        createMockCostCenterAllocation({
          costCenterId: 'CC-1',
          allocationPercentage: 70,
        }),
        createMockCostCenterAllocation({
          costCenterId: 'CC-2',
          allocationPercentage: 50,
        }),
      ];

      const result = benefitAttributor.validateAllocations(allocations);

      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Total allocation percentage exceeds 100%: 120%');
      expect(result.totalPercentage).toBe(120);
    });

    it('should return invalid result for negative allocations', () => {
      const allocations: CostCenterAllocation[] = [
        createMockCostCenterAllocation({
          costCenterId: 'CC-1',
          allocationPercentage: -10,
        }),
      ];

      const result = benefitAttributor.validateAllocations(allocations);

      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Negative allocation for CC-1: -10%');
    });

    it('should return invalid result for individual allocation exceeding 100%', () => {
      const allocations: CostCenterAllocation[] = [
        createMockCostCenterAllocation({
          costCenterId: 'CC-1',
          allocationPercentage: 110,
        }),
      ];

      const result = benefitAttributor.validateAllocations(allocations);

      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Allocation exceeds 100% for CC-1: 110%');
    });

    it('should report multiple validation issues', () => {
      const allocations: CostCenterAllocation[] = [
        createMockCostCenterAllocation({
          costCenterId: 'CC-1',
          allocationPercentage: -5,
        }),
        createMockCostCenterAllocation({
          costCenterId: 'CC-2',
          allocationPercentage: 150,
        }),
      ];

      const result = benefitAttributor.validateAllocations(allocations);

      expect(result.isValid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(1);
    });

    it('should return valid for empty allocations', () => {
      const result = benefitAttributor.validateAllocations([]);

      expect(result.isValid).toBe(true);
      expect(result.totalPercentage).toBe(0);
    });
  });

  describe('splitByPercentage', () => {
    it('should split amount by given percentages', () => {
      const splits = [
        { costCenterId: 'CC-1', percentage: 60 },
        { costCenterId: 'CC-2', percentage: 40 },
      ];

      const result = benefitAttributor.splitByPercentage('10000.0000', splits);

      expect(result.get('CC-1')).toBe('6000.0000');
      expect(result.get('CC-2')).toBe('4000.0000');
    });

    it('should handle uneven splits', () => {
      const splits = [
        { costCenterId: 'CC-1', percentage: 33.33 },
        { costCenterId: 'CC-2', percentage: 33.33 },
        { costCenterId: 'CC-3', percentage: 33.34 },
      ];

      const result = benefitAttributor.splitByPercentage('10000.0000', splits);

      expect(result.size).toBe(3);
      expect(parseFloat(result.get('CC-1')!)).toBeCloseTo(3333, 0);
      expect(parseFloat(result.get('CC-2')!)).toBeCloseTo(3333, 0);
      expect(parseFloat(result.get('CC-3')!)).toBeCloseTo(3334, 0);
    });

    it('should handle zero percentage', () => {
      const splits = [
        { costCenterId: 'CC-1', percentage: 0 },
        { costCenterId: 'CC-2', percentage: 100 },
      ];

      const result = benefitAttributor.splitByPercentage('10000.0000', splits);

      expect(result.get('CC-1')).toBe('0.0000');
      expect(result.get('CC-2')).toBe('10000.0000');
    });

    it('should handle empty splits array', () => {
      const result = benefitAttributor.splitByPercentage('10000.0000', []);

      expect(result.size).toBe(0);
    });

    it('should handle very small percentages with precision', () => {
      const splits = [
        { costCenterId: 'CC-1', percentage: 0.01 },
      ];

      const result = benefitAttributor.splitByPercentage('10000.0000', splits);

      expect(result.get('CC-1')).toBe('1.0000');
    });
  });

  describe('integration scenarios', () => {
    it('should correctly distribute benefits for a realistic multi-cost-center scenario', () => {
      const decision = createMockDecisionRecord({
        primaryCostCenterId: 'CC-ENGINEERING',
        secondaryCostCenters: [
          createMockCostCenterAllocation({
            costCenterId: 'CC-INFRASTRUCTURE',
            allocationPercentage: 25,
            allocationMethod: AllocationMethod.ACTIVITY_BASED,
          }),
          createMockCostCenterAllocation({
            costCenterId: 'CC-DEVOPS',
            allocationPercentage: 15,
            allocationMethod: AllocationMethod.STEP_DOWN,
          }),
          createMockCostCenterAllocation({
            costCenterId: 'CC-SECURITY',
            allocationPercentage: 10,
            allocationMethod: AllocationMethod.DIRECT,
          }),
        ],
      });

      const result = benefitAttributor.distributeBenefits(decision, '100000.0000');

      expect(result).toHaveLength(4);

      // Check primary allocation (50%)
      const primary = result.find(r => r.allocationType === 'PRIMARY');
      expect(primary!.costCenterId).toBe('CC-ENGINEERING');
      expect(primary!.allocationPercentage).toBe(50);
      expect(primary!.amount).toBe('50000.0000');

      // Check secondary allocations
      const infra = result.find(r => r.costCenterId === 'CC-INFRASTRUCTURE');
      expect(infra!.allocationPercentage).toBe(25);
      expect(infra!.amount).toBe('25000.0000');
      expect(infra!.allocationMethod).toBe(AllocationMethod.ACTIVITY_BASED);

      const devops = result.find(r => r.costCenterId === 'CC-DEVOPS');
      expect(devops!.allocationPercentage).toBe(15);
      expect(devops!.amount).toBe('15000.0000');

      const security = result.find(r => r.costCenterId === 'CC-SECURITY');
      expect(security!.allocationPercentage).toBe(10);
      expect(security!.amount).toBe('10000.0000');

      // Verify total
      const total = result.reduce((sum, r) => sum + parseFloat(r.amount), 0);
      expect(total).toBe(100000);
    });
  });
});
