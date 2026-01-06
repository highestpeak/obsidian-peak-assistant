/**
 * Mock crypto module for browser environment
 * Uses synchronous hash functions for compatibility
 */

/**
 * Simple synchronous SHA-256-like hash function
 * Note: This is a simplified implementation for development purposes
 * For production, consider using a proper crypto library
 */
function sha256Sync(data: Uint8Array): string {
	// Simple hash function that produces consistent results
	// This is not cryptographically secure but works for ID generation
	let hash = 0;
	const prime = 31;
	
	for (let i = 0; i < data.length; i++) {
		hash = ((hash * prime) + data[i]) & 0xffffffff;
	}
	
	// Convert to hex and pad to 64 characters (SHA-256 length)
	const hex = Math.abs(hash).toString(16);
	return (hex.repeat(8) + '0'.repeat(64)).substring(0, 64);
}

/**
 * Simple synchronous MD5-like hash function
 */
function md5Sync(data: Uint8Array): string {
	let hash = 0;
	for (let i = 0; i < data.length; i++) {
		const char = data[i];
		hash = ((hash << 5) - hash) + char;
		hash = hash & hash; // Convert to 32-bit integer
	}
	// Convert to positive hex string
	const hex = Math.abs(hash).toString(16).padStart(8, '0');
	// Repeat to get 32 characters (MD5 length)
	return (hex.repeat(4) + '0'.repeat(32)).substring(0, 32);
}

/**
 * Create a hash object
 */
export function createHash(algorithm: string) {
	if (algorithm !== 'sha256' && algorithm !== 'md5') {
		throw new Error(`Unsupported algorithm: ${algorithm}. Only sha256 and md5 are supported.`);
	}

	let buffer = new Uint8Array(0);

	return {
		update(data: string | Uint8Array): typeof this {
			const encoder = new TextEncoder();
			const dataBytes = typeof data === 'string' ? encoder.encode(data) : data;
			const newBuffer = new Uint8Array(buffer.length + dataBytes.length);
			newBuffer.set(buffer);
			newBuffer.set(dataBytes, buffer.length);
			buffer = newBuffer;
			return this;
		},
		digest(encoding: 'hex' | 'base64'): string {
			let hash: string;
			if (algorithm === 'sha256') {
				hash = sha256Sync(buffer);
			} else if (algorithm === 'md5') {
				hash = md5Sync(buffer);
			} else {
				throw new Error(`Unsupported algorithm: ${algorithm}`);
			}
			
			if (encoding === 'hex') {
				return hash;
			} else {
				// Convert hex to base64
				const bytes = new Uint8Array(hash.length / 2);
				for (let i = 0; i < hash.length; i += 2) {
					bytes[i / 2] = parseInt(hash.substr(i, 2), 16);
				}
				return btoa(String.fromCharCode(...bytes));
			}
		},
		digestSync(encoding: 'hex' | 'base64'): string {
			return this.digest(encoding);
		},
	};
}

