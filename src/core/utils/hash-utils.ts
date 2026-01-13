/**
 * Hash utility functions for generating stable hashes from strings.
 * 
 * Note: These are simple hash functions, not cryptographically secure.
 * They are suitable for:
 * - Deduplication
 * - Cache invalidation
 * - Stable ID generation
 * - Content fingerprinting
 * 
 * For cryptographic purposes, use crypto.subtle.digest instead.
 */
import { createHash } from 'crypto';

/**
 * Simple hash function using DJB2-like algorithm.
 * Fast and produces stable hashes for the same input.
 * 
 * @param str String to hash
 * @returns Hash value as a number (32-bit integer)
 */
function computeHash(str: string): number {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash = hash & hash; // Convert to 32-bit integer
	}
	return hash;
}

/**
 * Generate a hash from a string and return it as a hex string.
 * 
 * @param str String to hash
 * @param minLength Minimum length of the output (padded with zeros). Default is 8.
 * @returns Hex string representation of the hash
 */
export function hashString(str: string, minLength: number = 8): string {
	const hash = computeHash(str);
	return Math.abs(hash).toString(16).padStart(minLength, '0');
}

/**
 * Generate a hash from a string and return it as a base36 string.
 * 
 * @param str String to hash
 * @returns Base36 string representation of the hash
 */
export function hashStringBase36(str: string): string {
	const hash = computeHash(str);
	return Math.abs(hash).toString(36);
}

/**
 * Generate a hash from content (alias for hashString for backward compatibility).
 * 
 * @param content Content string to hash
 * @returns Hex string representation of the hash
 */
export function generateContentHash(content: string): string {
	return hashString(content, 8);
}

export function binaryContentHash(data: Buffer | Uint8Array | ArrayBuffer): string {
	let buffer: Buffer;
	if (Buffer.isBuffer(data)) {
		buffer = data;
	} else if (data instanceof ArrayBuffer) {
		buffer = Buffer.from(data);
	} else {
		// Uint8Array
		buffer = Buffer.from(data);
	}
	return createHash('md5').update(buffer).digest('hex');
}

/**
 * Calculate MD5 hash of a string using Node.js crypto module.
 * Falls back to simple hash if crypto.createHash is not available.
 * 
 * @param str String to hash
 * @returns Hex string representation of the MD5 hash (32 characters)
 */
export function hashMD5(str: string): string {
	try {
		// Use Node.js crypto module if available
		// In browser, this will use the crypto mock via Vite alias
		return createHash('md5').update(str).digest('hex');
	} catch (error) {
		// Fallback to simple hash if crypto is not available (e.g., in browser)
		console.warn('MD5 hash not available, using simple hash fallback:', error);
		return hashString(str, 32);
	}
}

/**
 * Calculate SHA-256 hash of a File object.
 * Falls back to simple hash if crypto.subtle is not available.
 * 
 * @param file File object to hash
 * @returns Promise that resolves to hex string of the hash
 */
export async function calculateFileHash(file: File): Promise<string> {
	if (typeof crypto === 'undefined' || !crypto.subtle) {
		// Fallback to simple hash if crypto is not available
		return hashString(file.name + file.size + file.lastModified, 8);
	}

	try {
		const arrayBuffer = await file.arrayBuffer();
		const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
		return hashHex;
	} catch (error) {
		console.error('Failed to calculate file hash:', error);
		// Fallback to simple hash
		return hashString(file.name + file.size + file.lastModified, 8);
	}
}

