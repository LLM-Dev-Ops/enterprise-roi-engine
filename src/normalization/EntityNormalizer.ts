/**
 * EntityNormalizer
 * Maps heterogeneous ERP entity identifiers to canonical internal IDs.
 * Builds and maintains hierarchical structures for cost centers and GL accounts.
 */

import {
  CostCenter,
  GLAccount,
  EntityMapping,
  EntityType,
} from '../contracts';

// ============================================================================
// Types
// ============================================================================

/**
 * Node in the cost center hierarchy tree.
 */
export interface CostCenterNode {
  readonly costCenter: CostCenter;
  readonly children: readonly CostCenterNode[];
  readonly depth: number;
  readonly path: readonly string[]; // Path from root to this node
}

/**
 * Entity to cost center mapping with effective dates.
 */
export interface EntityCostCenterMapping {
  readonly entityId: string;
  readonly costCenterId: string;
  readonly allocationPercentage: number;
  readonly isPrimary: boolean;
}

/**
 * Canonical entity identifier after normalization.
 */
export interface CanonicalEntityId {
  readonly canonicalId: string;
  readonly sourceId: string;
  readonly entityType: EntityType;
  readonly displayName: string;
}

// ============================================================================
// EntityNormalizer Class
// ============================================================================

export class EntityNormalizer {
  private readonly costCenterMap: Map<string, CostCenter>;
  private readonly costCenterTree: Map<string, CostCenterNode>;
  private readonly glAccountMap: Map<string, GLAccount>;
  private readonly entityToCostCenterMap: Map<string, EntityCostCenterMapping[]>;
  private readonly entityMap: Map<string, EntityMapping>;
  private readonly rootCostCenters: CostCenterNode[];

  constructor(
    costCenters: readonly CostCenter[],
    glAccounts: readonly GLAccount[],
    entities: readonly EntityMapping[]
  ) {
    this.costCenterMap = new Map();
    this.costCenterTree = new Map();
    this.glAccountMap = new Map();
    this.entityToCostCenterMap = new Map();
    this.entityMap = new Map();
    this.rootCostCenters = [];

    this.buildCostCenterMap(costCenters);
    this.rootCostCenters.push(...this.buildCostCenterHierarchy(costCenters));
    this.buildGLAccountMap(glAccounts);
    this.buildEntityMap(entities);
    this.buildEntityToCostCenterMapping(entities);
  }

  // ============================================================================
  // Public Lookup Methods
  // ============================================================================

  /**
   * Gets a cost center by its ID.
   */
  getCostCenter(costCenterId: string): CostCenter | undefined {
    return this.costCenterMap.get(costCenterId);
  }

  /**
   * Gets a cost center node (with hierarchy info) by its ID.
   */
  getCostCenterNode(costCenterId: string): CostCenterNode | undefined {
    return this.costCenterTree.get(costCenterId);
  }

  /**
   * Gets all root cost centers (nodes with no parent).
   */
  getRootCostCenters(): readonly CostCenterNode[] {
    return this.rootCostCenters;
  }

  /**
   * Gets all descendants of a cost center.
   */
  getDescendants(costCenterId: string): readonly CostCenter[] {
    const node = this.costCenterTree.get(costCenterId);
    if (!node) {
      return [];
    }
    return this.collectDescendants(node);
  }

  /**
   * Gets the path from root to a cost center.
   */
  getCostCenterPath(costCenterId: string): readonly string[] {
    const node = this.costCenterTree.get(costCenterId);
    return node?.path ?? [];
  }

  /**
   * Gets a GL account by its ID.
   */
  getGLAccount(accountId: string): GLAccount | undefined {
    return this.glAccountMap.get(accountId);
  }

  /**
   * Gets all GL accounts of a specific type.
   */
  getGLAccountsByType(accountType: string): readonly GLAccount[] {
    const accounts: GLAccount[] = [];
    for (const account of Array.from(this.glAccountMap.values())) {
      if (account.accountType === accountType) {
        accounts.push(account);
      }
    }
    return this.sortGLAccountsById(accounts);
  }

  /**
   * Gets all active GL accounts.
   */
  getActiveGLAccounts(): readonly GLAccount[] {
    const accounts: GLAccount[] = [];
    for (const account of Array.from(this.glAccountMap.values())) {
      if (account.isActive) {
        accounts.push(account);
      }
    }
    return this.sortGLAccountsById(accounts);
  }

  /**
   * Gets cost center mappings for an entity.
   */
  getEntityCostCenters(entityId: string): readonly EntityCostCenterMapping[] {
    return this.entityToCostCenterMap.get(entityId) ?? [];
  }

  /**
   * Gets the primary cost center for an entity.
   */
  getPrimaryCostCenter(entityId: string): CostCenter | undefined {
    const mappings = this.entityToCostCenterMap.get(entityId);
    if (!mappings || mappings.length === 0) {
      return undefined;
    }
    const primary = mappings.find(m => m.isPrimary);
    if (primary) {
      return this.costCenterMap.get(primary.costCenterId);
    }
    // If no primary is marked, return the first one
    const firstMapping = mappings[0];
    if (firstMapping) {
      return this.costCenterMap.get(firstMapping.costCenterId);
    }
    return undefined;
  }

  /**
   * Resolves an entity ID to its cost center IDs.
   */
  resolveEntityToCostCenters(entityId: string): readonly string[] {
    const mappings = this.entityToCostCenterMap.get(entityId);
    if (!mappings) {
      return [];
    }
    return mappings
      .map(m => m.costCenterId)
      .sort((a, b) => a.localeCompare(b));
  }

  /**
   * Gets an entity mapping by ID.
   */
  getEntity(entityId: string): EntityMapping | undefined {
    return this.entityMap.get(entityId);
  }

  /**
   * Creates a canonical entity ID from a source entity.
   */
  normalizeEntityId(sourceId: string): CanonicalEntityId | undefined {
    const entity = this.entityMap.get(sourceId);
    if (!entity) {
      return undefined;
    }
    return {
      canonicalId: this.generateCanonicalId(sourceId, entity.entityType),
      sourceId: entity.erpEntityId,
      entityType: entity.entityType,
      displayName: entity.displayName,
    };
  }

  /**
   * Validates that a cost center exists and is active.
   */
  validateCostCenter(costCenterId: string): boolean {
    const cc = this.costCenterMap.get(costCenterId);
    return cc !== undefined && cc.isActive;
  }

  /**
   * Validates that a GL account exists and is active.
   */
  validateGLAccount(accountId: string): boolean {
    const account = this.glAccountMap.get(accountId);
    return account !== undefined && account.isActive;
  }

  /**
   * Gets all cost centers in deterministic order (by ID).
   */
  getAllCostCenters(): readonly CostCenter[] {
    return this.sortCostCentersById(Array.from(this.costCenterMap.values()));
  }

  /**
   * Gets all GL accounts in deterministic order (by ID).
   */
  getAllGLAccounts(): readonly GLAccount[] {
    return this.sortGLAccountsById(Array.from(this.glAccountMap.values()));
  }

  /**
   * Gets all entities in deterministic order (by ID).
   */
  getAllEntities(): readonly EntityMapping[] {
    return this.sortEntitiesById(Array.from(this.entityMap.values()));
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private buildCostCenterMap(costCenters: readonly CostCenter[]): void {
    for (const cc of costCenters) {
      this.costCenterMap.set(cc.costCenterId, cc);
    }
  }

  private buildCostCenterHierarchy(costCenters: readonly CostCenter[]): CostCenterNode[] {
    // Sort for deterministic processing
    const sorted = [...costCenters].sort((a, b) =>
      a.costCenterId.localeCompare(b.costCenterId)
    );

    // First pass: identify root nodes (no parent)
    const roots: CostCenterNode[] = [];
    const childrenMap = new Map<string, CostCenter[]>();

    for (const cc of sorted) {
      if (cc.parentCostCenterId === null) {
        // Root node
        const node = this.createNode(cc, 0, [cc.costCenterId]);
        roots.push(node);
        this.costCenterTree.set(cc.costCenterId, node);
      } else {
        // Track children
        const children = childrenMap.get(cc.parentCostCenterId) ?? [];
        children.push(cc);
        childrenMap.set(cc.parentCostCenterId, children);
      }
    }

    // Recursively build children
    for (const root of roots) {
      this.buildChildren(root, childrenMap);
    }

    return roots;
  }

  private createNode(
    costCenter: CostCenter,
    depth: number,
    path: readonly string[]
  ): CostCenterNode {
    return {
      costCenter,
      children: [],
      depth,
      path,
    };
  }

  private buildChildren(
    parent: CostCenterNode,
    childrenMap: Map<string, CostCenter[]>
  ): void {
    const children = childrenMap.get(parent.costCenter.costCenterId) ?? [];
    const sortedChildren = [...children].sort((a, b) =>
      a.costCenterId.localeCompare(b.costCenterId)
    );

    const childNodes: CostCenterNode[] = [];
    for (const child of sortedChildren) {
      const childPath = [...parent.path, child.costCenterId];
      const node = this.createNode(child, parent.depth + 1, childPath);
      childNodes.push(node);
      this.costCenterTree.set(child.costCenterId, node);
      this.buildChildren(node, childrenMap);
    }

    // Update parent with children (immutable pattern)
    const updatedParent: CostCenterNode = {
      ...parent,
      children: childNodes,
    };
    this.costCenterTree.set(parent.costCenter.costCenterId, updatedParent);
  }

  private collectDescendants(node: CostCenterNode): CostCenter[] {
    const descendants: CostCenter[] = [];
    for (const child of node.children) {
      descendants.push(child.costCenter);
      descendants.push(...this.collectDescendants(child));
    }
    return descendants.sort((a, b) => a.costCenterId.localeCompare(b.costCenterId));
  }

  private buildGLAccountMap(glAccounts: readonly GLAccount[]): void {
    for (const account of glAccounts) {
      this.glAccountMap.set(account.accountId, account);
    }
  }

  private buildEntityMap(entities: readonly EntityMapping[]): void {
    for (const entity of entities) {
      this.entityMap.set(entity.erpEntityId, entity);
    }
  }

  private buildEntityToCostCenterMapping(entities: readonly EntityMapping[]): void {
    // Sort for deterministic processing
    const sorted = [...entities].sort((a, b) =>
      a.erpEntityId.localeCompare(b.erpEntityId)
    );

    for (const entity of sorted) {
      if (entity.entityType === EntityType.COST_CENTER) {
        // Cost center entities map directly to themselves
        const mapping: EntityCostCenterMapping = {
          entityId: entity.erpEntityId,
          costCenterId: entity.erpEntityId,
          allocationPercentage: 100,
          isPrimary: true,
        };
        this.entityToCostCenterMap.set(entity.erpEntityId, [mapping]);
      } else if (entity.parentId && entity.attributes['costCenterId']) {
        // Entity has explicit cost center assignment
        const mapping: EntityCostCenterMapping = {
          entityId: entity.erpEntityId,
          costCenterId: entity.attributes['costCenterId'],
          allocationPercentage: parseFloat(entity.attributes['allocationPercentage'] ?? '100'),
          isPrimary: entity.attributes['isPrimary'] === 'true',
        };
        const existing = this.entityToCostCenterMap.get(entity.erpEntityId) ?? [];
        this.entityToCostCenterMap.set(entity.erpEntityId, [...existing, mapping]);
      } else if (entity.parentId) {
        // Inherit from parent if parent is a cost center
        const parent = this.entityMap.get(entity.parentId);
        if (parent && parent.entityType === EntityType.COST_CENTER) {
          const mapping: EntityCostCenterMapping = {
            entityId: entity.erpEntityId,
            costCenterId: entity.parentId,
            allocationPercentage: 100,
            isPrimary: true,
          };
          this.entityToCostCenterMap.set(entity.erpEntityId, [mapping]);
        }
      }
    }
  }

  private generateCanonicalId(sourceId: string, entityType: EntityType): string {
    const prefix = this.getEntityTypePrefix(entityType);
    // Create deterministic canonical ID
    return `${prefix}_${sourceId}`;
  }

  private getEntityTypePrefix(entityType: EntityType): string {
    switch (entityType) {
      case EntityType.COST_CENTER:
        return 'CC';
      case EntityType.DEPARTMENT:
        return 'DEPT';
      case EntityType.PROJECT:
        return 'PROJ';
      case EntityType.BUSINESS_UNIT:
        return 'BU';
      case EntityType.LEGAL_ENTITY:
        return 'LE';
      default:
        return 'ENT';
    }
  }

  private sortCostCentersById(items: CostCenter[]): CostCenter[] {
    return items.sort((a, b) => a.costCenterId.localeCompare(b.costCenterId));
  }

  private sortGLAccountsById(items: GLAccount[]): GLAccount[] {
    return items.sort((a, b) => a.accountId.localeCompare(b.accountId));
  }

  private sortEntitiesById(items: EntityMapping[]): EntityMapping[] {
    return items.sort((a, b) => a.erpEntityId.localeCompare(b.erpEntityId));
  }
}
