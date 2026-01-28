/**
 * Simple in-memory TTL cache implementation
 * Used for caching model metadata and other provider data
 */
interface CacheEntry<T> {
	value: T;
	expiresAt: number;
}

export class TTLCache<T> {
	private cache = new Map<string, CacheEntry<T>>();
	private defaultTTL: number;

	/**
	 * @param defaultTTLMs - Default TTL in milliseconds (default: 30 minutes)
	 */
	constructor(defaultTTLMs: number = 30 * 60 * 1000) {
		this.defaultTTL = defaultTTLMs;
	}

	/**
	 * Get value from cache
	 */
	get(key: string): T | undefined {
		const entry = this.cache.get(key);
		if (!entry) {
			return undefined;
		}

		// Check if expired
		if (Date.now() > entry.expiresAt) {
			this.cache.delete(key);
			return undefined;
		}

		return entry.value;
	}

	/**
	 * Set value in cache
	 */
	set(key: string, value: T, ttlMs?: number): void {
		const ttl = ttlMs ?? this.defaultTTL;
		this.cache.set(key, {
			value,
			expiresAt: Date.now() + ttl,
		});
	}

	/**
	 * Clear all cache entries
	 */
	clear(): void {
		this.cache.clear();
	}

	/**
	 * Clear expired entries
	 */
	clearExpired(): void {
		const now = Date.now();
		const keysToDelete: string[] = [];
		this.cache.forEach((entry, key) => {
			if (now > entry.expiresAt) {
				keysToDelete.push(key);
			}
		});
		keysToDelete.forEach(key => this.cache.delete(key));
	}

	/**
	 * Delete specific key
	 */
	delete(key: string): boolean {
		return this.cache.delete(key);
	}

	/**
	 * Check if key exists and is not expired
	 */
	has(key: string): boolean {
		const entry = this.cache.get(key);
		if (!entry) {
			return false;
		}

		if (Date.now() > entry.expiresAt) {
			this.cache.delete(key);
			return false;
		}

		return true;
	}

	/**
	 * Get cache size
	 */
	size(): number {
		this.clearExpired();
		return this.cache.size;
	}
}

/**
 * Global cache instance for model metadata
 * TTL: 30 minutes
 */
export const modelMetadataCache = new TTLCache<any>(30 * 60 * 1000);
