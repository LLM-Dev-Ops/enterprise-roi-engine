/**
 * OverheadAllocator Unit Tests
 * Tests for overhead allocation logic including direct, indirect,
 * and shared services rates calculation.
 */

import {
  OverheadAllocator,
} from '../../../src/attribution/OverheadAllocator';
import { OverheadFactor } from '../../../src/contracts/costops';

// =============================================================================
// Mock Data Factories
// =============================================================================

function createMockOverheadFactor(overrides: Partial<OverheadFactor> = {}): OverheadFactor {
  return {
    costCenterId: 'CC-001',
    directRate: 1.0,
    indirectRate: 0.15,
    sharedServicesRate: 0.10,
    effectiveDate: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

// =============================================================================
// Test Suite: OverheadAllocator
// =============================================================================

describe('OverheadAllocator', () => {
  describe('constructor', () => {
    it('should initialize with overhead factors', () => {
      const factors = [
        createMockOverheadFactor({ costCenterId: 'CC-001' }),
        createMockOverheadFactor({ costCenterId: 'CC-002' }),
      ];

      const allocator = new OverheadAllocator(factors);

      expect(allocator.hasOverheadFactor('CC-001')).toBe(true);
      expect(allocator.hasOverheadFactor('CC-002')).toBe(true);
      expect(allocator.hasOverheadFactor('CC-999')).toBe(false);
    });

    it('should initialize with empty factors array', () => {
      const allocator = new OverheadAllocator([]);
      expect(allocator.hasOverheadFactor('CC-001')).toBe(false);
    });

    it('should initialize with custom rate version', () => {
      const allocator = new OverheadAllocator([], '2.0.0');
      expect(allocator.getRateVersion()).toBe('2.0.0');
    });

    it('should use default rate version when not provided', () => {
      const allocator = new OverheadAllocator([]);
      expect(allocator.getRateVersion()).toBe('1.0.0');
    });
  });

  describe('applyOverhead', () => {
    describe('direct rate calculations', () => {
      it('should calculate direct amount correctly', () => {
        const factors = [
          createMockOverheadFactor({
            costCenterId: 'CC-001',
            directRate: 1.0,
            indirectRate: 0.0,
            sharedServicesRate: 0.0,
          }),
        ];
        const allocator = new OverheadAllocator(factors);

        const result = allocator.applyOverhead('DR-001', 'CC-001', '10000.0000');

        expect(result.directAmount).toBe('10000.0000');
        expect(result.indirectOverhead).toBe('0.0000');
        expect(result.sharedServicesOverhead).toBe('0.0000');
        expect(result.totalOverhead).toBe('0.0000');
        expect(result.fullyLoadedAmount).toBe('10000.0000');
      });

      it('should apply direct rate less than 1.0', () => {
        const factors = [
          createMockOverheadFactor({
            costCenterId: 'CC-001',
            directRate: 0.9,
            indirectRate: 0.0,
            sharedServicesRate: 0.0,
          }),
        ];
        const allocator = new OverheadAllocator(factors);

        const result = allocator.applyOverhead('DR-001', 'CC-001', '10000.0000');

        expect(result.directAmount).toBe('9000.0000');
        expect(result.fullyLoadedAmount).toBe('9000.0000');
      });

      it('should apply direct rate greater than 1.0', () => {
        const factors = [
          createMockOverheadFactor({
            costCenterId: 'CC-001',
            directRate: 1.2,
            indirectRate: 0.0,
            sharedServicesRate: 0.0,
          }),
        ];
        const allocator = new OverheadAllocator(factors);

        const result = allocator.applyOverhead('DR-001', 'CC-001', '10000.0000');

        expect(result.directAmount).toBe('12000.0000');
        expect(result.fullyLoadedAmount).toBe('12000.0000');
      });
    });

    describe('indirect rate calculations', () => {
      it('should calculate indirect overhead correctly', () => {
        const factors = [
          createMockOverheadFactor({
            costCenterId: 'CC-001',
            directRate: 1.0,
            indirectRate: 0.20, // 20%
            sharedServicesRate: 0.0,
          }),
        ];
        const allocator = new OverheadAllocator(factors);

        const result = allocator.applyOverhead('DR-001', 'CC-001', '10000.0000');

        expect(result.directAmount).toBe('10000.0000');
        expect(result.indirectOverhead).toBe('2000.0000');
        expect(result.sharedServicesOverhead).toBe('0.0000');
        expect(result.totalOverhead).toBe('2000.0000');
        expect(result.fullyLoadedAmount).toBe('12000.0000');
      });

      it('should handle zero indirect rate', () => {
        const factors = [
          createMockOverheadFactor({
            costCenterId: 'CC-001',
            directRate: 1.0,
            indirectRate: 0.0,
            sharedServicesRate: 0.10,
          }),
        ];
        const allocator = new OverheadAllocator(factors);

        const result = allocator.applyOverhead('DR-001', 'CC-001', '10000.0000');

        expect(result.indirectOverhead).toBe('0.0000');
      });
    });

    describe('shared services rate calculations', () => {
      it('should calculate shared services overhead correctly', () => {
        const factors = [
          createMockOverheadFactor({
            costCenterId: 'CC-001',
            directRate: 1.0,
            indirectRate: 0.0,
            sharedServicesRate: 0.15, // 15%
          }),
        ];
        const allocator = new OverheadAllocator(factors);

        const result = allocator.applyOverhead('DR-001', 'CC-001', '10000.0000');

        expect(result.directAmount).toBe('10000.0000');
        expect(result.indirectOverhead).toBe('0.0000');
        expect(result.sharedServicesOverhead).toBe('1500.0000');
        expect(result.totalOverhead).toBe('1500.0000');
        expect(result.fullyLoadedAmount).toBe('11500.0000');
      });

      it('should handle zero shared services rate', () => {
        const factors = [
          createMockOverheadFactor({
            costCenterId: 'CC-001',
            directRate: 1.0,
            indirectRate: 0.10,
            sharedServicesRate: 0.0,
          }),
        ];
        const allocator = new OverheadAllocator(factors);

        const result = allocator.applyOverhead('DR-001', 'CC-001', '10000.0000');

        expect(result.sharedServicesOverhead).toBe('0.0000');
      });
    });

    describe('combined overhead calculations', () => {
      it('should calculate all overhead components correctly', () => {
        const factors = [
          createMockOverheadFactor({
            costCenterId: 'CC-001',
            directRate: 1.0,
            indirectRate: 0.15, // 15%
            sharedServicesRate: 0.10, // 10%
          }),
        ];
        const allocator = new OverheadAllocator(factors);

        const result = allocator.applyOverhead('DR-001', 'CC-001', '10000.0000');

        expect(result.directAmount).toBe('10000.0000');
        expect(result.indirectOverhead).toBe('1500.0000');
        expect(result.sharedServicesOverhead).toBe('1000.0000');
        expect(result.totalOverhead).toBe('2500.0000');
        expect(result.fullyLoadedAmount).toBe('12500.0000');
      });

      it('should apply all rates together with direct rate != 1.0', () => {
        const factors = [
          createMockOverheadFactor({
            costCenterId: 'CC-001',
            directRate: 0.95,
            indirectRate: 0.20,
            sharedServicesRate: 0.15,
          }),
        ];
        const allocator = new OverheadAllocator(factors);

        const result = allocator.applyOverhead('DR-001', 'CC-001', '10000.0000');

        // Direct: 10000 * 0.95 = 9500
        expect(result.directAmount).toBe('9500.0000');
        // Indirect: 10000 * 0.20 = 2000
        expect(result.indirectOverhead).toBe('2000.0000');
        // Shared: 10000 * 0.15 = 1500
        expect(result.sharedServicesOverhead).toBe('1500.0000');
        // Total overhead: 2000 + 1500 = 3500
        expect(result.totalOverhead).toBe('3500.0000');
        // Fully loaded: 9500 + 3500 = 13000
        expect(result.fullyLoadedAmount).toBe('13000.0000');
      });
    });

    describe('edge cases', () => {
      it('should handle zero base amount', () => {
        const factors = [
          createMockOverheadFactor({
            costCenterId: 'CC-001',
            directRate: 1.0,
            indirectRate: 0.15,
            sharedServicesRate: 0.10,
          }),
        ];
        const allocator = new OverheadAllocator(factors);

        const result = allocator.applyOverhead('DR-001', 'CC-001', '0.0000');

        expect(result.directAmount).toBe('0.0000');
        expect(result.indirectOverhead).toBe('0.0000');
        expect(result.sharedServicesOverhead).toBe('0.0000');
        expect(result.totalOverhead).toBe('0.0000');
        expect(result.fullyLoadedAmount).toBe('0.0000');
      });

      it('should handle negative base amount', () => {
        const factors = [
          createMockOverheadFactor({
            costCenterId: 'CC-001',
            directRate: 1.0,
            indirectRate: 0.10,
            sharedServicesRate: 0.05,
          }),
        ];
        const allocator = new OverheadAllocator(factors);

        const result = allocator.applyOverhead('DR-001', 'CC-001', '-5000.0000');

        expect(result.directAmount).toBe('-5000.0000');
        expect(result.indirectOverhead).toBe('-500.0000');
        expect(result.sharedServicesOverhead).toBe('-250.0000');
        expect(result.totalOverhead).toBe('-750.0000');
        expect(result.fullyLoadedAmount).toBe('-5750.0000');
      });

      it('should handle large amounts with precision', () => {
        const factors = [
          createMockOverheadFactor({
            costCenterId: 'CC-001',
            directRate: 1.0,
            indirectRate: 0.12345,
            sharedServicesRate: 0.06789,
          }),
        ];
        const allocator = new OverheadAllocator(factors);

        const result = allocator.applyOverhead('DR-001', 'CC-001', '999999999.9999');

        // Verify amounts are calculated with precision
        expect(parseFloat(result.fullyLoadedAmount)).toBeGreaterThan(999999999.9999);
      });

      it('should use default overhead factor for unknown cost center', () => {
        const factors = [
          createMockOverheadFactor({
            costCenterId: 'CC-001',
            indirectRate: 0.50,
          }),
        ];
        const allocator = new OverheadAllocator(factors);

        // Use a cost center not in the factors list
        const result = allocator.applyOverhead('DR-001', 'CC-UNKNOWN', '10000.0000');

        // Should use default: directRate=1.0, indirectRate=0.0, sharedServicesRate=0.0
        expect(result.directAmount).toBe('10000.0000');
        expect(result.indirectOverhead).toBe('0.0000');
        expect(result.sharedServicesOverhead).toBe('0.0000');
        expect(result.fullyLoadedAmount).toBe('10000.0000');
      });
    });

    describe('result metadata', () => {
      it('should include correct decision record ID', () => {
        const allocator = new OverheadAllocator([createMockOverheadFactor()]);

        const result = allocator.applyOverhead('DR-12345', 'CC-001', '10000.0000');

        expect(result.decisionRecordId).toBe('DR-12345');
      });

      it('should include correct cost center ID', () => {
        const allocator = new OverheadAllocator([createMockOverheadFactor()]);

        const result = allocator.applyOverhead('DR-001', 'CC-001', '10000.0000');

        expect(result.costCenterId).toBe('CC-001');
      });

      it('should include overhead rate version', () => {
        const allocator = new OverheadAllocator([createMockOverheadFactor()], '3.2.1');

        const result = allocator.applyOverhead('DR-001', 'CC-001', '10000.0000');

        expect(result.overheadRateVersion).toBe('3.2.1');
      });
    });
  });

  describe('calculateOverheadBreakdown', () => {
    it('should return OverheadBreakdown with Decimal types', () => {
      const factors = [
        createMockOverheadFactor({
          costCenterId: 'CC-001',
          directRate: 1.0,
          indirectRate: 0.20,
          sharedServicesRate: 0.10,
        }),
      ];
      const allocator = new OverheadAllocator(factors);

      const breakdown = allocator.calculateOverheadBreakdown('CC-001', '10000.0000');

      expect(breakdown.directAmount.toNumber()).toBe(10000);
      expect(breakdown.indirectOverhead.toNumber()).toBe(2000);
      expect(breakdown.sharedServicesOverhead.toNumber()).toBe(1000);
      expect(breakdown.totalOverhead.toNumber()).toBe(3000);
      expect(breakdown.fullyLoadedAmount.toNumber()).toBe(13000);
    });

    it('should handle fractional rates precisely', () => {
      const factors = [
        createMockOverheadFactor({
          costCenterId: 'CC-001',
          directRate: 1.0,
          indirectRate: 0.333,
          sharedServicesRate: 0.167,
        }),
      ];
      const allocator = new OverheadAllocator(factors);

      const breakdown = allocator.calculateOverheadBreakdown('CC-001', '1000.0000');

      expect(breakdown.indirectOverhead.toNumber()).toBeCloseTo(333, 2);
      expect(breakdown.sharedServicesOverhead.toNumber()).toBeCloseTo(167, 2);
    });
  });

  describe('getOverheadFactor', () => {
    it('should return correct factor for existing cost center', () => {
      const factors = [
        createMockOverheadFactor({
          costCenterId: 'CC-SPECIAL',
          directRate: 0.85,
          indirectRate: 0.25,
          sharedServicesRate: 0.20,
        }),
      ];
      const allocator = new OverheadAllocator(factors);

      const factor = allocator.getOverheadFactor('CC-SPECIAL');

      expect(factor.costCenterId).toBe('CC-SPECIAL');
      expect(factor.directRate).toBe(0.85);
      expect(factor.indirectRate).toBe(0.25);
      expect(factor.sharedServicesRate).toBe(0.20);
    });

    it('should return default factor for non-existing cost center', () => {
      const allocator = new OverheadAllocator([]);

      const factor = allocator.getOverheadFactor('CC-NONEXISTENT');

      expect(factor.costCenterId).toBe('DEFAULT');
      expect(factor.directRate).toBe(1.0);
      expect(factor.indirectRate).toBe(0.0);
      expect(factor.sharedServicesRate).toBe(0.0);
    });
  });

  describe('hasOverheadFactor', () => {
    it('should return true for existing cost center', () => {
      const factors = [createMockOverheadFactor({ costCenterId: 'CC-EXISTS' })];
      const allocator = new OverheadAllocator(factors);

      expect(allocator.hasOverheadFactor('CC-EXISTS')).toBe(true);
    });

    it('should return false for non-existing cost center', () => {
      const factors = [createMockOverheadFactor({ costCenterId: 'CC-001' })];
      const allocator = new OverheadAllocator(factors);

      expect(allocator.hasOverheadFactor('CC-NONEXISTENT')).toBe(false);
    });
  });

  describe('getTotalOverheadRate', () => {
    it('should return sum of indirect and shared services rates', () => {
      const factors = [
        createMockOverheadFactor({
          costCenterId: 'CC-001',
          directRate: 1.0,
          indirectRate: 0.15,
          sharedServicesRate: 0.10,
        }),
      ];
      const allocator = new OverheadAllocator(factors);

      const totalRate = allocator.getTotalOverheadRate('CC-001');

      expect(totalRate).toBe(0.25); // 0.15 + 0.10
    });

    it('should return 0 for default factor with no overhead', () => {
      const allocator = new OverheadAllocator([]);

      const totalRate = allocator.getTotalOverheadRate('CC-NONEXISTENT');

      expect(totalRate).toBe(0);
    });

    it('should handle fractional rates', () => {
      const factors = [
        createMockOverheadFactor({
          costCenterId: 'CC-001',
          indirectRate: 0.123,
          sharedServicesRate: 0.456,
        }),
      ];
      const allocator = new OverheadAllocator(factors);

      const totalRate = allocator.getTotalOverheadRate('CC-001');

      expect(totalRate).toBeCloseTo(0.579, 10);
    });
  });

  describe('getFullyLoadedMultiplier', () => {
    it('should return sum of all three rates', () => {
      const factors = [
        createMockOverheadFactor({
          costCenterId: 'CC-001',
          directRate: 1.0,
          indirectRate: 0.15,
          sharedServicesRate: 0.10,
        }),
      ];
      const allocator = new OverheadAllocator(factors);

      const multiplier = allocator.getFullyLoadedMultiplier('CC-001');

      expect(multiplier).toBe(1.25); // 1.0 + 0.15 + 0.10
    });

    it('should return 1.0 for default factor', () => {
      const allocator = new OverheadAllocator([]);

      const multiplier = allocator.getFullyLoadedMultiplier('CC-NONEXISTENT');

      expect(multiplier).toBe(1.0); // 1.0 + 0 + 0
    });

    it('should handle direct rate != 1.0', () => {
      const factors = [
        createMockOverheadFactor({
          costCenterId: 'CC-001',
          directRate: 0.90,
          indirectRate: 0.20,
          sharedServicesRate: 0.15,
        }),
      ];
      const allocator = new OverheadAllocator(factors);

      const multiplier = allocator.getFullyLoadedMultiplier('CC-001');

      expect(multiplier).toBe(1.25); // 0.90 + 0.20 + 0.15
    });
  });

  describe('aggregateOverhead', () => {
    it('should aggregate overhead across multiple cost centers', () => {
      const factors = [
        createMockOverheadFactor({
          costCenterId: 'CC-001',
          directRate: 1.0,
          indirectRate: 0.10,
          sharedServicesRate: 0.05,
        }),
        createMockOverheadFactor({
          costCenterId: 'CC-002',
          directRate: 1.0,
          indirectRate: 0.20,
          sharedServicesRate: 0.10,
        }),
      ];
      const allocator = new OverheadAllocator(factors);

      const allocations = [
        { costCenterId: 'CC-001', amount: '5000.0000' },
        { costCenterId: 'CC-002', amount: '5000.0000' },
      ];

      const aggregate = allocator.aggregateOverhead(allocations);

      // CC-001: direct=5000, indirect=500, shared=250, loaded=5750
      // CC-002: direct=5000, indirect=1000, shared=500, loaded=6500
      // Total: direct=10000, indirect=1500, shared=750, total=2250, loaded=12250
      expect(aggregate.directAmount.toNumber()).toBe(10000);
      expect(aggregate.indirectOverhead.toNumber()).toBe(1500);
      expect(aggregate.sharedServicesOverhead.toNumber()).toBe(750);
      expect(aggregate.totalOverhead.toNumber()).toBe(2250);
      expect(aggregate.fullyLoadedAmount.toNumber()).toBe(12250);
    });

    it('should handle empty allocations', () => {
      const allocator = new OverheadAllocator([]);

      const aggregate = allocator.aggregateOverhead([]);

      expect(aggregate.directAmount.toNumber()).toBe(0);
      expect(aggregate.indirectOverhead.toNumber()).toBe(0);
      expect(aggregate.sharedServicesOverhead.toNumber()).toBe(0);
      expect(aggregate.totalOverhead.toNumber()).toBe(0);
      expect(aggregate.fullyLoadedAmount.toNumber()).toBe(0);
    });

    it('should handle single allocation', () => {
      const factors = [
        createMockOverheadFactor({
          costCenterId: 'CC-SINGLE',
          directRate: 1.0,
          indirectRate: 0.25,
          sharedServicesRate: 0.15,
        }),
      ];
      const allocator = new OverheadAllocator(factors);

      const allocations = [{ costCenterId: 'CC-SINGLE', amount: '10000.0000' }];

      const aggregate = allocator.aggregateOverhead(allocations);

      expect(aggregate.directAmount.toNumber()).toBe(10000);
      expect(aggregate.indirectOverhead.toNumber()).toBe(2500);
      expect(aggregate.sharedServicesOverhead.toNumber()).toBe(1500);
      expect(aggregate.totalOverhead.toNumber()).toBe(4000);
      expect(aggregate.fullyLoadedAmount.toNumber()).toBe(14000);
    });

    it('should use default factor for unknown cost centers', () => {
      const allocator = new OverheadAllocator([]);

      const allocations = [
        { costCenterId: 'CC-UNKNOWN-1', amount: '5000.0000' },
        { costCenterId: 'CC-UNKNOWN-2', amount: '5000.0000' },
      ];

      const aggregate = allocator.aggregateOverhead(allocations);

      // Default has no overhead, so fully loaded = direct = base
      expect(aggregate.directAmount.toNumber()).toBe(10000);
      expect(aggregate.totalOverhead.toNumber()).toBe(0);
      expect(aggregate.fullyLoadedAmount.toNumber()).toBe(10000);
    });

    it('should handle mixed known and unknown cost centers', () => {
      const factors = [
        createMockOverheadFactor({
          costCenterId: 'CC-KNOWN',
          directRate: 1.0,
          indirectRate: 0.20,
          sharedServicesRate: 0.10,
        }),
      ];
      const allocator = new OverheadAllocator(factors);

      const allocations = [
        { costCenterId: 'CC-KNOWN', amount: '5000.0000' },
        { costCenterId: 'CC-UNKNOWN', amount: '5000.0000' },
      ];

      const aggregate = allocator.aggregateOverhead(allocations);

      // CC-KNOWN: direct=5000, indirect=1000, shared=500, loaded=6500
      // CC-UNKNOWN (default): direct=5000, indirect=0, shared=0, loaded=5000
      expect(aggregate.directAmount.toNumber()).toBe(10000);
      expect(aggregate.indirectOverhead.toNumber()).toBe(1000);
      expect(aggregate.sharedServicesOverhead.toNumber()).toBe(500);
      expect(aggregate.fullyLoadedAmount.toNumber()).toBe(11500);
    });
  });

  describe('getRateVersion', () => {
    it('should return the configured rate version', () => {
      const allocator = new OverheadAllocator([], 'v2024.01.15');
      expect(allocator.getRateVersion()).toBe('v2024.01.15');
    });
  });

  describe('integration scenarios', () => {
    it('should correctly calculate overhead for a realistic department structure', () => {
      const factors = [
        createMockOverheadFactor({
          costCenterId: 'CC-ENGINEERING',
          directRate: 1.0,
          indirectRate: 0.18,
          sharedServicesRate: 0.12,
        }),
        createMockOverheadFactor({
          costCenterId: 'CC-SALES',
          directRate: 1.0,
          indirectRate: 0.15,
          sharedServicesRate: 0.10,
        }),
        createMockOverheadFactor({
          costCenterId: 'CC-INFRASTRUCTURE',
          directRate: 0.95, // 5% efficiency discount
          indirectRate: 0.25,
          sharedServicesRate: 0.15,
        }),
        createMockOverheadFactor({
          costCenterId: 'CC-CORPORATE',
          directRate: 1.0,
          indirectRate: 0.30,
          sharedServicesRate: 0.20,
        }),
      ];

      const allocator = new OverheadAllocator(factors, 'FY2024-Q1');

      // Test Engineering overhead
      const engResult = allocator.applyOverhead('DR-ENG', 'CC-ENGINEERING', '50000.0000');
      expect(engResult.directAmount).toBe('50000.0000');
      expect(engResult.indirectOverhead).toBe('9000.0000'); // 50000 * 0.18
      expect(engResult.sharedServicesOverhead).toBe('6000.0000'); // 50000 * 0.12
      expect(engResult.fullyLoadedAmount).toBe('65000.0000');

      // Test Infrastructure with efficiency discount
      const infraResult = allocator.applyOverhead('DR-INFRA', 'CC-INFRASTRUCTURE', '30000.0000');
      expect(infraResult.directAmount).toBe('28500.0000'); // 30000 * 0.95
      expect(infraResult.indirectOverhead).toBe('7500.0000'); // 30000 * 0.25
      expect(infraResult.sharedServicesOverhead).toBe('4500.0000'); // 30000 * 0.15
      expect(infraResult.fullyLoadedAmount).toBe('40500.0000');

      // Verify rate version is tracked
      expect(engResult.overheadRateVersion).toBe('FY2024-Q1');
      expect(infraResult.overheadRateVersion).toBe('FY2024-Q1');

      // Aggregate all departments
      const allocations = [
        { costCenterId: 'CC-ENGINEERING', amount: '50000.0000' },
        { costCenterId: 'CC-SALES', amount: '40000.0000' },
        { costCenterId: 'CC-INFRASTRUCTURE', amount: '30000.0000' },
        { costCenterId: 'CC-CORPORATE', amount: '20000.0000' },
      ];

      const totalAggregate = allocator.aggregateOverhead(allocations);

      // Verify totals make sense
      expect(totalAggregate.directAmount.toNumber()).toBeLessThan(140000); // Some efficiency discount
      expect(totalAggregate.totalOverhead.toNumber()).toBeGreaterThan(0);
      expect(totalAggregate.fullyLoadedAmount.toNumber()).toBeGreaterThan(
        totalAggregate.directAmount.toNumber()
      );
    });
  });
});
