/**
 * Decimal Arithmetic Library
 * Provides precise decimal arithmetic for financial calculations.
 * Uses decimal.js to avoid IEEE 754 floating-point errors.
 */

import Decimal from 'decimal.js';

// Configure decimal.js for financial precision
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -9,
  toExpPos: 9,
});

// Standard precision for currency (4 decimal places)
const CURRENCY_PRECISION = 4;

/**
 * Creates a Decimal from a string or number.
 * Throws if the input is invalid.
 */
export function toDecimal(value: string | number): Decimal {
  try {
    return new Decimal(value);
  } catch {
    throw new Error(`Invalid decimal value: ${value}`);
  }
}

/**
 * Converts a Decimal to a string with fixed precision.
 */
export function toString(value: Decimal, precision: number = CURRENCY_PRECISION): string {
  return value.toFixed(precision);
}

/**
 * Adds two decimal values.
 */
export function add(a: string | Decimal, b: string | Decimal): Decimal {
  const da = a instanceof Decimal ? a : toDecimal(a);
  const db = b instanceof Decimal ? b : toDecimal(b);
  return da.plus(db);
}

/**
 * Subtracts b from a.
 */
export function subtract(a: string | Decimal, b: string | Decimal): Decimal {
  const da = a instanceof Decimal ? a : toDecimal(a);
  const db = b instanceof Decimal ? b : toDecimal(b);
  return da.minus(db);
}

/**
 * Multiplies two decimal values.
 */
export function multiply(a: string | Decimal, b: string | Decimal): Decimal {
  const da = a instanceof Decimal ? a : toDecimal(a);
  const db = b instanceof Decimal ? b : toDecimal(b);
  return da.times(db);
}

/**
 * Divides a by b.
 * Throws if b is zero.
 */
export function divide(a: string | Decimal, b: string | Decimal): Decimal {
  const da = a instanceof Decimal ? a : toDecimal(a);
  const db = b instanceof Decimal ? b : toDecimal(b);
  if (db.isZero()) {
    throw new Error('Division by zero');
  }
  return da.dividedBy(db);
}

/**
 * Returns the absolute value.
 */
export function abs(value: string | Decimal): Decimal {
  const d = value instanceof Decimal ? value : toDecimal(value);
  return d.abs();
}

/**
 * Returns the negative of a value.
 */
export function negate(value: string | Decimal): Decimal {
  const d = value instanceof Decimal ? value : toDecimal(value);
  return d.negated();
}

/**
 * Raises base to exponent.
 */
export function pow(base: string | Decimal, exponent: number): Decimal {
  const d = base instanceof Decimal ? base : toDecimal(base);
  return d.pow(exponent);
}

/**
 * Returns the minimum of multiple values.
 */
export function min(...values: (string | Decimal)[]): Decimal {
  if (values.length === 0) {
    throw new Error('min requires at least one value');
  }
  const decimals = values.map(v => v instanceof Decimal ? v : toDecimal(v));
  return Decimal.min(...decimals);
}

/**
 * Returns the maximum of multiple values.
 */
export function max(...values: (string | Decimal)[]): Decimal {
  if (values.length === 0) {
    throw new Error('max requires at least one value');
  }
  const decimals = values.map(v => v instanceof Decimal ? v : toDecimal(v));
  return Decimal.max(...decimals);
}

/**
 * Sums an array of decimal values.
 */
export function sum(values: readonly (string | Decimal)[]): Decimal {
  return values.reduce<Decimal>(
    (acc, val) => add(acc, val),
    new Decimal(0)
  );
}

/**
 * Compares two decimal values.
 * Returns -1 if a < b, 0 if a == b, 1 if a > b.
 */
export function compare(a: string | Decimal, b: string | Decimal): -1 | 0 | 1 {
  const da = a instanceof Decimal ? a : toDecimal(a);
  const db = b instanceof Decimal ? b : toDecimal(b);
  return da.comparedTo(db) as -1 | 0 | 1;
}

/**
 * Checks if a value is zero.
 */
export function isZero(value: string | Decimal): boolean {
  const d = value instanceof Decimal ? value : toDecimal(value);
  return d.isZero();
}

/**
 * Checks if a value is positive.
 */
export function isPositive(value: string | Decimal): boolean {
  const d = value instanceof Decimal ? value : toDecimal(value);
  return d.isPositive() && !d.isZero();
}

/**
 * Checks if a value is negative.
 */
export function isNegative(value: string | Decimal): boolean {
  const d = value instanceof Decimal ? value : toDecimal(value);
  return d.isNegative();
}

/**
 * Rounds to a specific number of decimal places.
 */
export function round(value: string | Decimal, decimalPlaces: number = CURRENCY_PRECISION): Decimal {
  const d = value instanceof Decimal ? value : toDecimal(value);
  return d.toDecimalPlaces(decimalPlaces, Decimal.ROUND_HALF_UP);
}

/**
 * Calculates percentage: (value / total) * 100
 */
export function percentage(value: string | Decimal, total: string | Decimal): Decimal {
  const dValue = value instanceof Decimal ? value : toDecimal(value);
  const dTotal = total instanceof Decimal ? total : toDecimal(total);
  if (dTotal.isZero()) {
    return new Decimal(0);
  }
  return dValue.dividedBy(dTotal).times(100);
}

/**
 * Applies a percentage to a value: value * (percentage / 100)
 */
export function applyPercentage(value: string | Decimal, pct: number): Decimal {
  const dValue = value instanceof Decimal ? value : toDecimal(value);
  return dValue.times(pct).dividedBy(100);
}

/**
 * Currency-specific formatting with 4 decimal places.
 */
export function toCurrency(value: Decimal): string {
  return toString(value, CURRENCY_PRECISION);
}

/**
 * Creates a zero decimal.
 */
export function zero(): Decimal {
  return new Decimal(0);
}

/**
 * Creates a decimal from 1.
 */
export function one(): Decimal {
  return new Decimal(1);
}

// Re-export Decimal type for use in other modules
export { Decimal };
