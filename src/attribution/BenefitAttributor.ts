/**
 * BenefitAttributor
 * Maps efficiency gains to monetary values and distributes benefits
 * to primary and secondary cost centers.
 */

import {
  CanonicalDecisionRecord,
  CostCenterAllocation,
  DistributedAttribution,
  AllocationMethod,
} from '../contracts';
import {
  toDecimal,
  multiply,
  divide,
  toCurrency,
  Decimal,
} from '../lib/financial';

/**
 * Allocation type for distributed attributions
 */
export type AllocationType = 'PRIMARY' | 'SECONDARY';

/**
 * BenefitAttributor class for distributing benefits across cost centers
 */
export class BenefitAttributor {
  /**
   * Distributes benefits to primary and secondary cost centers.
   * Normalizes allocation percentages to sum to 100%.
   */
  public distributeBenefits(
    decision: CanonicalDecisionRecord,
    attributedAmount: string
  ): readonly DistributedAttribution[] {
    const amount = toDecimal(attributedAmount);
    const { primaryCostCenterId, secondaryCostCenters } = decision;

    // Build all allocations with type annotations
    const allAllocations = this.buildAllAllocations(
      primaryCostCenterId,
      secondaryCostCenters
    );

    // Normalize percentages to sum to 100%
    const normalizedAllocations = this.normalizeAllocations(allAllocations);

    // Calculate distributed amounts
    return normalizedAllocations.map(allocation => ({
      costCenterId: allocation.costCenterId,
      amount: toCurrency(this.calculateAllocationAmount(amount, allocation.normalizedPercentage)),
      allocationPercentage: allocation.normalizedPercentage,
      allocationType: allocation.allocationType,
      allocationMethod: allocation.allocationMethod,
    }));
  }

  /**
   * Builds all allocations including primary and secondary cost centers.
   */
  private buildAllAllocations(
    primaryCostCenterId: string,
    secondaryCostCenters: readonly CostCenterAllocation[]
  ): AllocationEntry[] {
    const allocations: AllocationEntry[] = [];

    // Add primary cost center if there are no secondary allocations
    // or if secondary allocations don't sum to 100%
    const secondaryTotal = this.sumPercentages(secondaryCostCenters);

    if (secondaryTotal < 100) {
      // Primary gets the remainder
      const primaryPercentage = 100 - secondaryTotal;
      allocations.push({
        costCenterId: primaryCostCenterId,
        rawPercentage: primaryPercentage,
        normalizedPercentage: 0, // Will be set during normalization
        allocationType: 'PRIMARY' as AllocationType,
        allocationMethod: AllocationMethod.DIRECT,
      });
    }

    // Add secondary cost centers
    for (const secondary of secondaryCostCenters) {
      allocations.push({
        costCenterId: secondary.costCenterId,
        rawPercentage: secondary.allocationPercentage,
        normalizedPercentage: 0, // Will be set during normalization
        allocationType: 'SECONDARY' as AllocationType,
        allocationMethod: secondary.allocationMethod,
      });
    }

    return allocations;
  }

  /**
   * Normalizes allocation percentages to sum to exactly 100%.
   */
  private normalizeAllocations(
    allocations: AllocationEntry[]
  ): AllocationEntry[] {
    if (allocations.length === 0) {
      return [];
    }

    const totalRaw = allocations.reduce((sum, a) => sum + a.rawPercentage, 0);

    if (totalRaw === 0) {
      // Edge case: no percentages defined, distribute equally
      const equalShare = 100 / allocations.length;
      return allocations.map(a => ({
        ...a,
        normalizedPercentage: equalShare,
      }));
    }

    // Normalize each percentage
    const normalizationFactor = 100 / totalRaw;
    return allocations.map(a => ({
      ...a,
      normalizedPercentage: a.rawPercentage * normalizationFactor,
    }));
  }

  /**
   * Calculates the amount for a given allocation percentage.
   */
  private calculateAllocationAmount(
    totalAmount: Decimal,
    percentage: number
  ): Decimal {
    return multiply(totalAmount, divide(percentage.toString(), '100'));
  }

  /**
   * Sums the percentages of cost center allocations.
   */
  private sumPercentages(
    allocations: readonly CostCenterAllocation[]
  ): number {
    return allocations.reduce((sum, a) => sum + a.allocationPercentage, 0);
  }

  /**
   * Creates a single primary distribution (no secondary cost centers).
   */
  public createPrimaryOnlyDistribution(
    costCenterId: string,
    amount: string
  ): readonly DistributedAttribution[] {
    return [{
      costCenterId,
      amount,
      allocationPercentage: 100,
      allocationType: 'PRIMARY',
      allocationMethod: AllocationMethod.DIRECT,
    }];
  }

  /**
   * Validates that allocation percentages are reasonable.
   */
  public validateAllocations(
    allocations: readonly CostCenterAllocation[]
  ): ValidationResult {
    const total = this.sumPercentages(allocations);
    const issues: string[] = [];

    if (total > 100) {
      issues.push(`Total allocation percentage exceeds 100%: ${total}%`);
    }

    for (const allocation of allocations) {
      if (allocation.allocationPercentage < 0) {
        issues.push(`Negative allocation for ${allocation.costCenterId}: ${allocation.allocationPercentage}%`);
      }
      if (allocation.allocationPercentage > 100) {
        issues.push(`Allocation exceeds 100% for ${allocation.costCenterId}: ${allocation.allocationPercentage}%`);
      }
    }

    return {
      isValid: issues.length === 0,
      issues,
      totalPercentage: total,
    };
  }

  /**
   * Splits an amount across multiple cost centers by percentage.
   */
  public splitByPercentage(
    amount: string,
    splits: readonly { costCenterId: string; percentage: number }[]
  ): Map<string, string> {
    const result = new Map<string, string>();
    const totalAmount = toDecimal(amount);

    for (const split of splits) {
      const splitAmount = this.calculateAllocationAmount(totalAmount, split.percentage);
      result.set(split.costCenterId, toCurrency(splitAmount));
    }

    return result;
  }
}

/**
 * Internal allocation entry for processing
 */
interface AllocationEntry {
  readonly costCenterId: string;
  readonly rawPercentage: number;
  normalizedPercentage: number;
  readonly allocationType: AllocationType;
  readonly allocationMethod: AllocationMethod;
}

/**
 * Validation result for allocation checks
 */
export interface ValidationResult {
  readonly isValid: boolean;
  readonly issues: readonly string[];
  readonly totalPercentage: number;
}
