/**
 * CostAttributor
 * Allocates costs to cost centers and GL accounts based on decision records.
 * Handles hierarchy traversal and period-specific adjustments.
 */

import {
  CanonicalDecisionRecord,
  PrimaryAttribution,
  FiscalPeriod,
  AttributionError,
} from '../contracts';
import { CostCenter } from '../contracts/erp';
import {
  toDecimal,
  multiply,
  toCurrency,
  Decimal,
} from '../lib/financial';

/**
 * Configuration for period-specific adjustments
 */
export interface PeriodAdjustment {
  readonly period: FiscalPeriod;
  readonly adjustmentFactor: number;
  readonly reason: string;
}

/**
 * CostAttributor class for allocating costs to cost centers
 */
export class CostAttributor {
  private readonly costCenterMap: Map<string, CostCenter>;
  private readonly periodAdjustments: Map<string, PeriodAdjustment>;

  constructor(
    costCenters: readonly CostCenter[],
    periodAdjustments: readonly PeriodAdjustment[] = []
  ) {
    // Build cost center lookup map
    this.costCenterMap = new Map(
      costCenters.map(cc => [cc.costCenterId, cc])
    );

    // Build period adjustment lookup map (key: "year-period")
    this.periodAdjustments = new Map(
      periodAdjustments.map(pa => [
        `${pa.period.year}-${pa.period.period}`,
        pa,
      ])
    );
  }

  /**
   * Computes primary attribution for a decision record.
   * If the primary cost center doesn't accept direct charges,
   * traverses the hierarchy to find an accepting ancestor.
   */
  public computePrimaryAttribution(
    decision: CanonicalDecisionRecord,
    fiscalPeriod: FiscalPeriod
  ): PrimaryAttribution {
    const { primaryCostCenterId, recordId, grossImpactAmount } = decision;

    // Find the cost center that will accept this charge
    const { costCenter, traversedLevels } = this.findAcceptingCostCenter(
      primaryCostCenterId
    );

    // Get period-specific adjustment if available
    const periodKey = `${fiscalPeriod.year}-${fiscalPeriod.period}`;
    const adjustment = this.periodAdjustments.get(periodKey);
    const adjustmentFactor = adjustment?.adjustmentFactor ?? 1.0;

    // Calculate attributed amount with adjustment
    const originalAmount = toDecimal(grossImpactAmount);
    const attributedAmount = this.applyAdjustment(originalAmount, adjustmentFactor);

    // Build attribution basis description
    const attributionBasis = this.buildAttributionBasis(
      primaryCostCenterId,
      costCenter.costCenterId,
      traversedLevels,
      adjustment?.reason
    );

    return {
      decisionRecordId: recordId,
      costCenterId: costCenter.costCenterId,
      costCenterName: costCenter.name,
      costCenterLevel: costCenter.hierarchyLevel,
      attributedAmount: toCurrency(attributedAmount),
      fiscalPeriod,
      attributionBasis,
      originalAmount: grossImpactAmount,
      adjustmentFactor,
    };
  }

  /**
   * Finds the cost center that accepts direct charges.
   * If the given cost center doesn't accept charges, traverses
   * up the hierarchy until one is found.
   */
  private findAcceptingCostCenter(
    costCenterId: string
  ): { costCenter: CostCenter; traversedLevels: number } {
    let currentId: string | null = costCenterId;
    let traversedLevels = 0;

    while (currentId !== null) {
      const costCenter = this.costCenterMap.get(currentId);

      if (!costCenter) {
        throw new AttributionError(
          `Cost center not found: ${currentId}`,
          costCenterId,
          { traversedLevels }
        );
      }

      if (costCenter.acceptsDirectCharges) {
        return { costCenter, traversedLevels };
      }

      // Move up to parent
      currentId = costCenter.parentCostCenterId;
      traversedLevels++;

      // Safety check to prevent infinite loops
      if (traversedLevels > 100) {
        throw new AttributionError(
          `Hierarchy traversal exceeded maximum depth for cost center: ${costCenterId}`,
          costCenterId,
          { traversedLevels }
        );
      }
    }

    // No accepting cost center found in hierarchy
    throw new AttributionError(
      `No cost center in hierarchy accepts direct charges: ${costCenterId}`,
      costCenterId,
      { traversedLevels }
    );
  }

  /**
   * Applies a period adjustment factor to an amount.
   */
  private applyAdjustment(amount: Decimal, factor: number): Decimal {
    return multiply(amount, factor.toString());
  }

  /**
   * Builds a human-readable attribution basis description.
   */
  private buildAttributionBasis(
    originalCostCenterId: string,
    finalCostCenterId: string,
    traversedLevels: number,
    adjustmentReason?: string
  ): string {
    const parts: string[] = [];

    if (originalCostCenterId === finalCostCenterId) {
      parts.push('DIRECT_ATTRIBUTION');
    } else {
      parts.push(`HIERARCHY_ROLLUP(levels=${traversedLevels})`);
      parts.push(`from=${originalCostCenterId}`);
    }

    if (adjustmentReason) {
      parts.push(`adjustment=${adjustmentReason}`);
    }

    return parts.join('; ');
  }

  /**
   * Validates that a cost center exists in the hierarchy.
   */
  public hasCostCenter(costCenterId: string): boolean {
    return this.costCenterMap.has(costCenterId);
  }

  /**
   * Gets the hierarchy path from a cost center to the root.
   */
  public getHierarchyPath(costCenterId: string): readonly string[] {
    const path: string[] = [];
    let currentId: string | null = costCenterId;

    while (currentId !== null) {
      const costCenter = this.costCenterMap.get(currentId);
      if (!costCenter) break;

      path.push(currentId);
      currentId = costCenter.parentCostCenterId;

      // Safety check
      if (path.length > 100) break;
    }

    return path;
  }
}
