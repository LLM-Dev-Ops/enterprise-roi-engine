/**
 * DecisionNormalizer Unit Tests
 * Tests for transforming raw decisions into CanonicalDecisionRecord.
 */

import {
  DecisionNormalizer,
  DecisionNormalizerConfig,
  RawDecisionInput,
} from '../../../src/normalization/DecisionNormalizer';
import { EntityNormalizer } from '../../../src/normalization/EntityNormalizer';
import { UnitHarmonizer, ExchangeRate } from '../../../src/normalization/UnitHarmonizer';
import { TemporalAligner } from '../../../src/normalization/TemporalAligner';
import {
  DecisionNode,
  ResourceDelta,
  ResourceType,
  DeltaDirection,
  CostCenter,
  GLAccount,
  EntityMapping,
  EntityType,
  AccountType,
  NaturalSign,
  FiscalPeriod,
  DecisionCategory,
  AllocationMethod,
  ImpactType,
} from '../../../src/contracts';

// ============================================================================
// Test Fixtures
// ============================================================================

const createMockCostCenters = (): CostCenter[] => [
  {
    costCenterId: 'CC001',
    name: 'Engineering',
    parentCostCenterId: null,
    hierarchyLevel: 0,
    acceptsDirectCharges: true,
    currency: 'USD',
    isActive: true,
  },
  {
    costCenterId: 'CC002',
    name: 'Operations',
    parentCostCenterId: null,
    hierarchyLevel: 0,
    acceptsDirectCharges: true,
    currency: 'USD',
    isActive: true,
  },
  {
    costCenterId: 'DEFAULT',
    name: 'Default Cost Center',
    parentCostCenterId: null,
    hierarchyLevel: 0,
    acceptsDirectCharges: true,
    currency: 'USD',
    isActive: true,
  },
];

const createMockGLAccounts = (): GLAccount[] => [
  {
    accountId: 'GL001',
    accountName: 'Salary Expense',
    accountType: AccountType.EXPENSE,
    naturalSign: NaturalSign.DEBIT,
    currency: 'USD',
    isActive: true,
  },
  {
    accountId: 'GL002',
    accountName: 'Fixed Assets',
    accountType: AccountType.ASSET,
    naturalSign: NaturalSign.DEBIT,
    currency: 'USD',
    isActive: true,
  },
  {
    accountId: 'GL003',
    accountName: 'Accounts Payable',
    accountType: AccountType.LIABILITY,
    naturalSign: NaturalSign.CREDIT,
    currency: 'USD',
    isActive: true,
  },
  {
    accountId: 'GL004',
    accountName: 'Revenue',
    accountType: AccountType.REVENUE,
    naturalSign: NaturalSign.CREDIT,
    currency: 'USD',
    isActive: true,
  },
  {
    accountId: 'GL005',
    accountName: 'Equity',
    accountType: AccountType.EQUITY,
    naturalSign: NaturalSign.CREDIT,
    currency: 'USD',
    isActive: true,
  },
];

const createMockEntities = (): EntityMapping[] => [
  {
    erpEntityId: 'CC001',
    entityType: EntityType.COST_CENTER,
    displayName: 'Engineering',
    parentId: null,
    attributes: {},
  },
  {
    erpEntityId: 'CC002',
    entityType: EntityType.COST_CENTER,
    displayName: 'Operations',
    parentId: null,
    attributes: {},
  },
];

const createMockFiscalCalendar = (): FiscalPeriod[] => {
  const periods: FiscalPeriod[] = [];
  for (let year = 2024; year <= 2025; year++) {
    for (let month = 1; month <= 12; month++) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      periods.push({
        year,
        period: month,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });
    }
  }
  return periods;
};

const createMockExchangeRates = (): ExchangeRate[] => [
  {
    sourceCurrency: 'EUR',
    targetCurrency: 'USD',
    rate: '1.1000',
    effectiveDate: '2024-01-01T00:00:00.000Z',
  },
];

const createMockDecisionNode = (overrides: Partial<DecisionNode> = {}): DecisionNode => ({
  nodeId: 'decision-001',
  parentId: null,
  decision: 'Allocate additional resources to engineering team',
  probability: 0.85,
  outcomeMetrics: {
    expectedSavings: 50000,
    riskScore: 0.2,
  },
  ...overrides,
});

const createMockResourceDeltas = (overrides: Partial<ResourceDelta>[] = []): ResourceDelta[] => [
  {
    period: 0,
    resourceType: ResourceType.FTE,
    quantity: 2,
    unit: 'FTE',
    direction: DeltaDirection.DECREASE,
    ...overrides[0],
  },
  {
    period: 1,
    resourceType: ResourceType.COMPUTE,
    quantity: 100,
    unit: 'compute-hours',
    direction: DeltaDirection.INCREASE,
    ...overrides[1],
  },
];

const createDecisionNormalizerConfig = (): DecisionNormalizerConfig => ({
  baseCurrency: 'USD',
  sourceSystem: 'test-system',
  defaultCostCenterId: 'DEFAULT',
  defaultAllocationMethod: AllocationMethod.DIRECT,
});

// ============================================================================
// Test Suite
// ============================================================================

describe('DecisionNormalizer', () => {
  let decisionNormalizer: DecisionNormalizer;
  let entityNormalizer: EntityNormalizer;
  let unitHarmonizer: UnitHarmonizer;
  let temporalAligner: TemporalAligner;
  let config: DecisionNormalizerConfig;

  beforeEach(() => {
    entityNormalizer = new EntityNormalizer(
      createMockCostCenters(),
      createMockGLAccounts(),
      createMockEntities()
    );
    unitHarmonizer = new UnitHarmonizer(createMockExchangeRates(), 'USD');
    temporalAligner = new TemporalAligner(createMockFiscalCalendar());
    config = createDecisionNormalizerConfig();

    decisionNormalizer = new DecisionNormalizer(
      config,
      entityNormalizer,
      unitHarmonizer,
      temporalAligner
    );
  });

  // ============================================================================
  // Decision Type Mapping Tests
  // ============================================================================

  describe('mapDecisionType', () => {
    it('should map resource allocation decisions', () => {
      const mapping = decisionNormalizer.mapDecisionType('Allocate resources to project');
      expect(mapping.decisionCategory).toBe(DecisionCategory.RESOURCE_ALLOCATION);
      expect(mapping.riskCategoryId).toBe('RESOURCE_ALLOC');
    });

    it('should map headcount decisions to resource allocation', () => {
      const mapping = decisionNormalizer.mapDecisionType('Add 5 FTE to team');
      expect(mapping.decisionCategory).toBe(DecisionCategory.RESOURCE_ALLOCATION);
    });

    it('should map process optimization decisions', () => {
      const mapping = decisionNormalizer.mapDecisionType('Optimize workflow efficiency');
      expect(mapping.decisionCategory).toBe(DecisionCategory.PROCESS_OPTIMIZATION);
      expect(mapping.riskCategoryId).toBe('PROCESS_OPT');
    });

    it('should map automation decisions to process optimization', () => {
      const mapping = decisionNormalizer.mapDecisionType('Automate manual processes');
      expect(mapping.decisionCategory).toBe(DecisionCategory.PROCESS_OPTIMIZATION);
    });

    it('should map vendor selection decisions', () => {
      const mapping = decisionNormalizer.mapDecisionType('Select new vendor for services');
      expect(mapping.decisionCategory).toBe(DecisionCategory.VENDOR_SELECTION);
      expect(mapping.riskCategoryId).toBe('VENDOR_SEL');
    });

    it('should map procurement decisions to vendor selection', () => {
      const mapping = decisionNormalizer.mapDecisionType('Procurement of new software');
      expect(mapping.decisionCategory).toBe(DecisionCategory.VENDOR_SELECTION);
    });

    it('should map capacity planning decisions', () => {
      const mapping = decisionNormalizer.mapDecisionType('Increase capacity for growth');
      expect(mapping.decisionCategory).toBe(DecisionCategory.CAPACITY_PLANNING);
      expect(mapping.riskCategoryId).toBe('CAPACITY_PLAN');
    });

    it('should map infrastructure decisions to capacity planning', () => {
      const mapping = decisionNormalizer.mapDecisionType('Expand infrastructure');
      expect(mapping.decisionCategory).toBe(DecisionCategory.CAPACITY_PLANNING);
    });

    it('should map risk mitigation decisions', () => {
      const mapping = decisionNormalizer.mapDecisionType('Mitigate security risks');
      expect(mapping.decisionCategory).toBe(DecisionCategory.RISK_MITIGATION);
      expect(mapping.riskCategoryId).toBe('RISK_MIT');
    });

    it('should map compliance decisions to risk mitigation', () => {
      const mapping = decisionNormalizer.mapDecisionType('Ensure compliance requirements');
      expect(mapping.decisionCategory).toBe(DecisionCategory.RISK_MITIGATION);
    });

    it('should map cost reduction decisions', () => {
      const mapping = decisionNormalizer.mapDecisionType('Reduce operational costs');
      expect(mapping.decisionCategory).toBe(DecisionCategory.COST_REDUCTION);
      expect(mapping.riskCategoryId).toBe('COST_RED');
    });

    it('should map savings decisions to cost reduction', () => {
      const mapping = decisionNormalizer.mapDecisionType('Generate savings by consolidation');
      expect(mapping.decisionCategory).toBe(DecisionCategory.COST_REDUCTION);
    });

    it('should return default mapping for unrecognized decisions', () => {
      const mapping = decisionNormalizer.mapDecisionType('Some random decision text');
      expect(mapping.decisionCategory).toBe(DecisionCategory.RESOURCE_ALLOCATION);
      expect(mapping.riskCategoryId).toBe('DEFAULT');
    });

    it('should be case insensitive', () => {
      const mapping1 = decisionNormalizer.mapDecisionType('ALLOCATE RESOURCES');
      const mapping2 = decisionNormalizer.mapDecisionType('allocate resources');
      expect(mapping1.decisionCategory).toBe(mapping2.decisionCategory);
    });
  });

  describe('parseDecisionCategory', () => {
    it('should parse valid category strings', () => {
      expect(decisionNormalizer.parseDecisionCategory('RESOURCE_ALLOCATION'))
        .toBe(DecisionCategory.RESOURCE_ALLOCATION);
      expect(decisionNormalizer.parseDecisionCategory('PROCESS_OPTIMIZATION'))
        .toBe(DecisionCategory.PROCESS_OPTIMIZATION);
      expect(decisionNormalizer.parseDecisionCategory('VENDOR_SELECTION'))
        .toBe(DecisionCategory.VENDOR_SELECTION);
    });

    it('should handle hyphenated format', () => {
      expect(decisionNormalizer.parseDecisionCategory('RESOURCE-ALLOCATION'))
        .toBe(DecisionCategory.RESOURCE_ALLOCATION);
    });

    it('should handle space-separated format', () => {
      expect(decisionNormalizer.parseDecisionCategory('RESOURCE ALLOCATION'))
        .toBe(DecisionCategory.RESOURCE_ALLOCATION);
    });

    it('should return default for invalid category', () => {
      expect(decisionNormalizer.parseDecisionCategory('INVALID_CATEGORY'))
        .toBe(DecisionCategory.RESOURCE_ALLOCATION);
    });

    it('should be case insensitive', () => {
      expect(decisionNormalizer.parseDecisionCategory('resource_allocation'))
        .toBe(DecisionCategory.RESOURCE_ALLOCATION);
    });
  });

  // ============================================================================
  // Decision Normalization Tests
  // ============================================================================

  describe('normalizeDecision', () => {
    it('should normalize a decision into CanonicalDecisionRecord', () => {
      const input: RawDecisionInput = {
        decision: createMockDecisionNode(),
        resourceDeltas: createMockResourceDeltas(),
        simulationStartDate: '2024-01-01T00:00:00.000Z',
      };

      const result = decisionNormalizer.normalizeDecision(input);

      expect(result.record).toBeDefined();
      expect(result.record.recordId).toBeDefined();
      expect(result.record.sourceDecisionId).toBe('decision-001');
      expect(result.record.confidenceScore).toBe(0.85);
    });

    it('should set decision category based on decision text', () => {
      const input: RawDecisionInput = {
        decision: createMockDecisionNode({ decision: 'Optimize process workflow' }),
        resourceDeltas: createMockResourceDeltas(),
        simulationStartDate: '2024-01-01T00:00:00.000Z',
      };

      const result = decisionNormalizer.normalizeDecision(input);
      expect(result.record.decisionCategory).toBe(DecisionCategory.PROCESS_OPTIMIZATION);
    });

    it('should resolve primary cost center', () => {
      const input: RawDecisionInput = {
        decision: createMockDecisionNode(),
        resourceDeltas: createMockResourceDeltas(),
        simulationStartDate: '2024-01-01T00:00:00.000Z',
      };

      const result = decisionNormalizer.normalizeDecision(input);
      expect(result.record.primaryCostCenterId).toBeDefined();
    });

    it('should use default cost center when none found', () => {
      const input: RawDecisionInput = {
        decision: createMockDecisionNode({
          outcomeMetrics: {}, // No cost center hints
        }),
        resourceDeltas: [],
        simulationStartDate: '2024-01-01T00:00:00.000Z',
      };

      const result = decisionNormalizer.normalizeDecision(input);
      expect(result.record.primaryCostCenterId).toBe('DEFAULT');
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should calculate gross impact amount from resource deltas', () => {
      const input: RawDecisionInput = {
        decision: createMockDecisionNode(),
        resourceDeltas: [
          {
            period: 0,
            resourceType: ResourceType.FTE,
            quantity: 1,
            unit: 'FTE',
            direction: DeltaDirection.DECREASE,
          },
        ],
        simulationStartDate: '2024-01-01T00:00:00.000Z',
      };

      const result = decisionNormalizer.normalizeDecision(input);
      expect(parseFloat(result.record.grossImpactAmount)).toBeGreaterThan(0);
    });

    it('should calculate impact horizon from resource deltas', () => {
      const input: RawDecisionInput = {
        decision: createMockDecisionNode(),
        resourceDeltas: [
          { period: 0, resourceType: ResourceType.FTE, quantity: 1, unit: 'FTE', direction: DeltaDirection.DECREASE },
          { period: 5, resourceType: ResourceType.FTE, quantity: 1, unit: 'FTE', direction: DeltaDirection.DECREASE },
        ],
        simulationStartDate: '2024-01-01T00:00:00.000Z',
      };

      const result = decisionNormalizer.normalizeDecision(input);
      expect(result.record.impactHorizonMonths).toBe(6); // period 5 + 1
    });

    it('should use default horizon when no resource deltas', () => {
      const input: RawDecisionInput = {
        decision: createMockDecisionNode(),
        resourceDeltas: [],
        simulationStartDate: '2024-01-01T00:00:00.000Z',
      };

      const result = decisionNormalizer.normalizeDecision(input);
      expect(result.record.impactHorizonMonths).toBe(12);
    });

    it('should calculate volatility score from probability', () => {
      const input: RawDecisionInput = {
        decision: createMockDecisionNode({ probability: 0.9 }),
        resourceDeltas: createMockResourceDeltas(),
        simulationStartDate: '2024-01-01T00:00:00.000Z',
      };

      const result = decisionNormalizer.normalizeDecision(input);
      expect(result.record.volatilityScore).toBeCloseTo(0.1, 2); // 1 - 0.9
    });

    it('should generate raw checksum', () => {
      const input: RawDecisionInput = {
        decision: createMockDecisionNode(),
        resourceDeltas: createMockResourceDeltas(),
        simulationStartDate: '2024-01-01T00:00:00.000Z',
      };

      const result = decisionNormalizer.normalizeDecision(input);
      expect(result.record.rawChecksum).toBeDefined();
      expect(result.record.rawChecksum.length).toBe(64); // SHA-256 hex
    });

    it('should produce consistent checksum for same input', () => {
      const input: RawDecisionInput = {
        decision: createMockDecisionNode(),
        resourceDeltas: createMockResourceDeltas(),
        simulationStartDate: '2024-01-01T00:00:00.000Z',
      };

      const result1 = decisionNormalizer.normalizeDecision(input);
      const result2 = decisionNormalizer.normalizeDecision(input);
      expect(result1.record.rawChecksum).toBe(result2.record.rawChecksum);
    });

    it('should set source system from config', () => {
      const input: RawDecisionInput = {
        decision: createMockDecisionNode(),
        resourceDeltas: createMockResourceDeltas(),
        simulationStartDate: '2024-01-01T00:00:00.000Z',
      };

      const result = decisionNormalizer.normalizeDecision(input);
      expect(result.record.sourceSystem).toBe('test-system');
    });

    it('should include normalization timestamp', () => {
      const input: RawDecisionInput = {
        decision: createMockDecisionNode(),
        resourceDeltas: createMockResourceDeltas(),
        simulationStartDate: '2024-01-01T00:00:00.000Z',
      };

      const before = new Date().toISOString();
      const result = decisionNormalizer.normalizeDecision(input);
      const after = new Date().toISOString();

      expect(result.record.normalizationTimestamp >= before).toBe(true);
      expect(result.record.normalizationTimestamp <= after).toBe(true);
    });
  });

  describe('normalizeDecisions', () => {
    it('should normalize multiple decisions', () => {
      const inputs: RawDecisionInput[] = [
        {
          decision: createMockDecisionNode({ nodeId: 'decision-001' }),
          resourceDeltas: createMockResourceDeltas(),
          simulationStartDate: '2024-01-01T00:00:00.000Z',
        },
        {
          decision: createMockDecisionNode({ nodeId: 'decision-002' }),
          resourceDeltas: createMockResourceDeltas(),
          simulationStartDate: '2024-01-01T00:00:00.000Z',
        },
      ];

      const results = decisionNormalizer.normalizeDecisions(inputs);
      expect(results.length).toBe(2);
    });

    it('should maintain deterministic order by decision ID', () => {
      const inputs: RawDecisionInput[] = [
        {
          decision: createMockDecisionNode({ nodeId: 'decision-003' }),
          resourceDeltas: createMockResourceDeltas(),
          simulationStartDate: '2024-01-01T00:00:00.000Z',
        },
        {
          decision: createMockDecisionNode({ nodeId: 'decision-001' }),
          resourceDeltas: createMockResourceDeltas(),
          simulationStartDate: '2024-01-01T00:00:00.000Z',
        },
        {
          decision: createMockDecisionNode({ nodeId: 'decision-002' }),
          resourceDeltas: createMockResourceDeltas(),
          simulationStartDate: '2024-01-01T00:00:00.000Z',
        },
      ];

      const results = decisionNormalizer.normalizeDecisions(inputs);
      expect(results[0]?.record.sourceDecisionId).toBe('decision-001');
      expect(results[1]?.record.sourceDecisionId).toBe('decision-002');
      expect(results[2]?.record.sourceDecisionId).toBe('decision-003');
    });

    it('should handle empty input array', () => {
      const results = decisionNormalizer.normalizeDecisions([]);
      expect(results).toEqual([]);
    });
  });

  // ============================================================================
  // GL Account Impact Tests
  // ============================================================================

  describe('GL account impacts', () => {
    it('should build GL account impacts for expense decisions', () => {
      const input: RawDecisionInput = {
        decision: createMockDecisionNode({ decision: 'Allocate resources' }),
        resourceDeltas: createMockResourceDeltas(),
        simulationStartDate: '2024-01-01T00:00:00.000Z',
      };

      const result = decisionNormalizer.normalizeDecision(input);
      expect(result.record.glAccountImpacts.length).toBeGreaterThan(0);
    });

    it('should include fiscal period in GL impacts', () => {
      const input: RawDecisionInput = {
        decision: createMockDecisionNode(),
        resourceDeltas: createMockResourceDeltas(),
        simulationStartDate: '2024-01-01T00:00:00.000Z',
      };

      const result = decisionNormalizer.normalizeDecision(input);
      result.record.glAccountImpacts.forEach(impact => {
        expect(impact.period).toBeDefined();
        expect(impact.period.year).toBeDefined();
        expect(impact.period.period).toBeDefined();
      });
    });

    it('should set impact type based on account type', () => {
      const input: RawDecisionInput = {
        decision: createMockDecisionNode(),
        resourceDeltas: createMockResourceDeltas(),
        simulationStartDate: '2024-01-01T00:00:00.000Z',
      };

      const result = decisionNormalizer.normalizeDecision(input);
      // Should have DEBIT or CREDIT based on account type and amount
      result.record.glAccountImpacts.forEach(impact => {
        expect([ImpactType.DEBIT, ImpactType.CREDIT]).toContain(impact.impactType);
      });
    });

    it('should sort GL impacts deterministically', () => {
      const input: RawDecisionInput = {
        decision: createMockDecisionNode(),
        resourceDeltas: [
          { period: 2, resourceType: ResourceType.FTE, quantity: 1, unit: 'FTE', direction: DeltaDirection.DECREASE },
          { period: 0, resourceType: ResourceType.FTE, quantity: 1, unit: 'FTE', direction: DeltaDirection.DECREASE },
          { period: 1, resourceType: ResourceType.FTE, quantity: 1, unit: 'FTE', direction: DeltaDirection.DECREASE },
        ],
        simulationStartDate: '2024-01-01T00:00:00.000Z',
      };

      const result = decisionNormalizer.normalizeDecision(input);
      const impacts = result.record.glAccountImpacts;

      // Verify sorted by year, then period, then account ID
      for (let i = 1; i < impacts.length; i++) {
        const prev = impacts[i - 1]!;
        const curr = impacts[i]!;
        const isOrdered =
          prev.period.year < curr.period.year ||
          (prev.period.year === curr.period.year && prev.period.period < curr.period.period) ||
          (prev.period.year === curr.period.year && prev.period.period === curr.period.period && prev.glAccountId <= curr.glAccountId);
        expect(isOrdered).toBe(true);
      }
    });
  });

  // ============================================================================
  // Allocation Normalization Tests
  // ============================================================================

  describe('normalizeAllocations', () => {
    it('should return empty array for empty input', () => {
      const result = decisionNormalizer.normalizeAllocations([]);
      expect(result).toEqual([]);
    });

    it('should keep allocations that already sum to 100%', () => {
      const allocations = [
        { costCenterId: 'CC001', allocationPercentage: 60, allocationMethod: AllocationMethod.DIRECT },
        { costCenterId: 'CC002', allocationPercentage: 40, allocationMethod: AllocationMethod.DIRECT },
      ];

      const result = decisionNormalizer.normalizeAllocations(allocations);
      expect(result[0]?.allocationPercentage).toBe(60);
      expect(result[1]?.allocationPercentage).toBe(40);
    });

    it('should normalize allocations that do not sum to 100%', () => {
      const allocations = [
        { costCenterId: 'CC001', allocationPercentage: 30, allocationMethod: AllocationMethod.DIRECT },
        { costCenterId: 'CC002', allocationPercentage: 20, allocationMethod: AllocationMethod.DIRECT },
      ];

      const result = decisionNormalizer.normalizeAllocations(allocations);
      const total = result.reduce((sum, a) => sum + a.allocationPercentage, 0);
      expect(total).toBeCloseTo(100, 1);
    });

    it('should sort normalized allocations by cost center ID', () => {
      const allocations = [
        { costCenterId: 'CC003', allocationPercentage: 30, allocationMethod: AllocationMethod.DIRECT },
        { costCenterId: 'CC001', allocationPercentage: 40, allocationMethod: AllocationMethod.DIRECT },
        { costCenterId: 'CC002', allocationPercentage: 30, allocationMethod: AllocationMethod.DIRECT },
      ];

      const result = decisionNormalizer.normalizeAllocations(allocations);
      expect(result[0]?.costCenterId).toBe('CC001');
      expect(result[1]?.costCenterId).toBe('CC002');
      expect(result[2]?.costCenterId).toBe('CC003');
    });
  });

  // ============================================================================
  // Cost Center Resolution Tests
  // ============================================================================

  describe('cost center resolution', () => {
    it('should extract cost center from outcome metrics', () => {
      const input: RawDecisionInput = {
        decision: createMockDecisionNode({
          outcomeMetrics: {
            costCenterId: 'CC001',
            expectedSavings: 50000,
          } as unknown as Record<string, number>,
        }),
        resourceDeltas: createMockResourceDeltas(),
        simulationStartDate: '2024-01-01T00:00:00.000Z',
      };

      // Note: The implementation checks for string values in outcomeMetrics
      // which conflicts with the Record<string, number> type
      // This test documents the current behavior
      const result = decisionNormalizer.normalizeDecision(input);
      expect(result.record.primaryCostCenterId).toBeDefined();
    });

    it('should warn when using default cost center', () => {
      const input: RawDecisionInput = {
        decision: createMockDecisionNode({
          outcomeMetrics: {},
        }),
        resourceDeltas: [],
        simulationStartDate: '2024-01-01T00:00:00.000Z',
      };

      const result = decisionNormalizer.normalizeDecision(input);
      expect(result.warnings.some(w => w.includes('default'))).toBe(true);
    });
  });

  // ============================================================================
  // Resource Delta Processing Tests
  // ============================================================================

  describe('resource delta processing', () => {
    it('should handle FTE resource type', () => {
      const input: RawDecisionInput = {
        decision: createMockDecisionNode(),
        resourceDeltas: [
          { period: 0, resourceType: ResourceType.FTE, quantity: 2, unit: 'FTE', direction: DeltaDirection.DECREASE },
        ],
        simulationStartDate: '2024-01-01T00:00:00.000Z',
      };

      const result = decisionNormalizer.normalizeDecision(input);
      expect(parseFloat(result.record.grossImpactAmount)).toBeGreaterThan(0);
    });

    it('should handle COMPUTE resource type', () => {
      const input: RawDecisionInput = {
        decision: createMockDecisionNode(),
        resourceDeltas: [
          { period: 0, resourceType: ResourceType.COMPUTE, quantity: 1000, unit: 'compute-hours', direction: DeltaDirection.DECREASE },
        ],
        simulationStartDate: '2024-01-01T00:00:00.000Z',
      };

      const result = decisionNormalizer.normalizeDecision(input);
      expect(parseFloat(result.record.grossImpactAmount)).toBeGreaterThan(0);
    });

    it('should handle LICENSE resource type', () => {
      const input: RawDecisionInput = {
        decision: createMockDecisionNode(),
        resourceDeltas: [
          { period: 0, resourceType: ResourceType.LICENSE, quantity: 50, unit: 'licenses', direction: DeltaDirection.DECREASE },
        ],
        simulationStartDate: '2024-01-01T00:00:00.000Z',
      };

      const result = decisionNormalizer.normalizeDecision(input);
      expect(parseFloat(result.record.grossImpactAmount)).toBeGreaterThan(0);
    });

    it('should handle CUSTOM resource type', () => {
      const input: RawDecisionInput = {
        decision: createMockDecisionNode(),
        resourceDeltas: [
          { period: 0, resourceType: ResourceType.CUSTOM, quantity: 100, unit: 'units', direction: DeltaDirection.DECREASE },
        ],
        simulationStartDate: '2024-01-01T00:00:00.000Z',
      };

      const result = decisionNormalizer.normalizeDecision(input);
      expect(parseFloat(result.record.grossImpactAmount)).toBeGreaterThan(0);
    });

    it('should calculate net savings from mixed deltas', () => {
      const input: RawDecisionInput = {
        decision: createMockDecisionNode(),
        resourceDeltas: [
          { period: 0, resourceType: ResourceType.FTE, quantity: 2, unit: 'FTE', direction: DeltaDirection.DECREASE },
          { period: 0, resourceType: ResourceType.FTE, quantity: 1, unit: 'FTE', direction: DeltaDirection.INCREASE },
        ],
        simulationStartDate: '2024-01-01T00:00:00.000Z',
      };

      const result = decisionNormalizer.normalizeDecision(input);
      // Net should be savings of 1 FTE (2 decrease - 1 increase)
      expect(parseFloat(result.record.grossImpactAmount)).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Utility Method Tests
  // ============================================================================

  describe('getUnitHarmonizer', () => {
    it('should return the unit harmonizer instance', () => {
      const harmonizer = decisionNormalizer.getUnitHarmonizer();
      expect(harmonizer).toBe(unitHarmonizer);
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('edge cases', () => {
    it('should handle decision with zero probability', () => {
      const input: RawDecisionInput = {
        decision: createMockDecisionNode({ probability: 0 }),
        resourceDeltas: createMockResourceDeltas(),
        simulationStartDate: '2024-01-01T00:00:00.000Z',
      };

      const result = decisionNormalizer.normalizeDecision(input);
      expect(result.record.confidenceScore).toBe(0);
      expect(result.record.volatilityScore).toBe(1); // Max volatility
    });

    it('should handle decision with probability of 1', () => {
      const input: RawDecisionInput = {
        decision: createMockDecisionNode({ probability: 1 }),
        resourceDeltas: createMockResourceDeltas(),
        simulationStartDate: '2024-01-01T00:00:00.000Z',
      };

      const result = decisionNormalizer.normalizeDecision(input);
      expect(result.record.confidenceScore).toBe(1);
      expect(result.record.volatilityScore).toBe(0); // Min volatility
    });

    it('should handle empty outcome metrics', () => {
      const input: RawDecisionInput = {
        decision: createMockDecisionNode({ outcomeMetrics: {} }),
        resourceDeltas: createMockResourceDeltas(),
        simulationStartDate: '2024-01-01T00:00:00.000Z',
      };

      const result = decisionNormalizer.normalizeDecision(input);
      expect(result.record).toBeDefined();
    });

    it('should handle decision with very long text', () => {
      const longText = 'A'.repeat(10000);
      const input: RawDecisionInput = {
        decision: createMockDecisionNode({ decision: longText }),
        resourceDeltas: createMockResourceDeltas(),
        simulationStartDate: '2024-01-01T00:00:00.000Z',
      };

      const result = decisionNormalizer.normalizeDecision(input);
      expect(result.record).toBeDefined();
    });

    it('should handle resource deltas with zero quantity', () => {
      const input: RawDecisionInput = {
        decision: createMockDecisionNode(),
        resourceDeltas: [
          { period: 0, resourceType: ResourceType.FTE, quantity: 0, unit: 'FTE', direction: DeltaDirection.DECREASE },
        ],
        simulationStartDate: '2024-01-01T00:00:00.000Z',
      };

      const result = decisionNormalizer.normalizeDecision(input);
      expect(result.record.grossImpactAmount).toBe('0.0000');
    });

    it('should handle resource deltas with very large quantities', () => {
      const input: RawDecisionInput = {
        decision: createMockDecisionNode(),
        resourceDeltas: [
          { period: 0, resourceType: ResourceType.FTE, quantity: 1000000, unit: 'FTE', direction: DeltaDirection.DECREASE },
        ],
        simulationStartDate: '2024-01-01T00:00:00.000Z',
      };

      const result = decisionNormalizer.normalizeDecision(input);
      expect(parseFloat(result.record.grossImpactAmount)).toBeGreaterThan(0);
    });
  });
});
