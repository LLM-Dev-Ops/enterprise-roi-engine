/**
 * OverheadAllocator
 * Applies overhead allocation rates (direct, indirect, shared services)
 * to calculate fully loaded amounts for cost attribution.
 */

import {
  OverheadAttribution,
  UUID,
} from '../contracts';
import { OverheadFactor } from '../contracts/costops';
import {
  toDecimal,
  add,
  multiply,
  toCurrency,
  zero,
  Decimal,
} from '../lib/financial';

/**
 * Overhead breakdown for audit purposes
 */
export interface OverheadBreakdown {
  readonly directAmount: Decimal;
  readonly indirectOverhead: Decimal;
  readonly sharedServicesOverhead: Decimal;
  readonly totalOverhead: Decimal;
  readonly fullyLoadedAmount: Decimal;
}

/**
 * OverheadAllocator class for applying overhead rates
 */
export class OverheadAllocator {
  private readonly overheadFactorMap: Map<string, OverheadFactor>;
  private readonly defaultOverheadFactor: OverheadFactor;
  private readonly rateVersion: string;

  constructor(
    overheadFactors: readonly OverheadFactor[],
    rateVersion: string = '1.0.0'
  ) {
    // Build overhead factor lookup map by cost center
    this.overheadFactorMap = new Map(
      overheadFactors.map(of => [of.costCenterId, of])
    );

    // Default overhead factor when cost center not found
    this.defaultOverheadFactor = {
      costCenterId: 'DEFAULT',
      directRate: 1.0,
      indirectRate: 0.0,
      sharedServicesRate: 0.0,
      effectiveDate: new Date().toISOString(),
    };

    this.rateVersion = rateVersion;
  }

  /**
   * Applies overhead rates to compute the fully loaded amount.
   *
   * Formula:
   * - Direct Amount = Base Amount * Direct Rate
   * - Indirect Overhead = Base Amount * Indirect Rate
   * - Shared Services Overhead = Base Amount * Shared Services Rate
   * - Total Overhead = Indirect Overhead + Shared Services Overhead
   * - Fully Loaded Amount = Direct Amount + Total Overhead
   */
  public applyOverhead(
    decisionRecordId: UUID,
    costCenterId: string,
    baseAmount: string
  ): OverheadAttribution {
    const breakdown = this.calculateOverheadBreakdown(costCenterId, baseAmount);

    return {
      decisionRecordId,
      costCenterId,
      directAmount: toCurrency(breakdown.directAmount),
      indirectOverhead: toCurrency(breakdown.indirectOverhead),
      sharedServicesOverhead: toCurrency(breakdown.sharedServicesOverhead),
      totalOverhead: toCurrency(breakdown.totalOverhead),
      fullyLoadedAmount: toCurrency(breakdown.fullyLoadedAmount),
      overheadRateVersion: this.rateVersion,
    };
  }

  /**
   * Calculates the detailed overhead breakdown for a given amount.
   */
  public calculateOverheadBreakdown(
    costCenterId: string,
    baseAmount: string
  ): OverheadBreakdown {
    const factor = this.getOverheadFactor(costCenterId);
    const amount = toDecimal(baseAmount);

    // Calculate each component
    const directAmount = multiply(amount, factor.directRate.toString());
    const indirectOverhead = multiply(amount, factor.indirectRate.toString());
    const sharedServicesOverhead = multiply(amount, factor.sharedServicesRate.toString());

    // Total overhead = indirect + shared services
    const totalOverhead = add(indirectOverhead, sharedServicesOverhead);

    // Fully loaded = direct + total overhead
    const fullyLoadedAmount = add(directAmount, totalOverhead);

    return {
      directAmount,
      indirectOverhead,
      sharedServicesOverhead,
      totalOverhead,
      fullyLoadedAmount,
    };
  }

  /**
   * Gets the overhead factor for a cost center.
   * Falls back to default if not found.
   */
  public getOverheadFactor(costCenterId: string): OverheadFactor {
    return this.overheadFactorMap.get(costCenterId) ?? this.defaultOverheadFactor;
  }

  /**
   * Checks if a cost center has explicit overhead factors defined.
   */
  public hasOverheadFactor(costCenterId: string): boolean {
    return this.overheadFactorMap.has(costCenterId);
  }

  /**
   * Gets the total overhead rate for a cost center.
   */
  public getTotalOverheadRate(costCenterId: string): number {
    const factor = this.getOverheadFactor(costCenterId);
    return factor.indirectRate + factor.sharedServicesRate;
  }

  /**
   * Gets the fully loaded rate multiplier for a cost center.
   * This is direct rate + indirect rate + shared services rate.
   */
  public getFullyLoadedMultiplier(costCenterId: string): number {
    const factor = this.getOverheadFactor(costCenterId);
    return factor.directRate + factor.indirectRate + factor.sharedServicesRate;
  }

  /**
   * Aggregates overhead for multiple cost centers.
   * Returns the total overhead breakdown.
   */
  public aggregateOverhead(
    allocations: readonly { costCenterId: string; amount: string }[]
  ): OverheadBreakdown {
    let directAmount = zero();
    let indirectOverhead = zero();
    let sharedServicesOverhead = zero();

    for (const allocation of allocations) {
      const breakdown = this.calculateOverheadBreakdown(
        allocation.costCenterId,
        allocation.amount
      );
      directAmount = add(directAmount, breakdown.directAmount);
      indirectOverhead = add(indirectOverhead, breakdown.indirectOverhead);
      sharedServicesOverhead = add(sharedServicesOverhead, breakdown.sharedServicesOverhead);
    }

    const totalOverhead = add(indirectOverhead, sharedServicesOverhead);
    const fullyLoadedAmount = add(directAmount, totalOverhead);

    return {
      directAmount,
      indirectOverhead,
      sharedServicesOverhead,
      totalOverhead,
      fullyLoadedAmount,
    };
  }

  /**
   * Gets the rate version for audit tracking.
   */
  public getRateVersion(): string {
    return this.rateVersion;
  }
}
