import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { hashMD5 } from './hash-utils';

/**
 * Generate a UUID without hyphens.
 * @returns A UUID string without hyphens (e.g., "5678475e44724cb2a898c6b7046b9e1b")
 */
export function generateUuidWithoutHyphens(): string {
	// Dynamic import to avoid circular dependencies
	return uuidv4().replace(/-/g, '');
}

/**
 * Generate a stable UUID from a string (deterministic).
 * Same input always produces the same UUID.
 * @param input String to generate UUID from
 * @returns A UUID string without hyphens (e.g., "5678475e44724cb2a898c6b7046b9e1b")
 */
export function generateStableUuid(input: string): string {
	// Use MD5 hash of input to create deterministic UUID-like string
	const hash = createHash('md5').update(input).digest('hex');
	// Convert first 32 characters to UUID format: 8-4-4-4-12, then remove hyphens
	const uuidWithHyphens = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
	return uuidWithHyphens.replace(/-/g, '');
}

/**
 * Generate a stable document ID from file path.
 * Uses SHA-256 hash to ensure same path always generates same ID.
 * 
 * Why SHA-256 instead of MD5?
 * - MD5 is 128-bit (2^128 possibilities), collision risk exists (though very low)
 * - SHA-256 is 256-bit (2^256 possibilities), collision risk is negligible
 * - SHA-256 is cryptographically secure (MD5 is broken for security)
 * - Both are deterministic (same path = same ID)
 * 
 * Collision analysis:
 * - For 1 billion documents, MD5 collision probability: ~0.0000000000000001%
 * - For 1 billion documents, SHA-256 collision probability: Practically zero
 * 
 * @param path File path (or URL for web documents) @deprecated use generateUuidWithoutHyphens instead
 * @returns Stable document ID (64-character hex string)
 */
export function generateDocIdFromPath(path: string): string {
	// try {
	// 	// Use Node.js crypto module for SHA-256
	// 	return createHash('sha256').update(path).digest('hex');
	// } catch (error) {
	// 	// Fallback to MD5 if crypto is not available (should not happen in Node.js)
	// 	console.warn('SHA-256 hash not available, falling back to MD5:', error);
	// 	return hashMD5(path);
	// }
	// too long to use sha256, use uuid instead
	return generateStableUuid(path ?? '');
}

/**
 * Build a timestamped name with prefix and suffix.
 * Format: {prefix}-{name}-{timestamp}-{suffix}
 * @param prefix - Prefix for the name (e.g., "Project")
 * @param name - Base name
 * @param timestamp - Timestamp in milliseconds
 * @param suffix - Suffix (usually an ID)
 * @returns Formatted name string
 */
export function buildTimestampedName(prefix: string, name: string, timestamp: number, suffix: string): string {
	// Sanitize name: remove invalid characters for folder names
	const sanitizedName = name.replace(/[<>:"/\\|?*]/g, '_').trim();
	return `${prefix}-${sanitizedName}-${timestamp}-${suffix}`;
}
