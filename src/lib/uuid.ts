/**
 * UUID generation utilities.
 * Uses uuid v4 for random UUIDs.
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Generates a new UUID v4.
 */
export function generateUUID(): string {
  return uuidv4();
}

/**
 * Validates that a string is a valid UUID.
 */
export function isValidUUID(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}
