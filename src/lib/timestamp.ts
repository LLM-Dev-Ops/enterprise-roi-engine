/**
 * Timestamp utilities for ISO8601 handling.
 * All timestamps are UTC.
 */

/**
 * Returns current UTC timestamp in ISO8601 format.
 */
export function currentUTCTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Parses an ISO8601 string to Date.
 * Throws if invalid.
 */
export function parseISO8601(timestamp: string): Date {
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid ISO8601 timestamp: ${timestamp}`);
  }
  return date;
}

/**
 * Checks if a timestamp is in the future.
 */
export function isFutureTimestamp(timestamp: string): boolean {
  const date = parseISO8601(timestamp);
  return date.getTime() > Date.now();
}

/**
 * Checks if a timestamp is older than the specified hours.
 */
export function isOlderThan(timestamp: string, hours: number): boolean {
  const date = parseISO8601(timestamp);
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return date.getTime() < cutoff;
}

/**
 * Adds months to a date and returns ISO8601 string.
 */
export function addMonths(date: Date | string, months: number): string {
  const d = typeof date === 'string' ? parseISO8601(date) : new Date(date);
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

/**
 * Gets the difference in months between two dates.
 */
export function monthsDifference(start: string, end: string): number {
  const startDate = parseISO8601(start);
  const endDate = parseISO8601(end);

  const yearDiff = endDate.getFullYear() - startDate.getFullYear();
  const monthDiff = endDate.getMonth() - startDate.getMonth();

  return yearDiff * 12 + monthDiff;
}

/**
 * Formats a date as a fiscal period string.
 */
export function toFiscalPeriod(date: Date | string, fiscalYearStart: number = 1): string {
  const d = typeof date === 'string' ? parseISO8601(date) : new Date(date);
  const month = d.getMonth() + 1; // 1-indexed
  const year = d.getFullYear();

  // Adjust for fiscal year
  const fiscalYear = month >= fiscalYearStart ? year : year - 1;
  const fiscalMonth = ((month - fiscalYearStart + 12) % 12) + 1;

  return `FY${fiscalYear}-P${fiscalMonth.toString().padStart(2, '0')}`;
}
