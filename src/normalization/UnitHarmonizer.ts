/**
 * UnitHarmonizer
 * Converts currencies, time units, and quantity measures to standard units.
 * All conversions are deterministic using immutable rate tables.
 */

import { CurrencyCode } from '../contracts';
import {
  Decimal,
  toDecimal,
  multiply,
  divide,
  toString,
} from '../lib/financial';

// ============================================================================
// Types
// ============================================================================

/**
 * Currency exchange rate entry.
 * Rate is the amount of target currency per 1 unit of source currency.
 */
export interface ExchangeRate {
  readonly sourceCurrency: CurrencyCode;
  readonly targetCurrency: CurrencyCode;
  readonly rate: string; // Decimal string
  readonly effectiveDate: string; // ISO8601
}

/**
 * Time unit types supported by the harmonizer.
 */
export enum TimeUnit {
  MILLISECONDS = 'MILLISECONDS',
  SECONDS = 'SECONDS',
  MINUTES = 'MINUTES',
  HOURS = 'HOURS',
  DAYS = 'DAYS',
  WEEKS = 'WEEKS',
  MONTHS = 'MONTHS',
  QUARTERS = 'QUARTERS',
  YEARS = 'YEARS',
}

/**
 * Quantity unit types.
 */
export enum QuantityUnit {
  UNITS = 'UNITS',
  THOUSANDS = 'THOUSANDS',
  MILLIONS = 'MILLIONS',
  BILLIONS = 'BILLIONS',
  FTE = 'FTE',
  FTE_HOURS = 'FTE_HOURS',
  FTE_MONTHS = 'FTE_MONTHS',
  COMPUTE_HOURS = 'COMPUTE_HOURS',
  GB = 'GB',
  TB = 'TB',
  PB = 'PB',
  LICENSES = 'LICENSES',
}

/**
 * Result of a currency conversion.
 */
export interface CurrencyConversionResult {
  readonly originalAmount: string;
  readonly originalCurrency: CurrencyCode;
  readonly convertedAmount: string;
  readonly targetCurrency: CurrencyCode;
  readonly exchangeRate: string;
  readonly effectiveDate: string;
}

/**
 * Result of a time unit conversion.
 */
export interface TimeConversionResult {
  readonly originalValue: number;
  readonly originalUnit: TimeUnit;
  readonly convertedValue: number;
  readonly targetUnit: TimeUnit;
  readonly conversionFactor: number;
}

/**
 * Result of a quantity conversion.
 */
export interface QuantityConversionResult {
  readonly originalValue: string;
  readonly originalUnit: QuantityUnit;
  readonly convertedValue: string;
  readonly targetUnit: QuantityUnit;
  readonly conversionFactor: string;
}

// ============================================================================
// Time Conversion Constants (in milliseconds)
// ============================================================================

const TIME_IN_MS: Record<TimeUnit, number> = {
  [TimeUnit.MILLISECONDS]: 1,
  [TimeUnit.SECONDS]: 1000,
  [TimeUnit.MINUTES]: 60 * 1000,
  [TimeUnit.HOURS]: 60 * 60 * 1000,
  [TimeUnit.DAYS]: 24 * 60 * 60 * 1000,
  [TimeUnit.WEEKS]: 7 * 24 * 60 * 60 * 1000,
  [TimeUnit.MONTHS]: 30 * 24 * 60 * 60 * 1000, // Average month (30 days)
  [TimeUnit.QUARTERS]: 91 * 24 * 60 * 60 * 1000, // Approx quarter (91 days)
  [TimeUnit.YEARS]: 365 * 24 * 60 * 60 * 1000, // Non-leap year
};

// Working hours per time period (standard 8-hour day, 5-day week)
const WORKING_HOURS: Record<TimeUnit, number> = {
  [TimeUnit.MILLISECONDS]: 1 / (60 * 60 * 1000),
  [TimeUnit.SECONDS]: 1 / 3600,
  [TimeUnit.MINUTES]: 1 / 60,
  [TimeUnit.HOURS]: 1,
  [TimeUnit.DAYS]: 8, // 8 working hours per day
  [TimeUnit.WEEKS]: 40, // 40 hours per week
  [TimeUnit.MONTHS]: 160, // ~160 working hours per month
  [TimeUnit.QUARTERS]: 480, // ~480 working hours per quarter
  [TimeUnit.YEARS]: 1920, // ~1920 working hours per year (48 weeks)
};

// ============================================================================
// Quantity Conversion Factors (relative to base unit)
// ============================================================================

const QUANTITY_FACTORS: Record<QuantityUnit, string> = {
  [QuantityUnit.UNITS]: '1',
  [QuantityUnit.THOUSANDS]: '1000',
  [QuantityUnit.MILLIONS]: '1000000',
  [QuantityUnit.BILLIONS]: '1000000000',
  [QuantityUnit.FTE]: '1', // Base unit for FTE
  [QuantityUnit.FTE_HOURS]: '0.000625', // 1/1600 (annual FTE hours)
  [QuantityUnit.FTE_MONTHS]: '0.0833333', // 1/12 (months per year)
  [QuantityUnit.COMPUTE_HOURS]: '1', // Base unit for compute
  [QuantityUnit.GB]: '1', // Base unit for storage
  [QuantityUnit.TB]: '1024', // 1 TB = 1024 GB
  [QuantityUnit.PB]: '1048576', // 1 PB = 1024 TB
  [QuantityUnit.LICENSES]: '1', // Base unit for licenses
};

// ============================================================================
// UnitHarmonizer Class
// ============================================================================

export class UnitHarmonizer {
  private readonly exchangeRates: Map<string, ExchangeRate>;
  private readonly baseCurrency: CurrencyCode;

  /**
   * Creates a new UnitHarmonizer with the given exchange rates.
   * @param exchangeRates Immutable exchange rate table
   * @param baseCurrency The target currency for all conversions
   */
  constructor(
    exchangeRates: readonly ExchangeRate[],
    baseCurrency: CurrencyCode
  ) {
    this.exchangeRates = new Map();
    this.baseCurrency = baseCurrency;

    // Build exchange rate lookup map
    // Sort for deterministic processing
    const sorted = [...exchangeRates].sort((a, b) => {
      const keyA = `${a.sourceCurrency}-${a.targetCurrency}-${a.effectiveDate}`;
      const keyB = `${b.sourceCurrency}-${b.targetCurrency}-${b.effectiveDate}`;
      return keyA.localeCompare(keyB);
    });

    for (const rate of sorted) {
      const key = this.getRateKey(rate.sourceCurrency, rate.targetCurrency);
      const existing = this.exchangeRates.get(key);
      // Keep the most recent rate for each pair
      if (!existing || rate.effectiveDate > existing.effectiveDate) {
        this.exchangeRates.set(key, rate);
      }
    }
  }

  // ============================================================================
  // Currency Conversion
  // ============================================================================

  /**
   * Converts an amount from one currency to the base currency.
   */
  convertToBaseCurrency(
    amount: string,
    sourceCurrency: CurrencyCode
  ): CurrencyConversionResult {
    return this.convertCurrency(amount, sourceCurrency, this.baseCurrency);
  }

  /**
   * Converts an amount from one currency to another.
   */
  convertCurrency(
    amount: string,
    sourceCurrency: CurrencyCode,
    targetCurrency: CurrencyCode
  ): CurrencyConversionResult {
    // Same currency - no conversion needed
    if (sourceCurrency === targetCurrency) {
      return {
        originalAmount: amount,
        originalCurrency: sourceCurrency,
        convertedAmount: amount,
        targetCurrency,
        exchangeRate: '1.0000',
        effectiveDate: new Date().toISOString(),
      };
    }

    // Try direct rate
    const directKey = this.getRateKey(sourceCurrency, targetCurrency);
    let rate = this.exchangeRates.get(directKey);

    if (rate) {
      const converted = multiply(amount, rate.rate);
      return {
        originalAmount: amount,
        originalCurrency: sourceCurrency,
        convertedAmount: toString(converted),
        targetCurrency,
        exchangeRate: rate.rate,
        effectiveDate: rate.effectiveDate,
      };
    }

    // Try inverse rate
    const inverseKey = this.getRateKey(targetCurrency, sourceCurrency);
    rate = this.exchangeRates.get(inverseKey);

    if (rate) {
      const inverseRate = divide('1', rate.rate);
      const converted = multiply(amount, inverseRate);
      return {
        originalAmount: amount,
        originalCurrency: sourceCurrency,
        convertedAmount: toString(converted),
        targetCurrency,
        exchangeRate: toString(inverseRate),
        effectiveDate: rate.effectiveDate,
      };
    }

    // Try triangulation through base currency
    if (sourceCurrency !== this.baseCurrency && targetCurrency !== this.baseCurrency) {
      const toBase = this.convertCurrency(amount, sourceCurrency, this.baseCurrency);
      const fromBase = this.convertCurrency(
        toBase.convertedAmount,
        this.baseCurrency,
        targetCurrency
      );

      // Calculate effective rate
      const effectiveRate = divide(fromBase.convertedAmount, amount);

      return {
        originalAmount: amount,
        originalCurrency: sourceCurrency,
        convertedAmount: fromBase.convertedAmount,
        targetCurrency,
        exchangeRate: toString(effectiveRate),
        effectiveDate: fromBase.effectiveDate,
      };
    }

    // No rate found - throw error
    throw new Error(
      `No exchange rate found for ${sourceCurrency} to ${targetCurrency}`
    );
  }

  /**
   * Gets the exchange rate between two currencies.
   */
  getExchangeRate(
    sourceCurrency: CurrencyCode,
    targetCurrency: CurrencyCode
  ): string | undefined {
    if (sourceCurrency === targetCurrency) {
      return '1.0000';
    }

    const directKey = this.getRateKey(sourceCurrency, targetCurrency);
    const rate = this.exchangeRates.get(directKey);

    if (rate) {
      return rate.rate;
    }

    const inverseKey = this.getRateKey(targetCurrency, sourceCurrency);
    const inverseRate = this.exchangeRates.get(inverseKey);

    if (inverseRate) {
      return toString(divide('1', inverseRate.rate));
    }

    return undefined;
  }

  /**
   * Checks if a currency conversion is available.
   */
  canConvert(sourceCurrency: CurrencyCode, targetCurrency: CurrencyCode): boolean {
    if (sourceCurrency === targetCurrency) {
      return true;
    }
    return this.getExchangeRate(sourceCurrency, targetCurrency) !== undefined;
  }

  // ============================================================================
  // Time Unit Conversion
  // ============================================================================

  /**
   * Converts a time value from one unit to another.
   * Uses calendar-based conversion (not working hours).
   */
  convertTime(
    value: number,
    sourceUnit: TimeUnit,
    targetUnit: TimeUnit
  ): TimeConversionResult {
    if (sourceUnit === targetUnit) {
      return {
        originalValue: value,
        originalUnit: sourceUnit,
        convertedValue: value,
        targetUnit,
        conversionFactor: 1,
      };
    }

    // Convert to milliseconds, then to target unit
    const valueInMs = value * TIME_IN_MS[sourceUnit];
    const convertedValue = valueInMs / TIME_IN_MS[targetUnit];
    const conversionFactor = TIME_IN_MS[sourceUnit] / TIME_IN_MS[targetUnit];

    return {
      originalValue: value,
      originalUnit: sourceUnit,
      convertedValue,
      targetUnit,
      conversionFactor,
    };
  }

  /**
   * Converts time to working hours.
   * Useful for FTE and labor calculations.
   */
  convertToWorkingHours(value: number, sourceUnit: TimeUnit): number {
    return value * WORKING_HOURS[sourceUnit];
  }

  /**
   * Converts working hours to a target time unit.
   */
  convertFromWorkingHours(hours: number, targetUnit: TimeUnit): number {
    return hours / WORKING_HOURS[targetUnit];
  }

  /**
   * Standardizes time to months (the standard unit for ROI calculations).
   */
  standardizeToMonths(value: number, sourceUnit: TimeUnit): number {
    return this.convertTime(value, sourceUnit, TimeUnit.MONTHS).convertedValue;
  }

  /**
   * Converts a duration in milliseconds to the most appropriate unit.
   */
  humanizeTime(milliseconds: number): { value: number; unit: TimeUnit } {
    if (milliseconds >= TIME_IN_MS[TimeUnit.YEARS]) {
      return {
        value: milliseconds / TIME_IN_MS[TimeUnit.YEARS],
        unit: TimeUnit.YEARS
      };
    }
    if (milliseconds >= TIME_IN_MS[TimeUnit.MONTHS]) {
      return {
        value: milliseconds / TIME_IN_MS[TimeUnit.MONTHS],
        unit: TimeUnit.MONTHS
      };
    }
    if (milliseconds >= TIME_IN_MS[TimeUnit.WEEKS]) {
      return {
        value: milliseconds / TIME_IN_MS[TimeUnit.WEEKS],
        unit: TimeUnit.WEEKS
      };
    }
    if (milliseconds >= TIME_IN_MS[TimeUnit.DAYS]) {
      return {
        value: milliseconds / TIME_IN_MS[TimeUnit.DAYS],
        unit: TimeUnit.DAYS
      };
    }
    if (milliseconds >= TIME_IN_MS[TimeUnit.HOURS]) {
      return {
        value: milliseconds / TIME_IN_MS[TimeUnit.HOURS],
        unit: TimeUnit.HOURS
      };
    }
    if (milliseconds >= TIME_IN_MS[TimeUnit.MINUTES]) {
      return {
        value: milliseconds / TIME_IN_MS[TimeUnit.MINUTES],
        unit: TimeUnit.MINUTES
      };
    }
    if (milliseconds >= TIME_IN_MS[TimeUnit.SECONDS]) {
      return {
        value: milliseconds / TIME_IN_MS[TimeUnit.SECONDS],
        unit: TimeUnit.SECONDS
      };
    }
    return { value: milliseconds, unit: TimeUnit.MILLISECONDS };
  }

  // ============================================================================
  // Quantity Conversion
  // ============================================================================

  /**
   * Converts a quantity from one unit to another.
   */
  convertQuantity(
    value: string,
    sourceUnit: QuantityUnit,
    targetUnit: QuantityUnit
  ): QuantityConversionResult {
    if (sourceUnit === targetUnit) {
      return {
        originalValue: value,
        originalUnit: sourceUnit,
        convertedValue: value,
        targetUnit,
        conversionFactor: '1',
      };
    }

    const sourceFactor = toDecimal(QUANTITY_FACTORS[sourceUnit]);
    const targetFactor = toDecimal(QUANTITY_FACTORS[targetUnit]);
    const conversionFactor = divide(sourceFactor, targetFactor);
    const converted = multiply(value, conversionFactor);

    return {
      originalValue: value,
      originalUnit: sourceUnit,
      convertedValue: toString(converted),
      targetUnit,
      conversionFactor: toString(conversionFactor),
    };
  }

  /**
   * Normalizes a quantity to the base unit of its category.
   */
  normalizeQuantity(value: string, unit: QuantityUnit): Decimal {
    const factor = toDecimal(QUANTITY_FACTORS[unit]);
    return multiply(value, factor);
  }

  /**
   * Converts FTE to hours based on annual working hours.
   */
  fteToHours(fteValue: string, annualWorkingHours: number = 1920): string {
    const hours = multiply(fteValue, annualWorkingHours.toString());
    return toString(hours);
  }

  /**
   * Converts hours to FTE based on annual working hours.
   */
  hoursToFte(hours: string, annualWorkingHours: number = 1920): string {
    const fte = divide(hours, annualWorkingHours.toString());
    return toString(fte);
  }

  // ============================================================================
  // Unit String Parsing
  // ============================================================================

  /**
   * Parses a unit string to determine the time unit.
   */
  parseTimeUnit(unitString: string): TimeUnit {
    const normalized = unitString.toLowerCase().trim();

    const mappings: Record<string, TimeUnit> = {
      'ms': TimeUnit.MILLISECONDS,
      'millisecond': TimeUnit.MILLISECONDS,
      'milliseconds': TimeUnit.MILLISECONDS,
      's': TimeUnit.SECONDS,
      'sec': TimeUnit.SECONDS,
      'second': TimeUnit.SECONDS,
      'seconds': TimeUnit.SECONDS,
      'm': TimeUnit.MINUTES,
      'min': TimeUnit.MINUTES,
      'minute': TimeUnit.MINUTES,
      'minutes': TimeUnit.MINUTES,
      'h': TimeUnit.HOURS,
      'hr': TimeUnit.HOURS,
      'hour': TimeUnit.HOURS,
      'hours': TimeUnit.HOURS,
      'd': TimeUnit.DAYS,
      'day': TimeUnit.DAYS,
      'days': TimeUnit.DAYS,
      'w': TimeUnit.WEEKS,
      'wk': TimeUnit.WEEKS,
      'week': TimeUnit.WEEKS,
      'weeks': TimeUnit.WEEKS,
      'mo': TimeUnit.MONTHS,
      'month': TimeUnit.MONTHS,
      'months': TimeUnit.MONTHS,
      'q': TimeUnit.QUARTERS,
      'qtr': TimeUnit.QUARTERS,
      'quarter': TimeUnit.QUARTERS,
      'quarters': TimeUnit.QUARTERS,
      'y': TimeUnit.YEARS,
      'yr': TimeUnit.YEARS,
      'year': TimeUnit.YEARS,
      'years': TimeUnit.YEARS,
    };

    const unit = mappings[normalized];
    if (!unit) {
      throw new Error(`Unknown time unit: ${unitString}`);
    }
    return unit;
  }

  /**
   * Parses a unit string to determine the quantity unit.
   */
  parseQuantityUnit(unitString: string): QuantityUnit {
    const normalized = unitString.toLowerCase().trim();

    const mappings: Record<string, QuantityUnit> = {
      'unit': QuantityUnit.UNITS,
      'units': QuantityUnit.UNITS,
      'k': QuantityUnit.THOUSANDS,
      'thousand': QuantityUnit.THOUSANDS,
      'thousands': QuantityUnit.THOUSANDS,
      'm': QuantityUnit.MILLIONS,
      'million': QuantityUnit.MILLIONS,
      'millions': QuantityUnit.MILLIONS,
      'b': QuantityUnit.BILLIONS,
      'billion': QuantityUnit.BILLIONS,
      'billions': QuantityUnit.BILLIONS,
      'fte': QuantityUnit.FTE,
      'fte-hours': QuantityUnit.FTE_HOURS,
      'fte-months': QuantityUnit.FTE_MONTHS,
      'compute-hours': QuantityUnit.COMPUTE_HOURS,
      'compute_hours': QuantityUnit.COMPUTE_HOURS,
      'gb': QuantityUnit.GB,
      'gigabyte': QuantityUnit.GB,
      'gigabytes': QuantityUnit.GB,
      'tb': QuantityUnit.TB,
      'terabyte': QuantityUnit.TB,
      'terabytes': QuantityUnit.TB,
      'pb': QuantityUnit.PB,
      'petabyte': QuantityUnit.PB,
      'petabytes': QuantityUnit.PB,
      'license': QuantityUnit.LICENSES,
      'licenses': QuantityUnit.LICENSES,
    };

    const unit = mappings[normalized];
    if (!unit) {
      throw new Error(`Unknown quantity unit: ${unitString}`);
    }
    return unit;
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Gets the base currency for this harmonizer.
   */
  getBaseCurrency(): CurrencyCode {
    return this.baseCurrency;
  }

  /**
   * Gets all available exchange rates.
   */
  getAvailableRates(): readonly ExchangeRate[] {
    return Array.from(this.exchangeRates.values()).sort((a, b) => {
      const keyA = `${a.sourceCurrency}-${a.targetCurrency}`;
      const keyB = `${b.sourceCurrency}-${b.targetCurrency}`;
      return keyA.localeCompare(keyB);
    });
  }

  /**
   * Gets the list of currencies that can be converted.
   */
  getAvailableCurrencies(): readonly CurrencyCode[] {
    const currencies = new Set<CurrencyCode>();
    for (const rate of Array.from(this.exchangeRates.values())) {
      currencies.add(rate.sourceCurrency);
      currencies.add(rate.targetCurrency);
    }
    return Array.from(currencies).sort();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private getRateKey(source: CurrencyCode, target: CurrencyCode): string {
    return `${source}-${target}`;
  }
}
