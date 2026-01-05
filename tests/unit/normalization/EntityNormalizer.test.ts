/**
 * EntityNormalizer Unit Tests
 * Tests for mapping heterogeneous ERP entity identifiers to canonical internal IDs.
 */

import {
  EntityNormalizer,
} from '../../../src/normalization/EntityNormalizer';
import {
  CostCenter,
  GLAccount,
  EntityMapping,
  EntityType,
  AccountType,
  NaturalSign,
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
    name: 'Frontend Team',
    parentCostCenterId: 'CC001',
    hierarchyLevel: 1,
    acceptsDirectCharges: true,
    currency: 'USD',
    isActive: true,
  },
  {
    costCenterId: 'CC003',
    name: 'Backend Team',
    parentCostCenterId: 'CC001',
    hierarchyLevel: 1,
    acceptsDirectCharges: true,
    currency: 'USD',
    isActive: true,
  },
  {
    costCenterId: 'CC004',
    name: 'API Squad',
    parentCostCenterId: 'CC003',
    hierarchyLevel: 2,
    acceptsDirectCharges: true,
    currency: 'USD',
    isActive: true,
  },
  {
    costCenterId: 'CC005',
    name: 'Finance',
    parentCostCenterId: null,
    hierarchyLevel: 0,
    acceptsDirectCharges: true,
    currency: 'USD',
    isActive: true,
  },
  {
    costCenterId: 'CC006',
    name: 'Inactive Dept',
    parentCostCenterId: null,
    hierarchyLevel: 0,
    acceptsDirectCharges: true,
    currency: 'USD',
    isActive: false,
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
    accountName: 'Software Licenses',
    accountType: AccountType.EXPENSE,
    naturalSign: NaturalSign.DEBIT,
    currency: 'USD',
    isActive: true,
  },
  {
    accountId: 'GL003',
    accountName: 'Fixed Assets',
    accountType: AccountType.ASSET,
    naturalSign: NaturalSign.DEBIT,
    currency: 'USD',
    isActive: true,
  },
  {
    accountId: 'GL004',
    accountName: 'Accounts Payable',
    accountType: AccountType.LIABILITY,
    naturalSign: NaturalSign.CREDIT,
    currency: 'USD',
    isActive: true,
  },
  {
    accountId: 'GL005',
    accountName: 'Inactive Account',
    accountType: AccountType.EXPENSE,
    naturalSign: NaturalSign.DEBIT,
    currency: 'USD',
    isActive: false,
  },
  {
    accountId: 'GL006',
    accountName: 'Revenue',
    accountType: AccountType.REVENUE,
    naturalSign: NaturalSign.CREDIT,
    currency: 'EUR',
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
    erpEntityId: 'DEPT001',
    entityType: EntityType.DEPARTMENT,
    displayName: 'Product Department',
    parentId: 'CC001',
    attributes: {
      costCenterId: 'CC002',
      allocationPercentage: '75',
      isPrimary: 'true',
    },
  },
  {
    erpEntityId: 'PROJ001',
    entityType: EntityType.PROJECT,
    displayName: 'New Platform Project',
    parentId: 'CC003',
    attributes: {},
  },
  {
    erpEntityId: 'BU001',
    entityType: EntityType.BUSINESS_UNIT,
    displayName: 'Technology BU',
    parentId: null,
    attributes: {},
  },
  {
    erpEntityId: 'LE001',
    entityType: EntityType.LEGAL_ENTITY,
    displayName: 'ACME Corp',
    parentId: null,
    attributes: {},
  },
];

// ============================================================================
// Test Suite
// ============================================================================

describe('EntityNormalizer', () => {
  let normalizer: EntityNormalizer;
  let costCenters: CostCenter[];
  let glAccounts: GLAccount[];
  let entities: EntityMapping[];

  beforeEach(() => {
    costCenters = createMockCostCenters();
    glAccounts = createMockGLAccounts();
    entities = createMockEntities();
    normalizer = new EntityNormalizer(costCenters, glAccounts, entities);
  });

  // ============================================================================
  // Cost Center Lookup Tests
  // ============================================================================

  describe('getCostCenter', () => {
    it('should return a cost center by ID', () => {
      const cc = normalizer.getCostCenter('CC001');
      expect(cc).toBeDefined();
      expect(cc?.name).toBe('Engineering');
      expect(cc?.isActive).toBe(true);
    });

    it('should return undefined for non-existent cost center', () => {
      const cc = normalizer.getCostCenter('NONEXISTENT');
      expect(cc).toBeUndefined();
    });

    it('should return inactive cost centers', () => {
      const cc = normalizer.getCostCenter('CC006');
      expect(cc).toBeDefined();
      expect(cc?.isActive).toBe(false);
    });
  });

  describe('getCostCenterNode', () => {
    it('should return a cost center node with hierarchy info', () => {
      const node = normalizer.getCostCenterNode('CC001');
      expect(node).toBeDefined();
      expect(node?.depth).toBe(0);
      expect(node?.path).toEqual(['CC001']);
    });

    it('should return correct depth for nested cost centers', () => {
      const node = normalizer.getCostCenterNode('CC004');
      expect(node).toBeDefined();
      expect(node?.depth).toBe(2);
      expect(node?.path).toEqual(['CC001', 'CC003', 'CC004']);
    });

    it('should return undefined for non-existent node', () => {
      const node = normalizer.getCostCenterNode('NONEXISTENT');
      expect(node).toBeUndefined();
    });
  });

  describe('getRootCostCenters', () => {
    it('should return all root cost centers', () => {
      const roots = normalizer.getRootCostCenters();
      expect(roots.length).toBe(3); // CC001, CC005, CC006
      expect(roots.map(r => r.costCenter.costCenterId)).toContain('CC001');
      expect(roots.map(r => r.costCenter.costCenterId)).toContain('CC005');
      expect(roots.map(r => r.costCenter.costCenterId)).toContain('CC006');
    });

    it('should return root nodes with depth 0', () => {
      const roots = normalizer.getRootCostCenters();
      roots.forEach(root => {
        expect(root.depth).toBe(0);
      });
    });
  });

  describe('getDescendants', () => {
    it('should return all descendants of a cost center', () => {
      const descendants = normalizer.getDescendants('CC001');
      expect(descendants.length).toBe(3); // CC002, CC003, CC004
      const ids = descendants.map(d => d.costCenterId);
      expect(ids).toContain('CC002');
      expect(ids).toContain('CC003');
      expect(ids).toContain('CC004');
    });

    it('should return empty array for leaf nodes', () => {
      const descendants = normalizer.getDescendants('CC002');
      expect(descendants).toEqual([]);
    });

    it('should return empty array for non-existent cost center', () => {
      const descendants = normalizer.getDescendants('NONEXISTENT');
      expect(descendants).toEqual([]);
    });

    it('should return descendants in sorted order', () => {
      const descendants = normalizer.getDescendants('CC001');
      const ids = descendants.map(d => d.costCenterId);
      expect(ids).toEqual(['CC002', 'CC003', 'CC004']);
    });
  });

  describe('getCostCenterPath', () => {
    it('should return the full path from root to cost center', () => {
      const path = normalizer.getCostCenterPath('CC004');
      expect(path).toEqual(['CC001', 'CC003', 'CC004']);
    });

    it('should return single-element path for root cost center', () => {
      const path = normalizer.getCostCenterPath('CC001');
      expect(path).toEqual(['CC001']);
    });

    it('should return empty array for non-existent cost center', () => {
      const path = normalizer.getCostCenterPath('NONEXISTENT');
      expect(path).toEqual([]);
    });
  });

  // ============================================================================
  // GL Account Lookup Tests
  // ============================================================================

  describe('getGLAccount', () => {
    it('should return a GL account by ID', () => {
      const account = normalizer.getGLAccount('GL001');
      expect(account).toBeDefined();
      expect(account?.accountName).toBe('Salary Expense');
    });

    it('should return undefined for non-existent GL account', () => {
      const account = normalizer.getGLAccount('NONEXISTENT');
      expect(account).toBeUndefined();
    });
  });

  describe('getGLAccountsByType', () => {
    it('should return all GL accounts of a specific type', () => {
      const expenseAccounts = normalizer.getGLAccountsByType(AccountType.EXPENSE);
      expect(expenseAccounts.length).toBe(3); // GL001, GL002, GL005
    });

    it('should return empty array for type with no accounts', () => {
      const equityAccounts = normalizer.getGLAccountsByType(AccountType.EQUITY);
      expect(equityAccounts).toEqual([]);
    });

    it('should return accounts in sorted order by ID', () => {
      const expenseAccounts = normalizer.getGLAccountsByType(AccountType.EXPENSE);
      const ids = expenseAccounts.map(a => a.accountId);
      expect(ids).toEqual(['GL001', 'GL002', 'GL005']);
    });
  });

  describe('getActiveGLAccounts', () => {
    it('should return only active GL accounts', () => {
      const activeAccounts = normalizer.getActiveGLAccounts();
      expect(activeAccounts.length).toBe(5); // All except GL005
      activeAccounts.forEach(account => {
        expect(account.isActive).toBe(true);
      });
    });

    it('should not include inactive accounts', () => {
      const activeAccounts = normalizer.getActiveGLAccounts();
      const ids = activeAccounts.map(a => a.accountId);
      expect(ids).not.toContain('GL005');
    });

    it('should return accounts in sorted order', () => {
      const activeAccounts = normalizer.getActiveGLAccounts();
      const ids = activeAccounts.map(a => a.accountId);
      expect(ids).toEqual(['GL001', 'GL002', 'GL003', 'GL004', 'GL006']);
    });
  });

  // ============================================================================
  // Entity to Cost Center Mapping Tests
  // ============================================================================

  describe('getEntityCostCenters', () => {
    it('should return cost center mappings for an entity', () => {
      const mappings = normalizer.getEntityCostCenters('CC001');
      expect(mappings.length).toBe(1);
      expect(mappings[0]?.costCenterId).toBe('CC001');
      expect(mappings[0]?.isPrimary).toBe(true);
    });

    it('should return empty array for entity with no cost center mappings', () => {
      const mappings = normalizer.getEntityCostCenters('NONEXISTENT');
      expect(mappings).toEqual([]);
    });

    it('should return mappings with explicit cost center assignment', () => {
      const mappings = normalizer.getEntityCostCenters('DEPT001');
      expect(mappings.length).toBe(1);
      expect(mappings[0]?.costCenterId).toBe('CC002');
      expect(mappings[0]?.allocationPercentage).toBe(75);
    });
  });

  describe('getPrimaryCostCenter', () => {
    it('should return primary cost center for an entity', () => {
      const primary = normalizer.getPrimaryCostCenter('CC001');
      expect(primary).toBeDefined();
      expect(primary?.costCenterId).toBe('CC001');
    });

    it('should return undefined for entity with no cost center', () => {
      const primary = normalizer.getPrimaryCostCenter('NONEXISTENT');
      expect(primary).toBeUndefined();
    });

    it('should return first cost center if no primary is marked', () => {
      const primary = normalizer.getPrimaryCostCenter('PROJ001');
      expect(primary).toBeDefined();
      expect(primary?.costCenterId).toBe('CC003');
    });
  });

  describe('resolveEntityToCostCenters', () => {
    it('should return cost center IDs for an entity', () => {
      const ccIds = normalizer.resolveEntityToCostCenters('CC001');
      expect(ccIds).toEqual(['CC001']);
    });

    it('should return empty array for entity with no mappings', () => {
      const ccIds = normalizer.resolveEntityToCostCenters('NONEXISTENT');
      expect(ccIds).toEqual([]);
    });

    it('should return sorted cost center IDs', () => {
      const ccIds = normalizer.resolveEntityToCostCenters('DEPT001');
      expect(ccIds).toEqual(['CC002']);
    });
  });

  // ============================================================================
  // Entity Normalization Tests
  // ============================================================================

  describe('getEntity', () => {
    it('should return an entity by ID', () => {
      const entity = normalizer.getEntity('DEPT001');
      expect(entity).toBeDefined();
      expect(entity?.displayName).toBe('Product Department');
    });

    it('should return undefined for non-existent entity', () => {
      const entity = normalizer.getEntity('NONEXISTENT');
      expect(entity).toBeUndefined();
    });
  });

  describe('normalizeEntityId', () => {
    it('should create canonical ID for cost center', () => {
      const canonical = normalizer.normalizeEntityId('CC001');
      expect(canonical).toBeDefined();
      expect(canonical?.canonicalId).toBe('CC_CC001');
      expect(canonical?.entityType).toBe(EntityType.COST_CENTER);
    });

    it('should create canonical ID for department', () => {
      const canonical = normalizer.normalizeEntityId('DEPT001');
      expect(canonical).toBeDefined();
      expect(canonical?.canonicalId).toBe('DEPT_DEPT001');
      expect(canonical?.entityType).toBe(EntityType.DEPARTMENT);
    });

    it('should create canonical ID for project', () => {
      const canonical = normalizer.normalizeEntityId('PROJ001');
      expect(canonical).toBeDefined();
      expect(canonical?.canonicalId).toBe('PROJ_PROJ001');
      expect(canonical?.entityType).toBe(EntityType.PROJECT);
    });

    it('should create canonical ID for business unit', () => {
      const canonical = normalizer.normalizeEntityId('BU001');
      expect(canonical).toBeDefined();
      expect(canonical?.canonicalId).toBe('BU_BU001');
      expect(canonical?.entityType).toBe(EntityType.BUSINESS_UNIT);
    });

    it('should create canonical ID for legal entity', () => {
      const canonical = normalizer.normalizeEntityId('LE001');
      expect(canonical).toBeDefined();
      expect(canonical?.canonicalId).toBe('LE_LE001');
      expect(canonical?.entityType).toBe(EntityType.LEGAL_ENTITY);
    });

    it('should return undefined for non-existent entity', () => {
      const canonical = normalizer.normalizeEntityId('NONEXISTENT');
      expect(canonical).toBeUndefined();
    });

    it('should preserve source ID in result', () => {
      const canonical = normalizer.normalizeEntityId('DEPT001');
      expect(canonical?.sourceId).toBe('DEPT001');
    });

    it('should include display name in result', () => {
      const canonical = normalizer.normalizeEntityId('DEPT001');
      expect(canonical?.displayName).toBe('Product Department');
    });
  });

  // ============================================================================
  // Validation Tests
  // ============================================================================

  describe('validateCostCenter', () => {
    it('should return true for active cost center', () => {
      expect(normalizer.validateCostCenter('CC001')).toBe(true);
    });

    it('should return false for inactive cost center', () => {
      expect(normalizer.validateCostCenter('CC006')).toBe(false);
    });

    it('should return false for non-existent cost center', () => {
      expect(normalizer.validateCostCenter('NONEXISTENT')).toBe(false);
    });
  });

  describe('validateGLAccount', () => {
    it('should return true for active GL account', () => {
      expect(normalizer.validateGLAccount('GL001')).toBe(true);
    });

    it('should return false for inactive GL account', () => {
      expect(normalizer.validateGLAccount('GL005')).toBe(false);
    });

    it('should return false for non-existent GL account', () => {
      expect(normalizer.validateGLAccount('NONEXISTENT')).toBe(false);
    });
  });

  // ============================================================================
  // Get All Methods Tests
  // ============================================================================

  describe('getAllCostCenters', () => {
    it('should return all cost centers in sorted order', () => {
      const allCCs = normalizer.getAllCostCenters();
      expect(allCCs.length).toBe(6);
      const ids = allCCs.map(cc => cc.costCenterId);
      expect(ids).toEqual(['CC001', 'CC002', 'CC003', 'CC004', 'CC005', 'CC006']);
    });
  });

  describe('getAllGLAccounts', () => {
    it('should return all GL accounts in sorted order', () => {
      const allAccounts = normalizer.getAllGLAccounts();
      expect(allAccounts.length).toBe(6);
      const ids = allAccounts.map(a => a.accountId);
      expect(ids).toEqual(['GL001', 'GL002', 'GL003', 'GL004', 'GL005', 'GL006']);
    });
  });

  describe('getAllEntities', () => {
    it('should return all entities in sorted order', () => {
      const allEntities = normalizer.getAllEntities();
      expect(allEntities.length).toBe(5);
      const ids = allEntities.map(e => e.erpEntityId);
      expect(ids).toEqual(['BU001', 'CC001', 'DEPT001', 'LE001', 'PROJ001']);
    });
  });

  // ============================================================================
  // Edge Cases and Error Handling
  // ============================================================================

  describe('edge cases', () => {
    it('should handle empty cost centers array', () => {
      const emptyNormalizer = new EntityNormalizer([], glAccounts, entities);
      expect(emptyNormalizer.getAllCostCenters()).toEqual([]);
      expect(emptyNormalizer.getRootCostCenters()).toEqual([]);
    });

    it('should handle empty GL accounts array', () => {
      const emptyNormalizer = new EntityNormalizer(costCenters, [], entities);
      expect(emptyNormalizer.getAllGLAccounts()).toEqual([]);
    });

    it('should handle empty entities array', () => {
      const emptyNormalizer = new EntityNormalizer(costCenters, glAccounts, []);
      expect(emptyNormalizer.getAllEntities()).toEqual([]);
    });

    it('should handle cost center with missing parent', () => {
      const orphanCostCenters: CostCenter[] = [
        {
          costCenterId: 'CC001',
          name: 'Orphan',
          parentCostCenterId: 'NONEXISTENT',
          hierarchyLevel: 1,
          acceptsDirectCharges: true,
          currency: 'USD',
          isActive: true,
        },
      ];
      // Should not throw, orphan becomes its own root conceptually
      const orphanNormalizer = new EntityNormalizer(orphanCostCenters, [], []);
      expect(orphanNormalizer.getCostCenter('CC001')).toBeDefined();
    });

    it('should handle duplicate cost center IDs by keeping last', () => {
      const duplicateCCs: CostCenter[] = [
        {
          costCenterId: 'CC001',
          name: 'First',
          parentCostCenterId: null,
          hierarchyLevel: 0,
          acceptsDirectCharges: true,
          currency: 'USD',
          isActive: true,
        },
        {
          costCenterId: 'CC001',
          name: 'Second',
          parentCostCenterId: null,
          hierarchyLevel: 0,
          acceptsDirectCharges: true,
          currency: 'USD',
          isActive: true,
        },
      ];
      const duplicateNormalizer = new EntityNormalizer(duplicateCCs, [], []);
      const cc = duplicateNormalizer.getCostCenter('CC001');
      expect(cc?.name).toBe('Second');
    });
  });

  // ============================================================================
  // Hierarchy Building Tests
  // ============================================================================

  describe('hierarchy building', () => {
    it('should correctly build multi-level hierarchy', () => {
      const engineeringNode = normalizer.getCostCenterNode('CC001');
      expect(engineeringNode).toBeDefined();
      expect(engineeringNode?.children.length).toBe(2); // CC002, CC003

      const backendNode = normalizer.getCostCenterNode('CC003');
      expect(backendNode?.children.length).toBe(1); // CC004
    });

    it('should maintain referential integrity in hierarchy', () => {
      const apiNode = normalizer.getCostCenterNode('CC004');
      expect(apiNode).toBeDefined();
      expect(apiNode?.path).toContain('CC003');
      expect(apiNode?.path).toContain('CC001');
    });
  });
});
