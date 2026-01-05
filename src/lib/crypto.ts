/**
 * Cryptographic utilities for checksums and hashing.
 * Used for audit trail and reproducibility verification.
 */

import * as crypto from 'crypto';

/**
 * Computes SHA-256 hash of input data.
 * Returns lowercase hex string (64 characters).
 */
export function computeSHA256(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Computes SHA-256 hash of a JSON-serializable object.
 * Uses deterministic JSON serialization (sorted keys).
 */
export function computeObjectHash(obj: unknown): string {
  const json = JSON.stringify(obj, sortedReplacer);
  return computeSHA256(json);
}

/**
 * JSON replacer function that sorts object keys for deterministic serialization.
 */
function sortedReplacer(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce((sorted: Record<string, unknown>, key) => {
        sorted[key] = (value as Record<string, unknown>)[key];
        return sorted;
      }, {});
  }
  return value;
}

/**
 * Computes a chain hash by combining multiple hashes.
 * Used for Merkle-tree style audit trails.
 */
export function computeChainHash(hashes: readonly string[]): string {
  const combined = hashes.join('');
  return computeSHA256(combined);
}

/**
 * Verifies that a hash matches the expected value.
 */
export function verifyHash(data: string | Buffer, expectedHash: string): boolean {
  const actualHash = computeSHA256(data);
  return actualHash === expectedHash.toLowerCase();
}

/**
 * Generates a random nonce for uniqueness.
 */
export function generateNonce(bytes: number = 16): string {
  return crypto.randomBytes(bytes).toString('hex');
}
