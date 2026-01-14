import { BooleanExpressionParser } from "@/service/tools/search-graph-inspector/boolean-expression-parser";
import { parseSemanticDateRange } from "./date-utils";

/**
 * Format a number with K/M suffix for large numbers
 * @param count - The number to format
 * @returns Formatted string (e.g., "1.5K", "2.3M", "123")
 */
export function formatCount(count: number): string {
	if (count >= 1000000) {
		return `${(count / 1000000).toFixed(1)}M`;
	}
	if (count >= 1000) {
		return `${(count / 1000).toFixed(1)}K`;
	}
	return count.toString();
}

/**
 * Format duration in milliseconds to human-readable string
 * @param ms - Duration in milliseconds
 * @returns Formatted string (e.g., "123ms", "8.1s", "2.5m")
 */
export function formatDuration(ms: number): string {
	if (ms < 1000) {
		return `${Math.round(ms)}ms`;
	}
	if (ms < 60000) {
		return `${(ms / 1000).toFixed(1)}s`;
	}
	return `${(ms / 60000).toFixed(1)}m`;
}

/**
 * Format token count to human-readable string
 * @param tokens - Token count
 * @returns Formatted string (e.g., "123", "10k", "1.5M")
 */
export function formatTokenCount(tokens: number): string {
	if (tokens >= 1000000) {
		return `${(tokens / 1000000).toFixed(1)}M`;
	}
	if (tokens >= 1000) {
		return `${Math.round(tokens / 1000)}k`;
	}
	return tokens.toString();
}

/**
 * Format max context for display (e.g., 200000 -> "200K", 1000000 -> "1M")
 */
export function formatMaxContext(maxCtx?: number): string | undefined {
	if (!maxCtx) return undefined;
	if (maxCtx >= 1000000) {
		return `${Math.round(maxCtx / 1000000)}M`;
	}
	if (maxCtx >= 1000) {
		return `${Math.round(maxCtx / 1000)}K`;
	}
	return String(maxCtx);
}


export function trimTrailingSlash(url: string): string {
	return url.endsWith('/') ? url.slice(0, -1) : url;
}

/**
 * Simple LRU Cache implementation with TTL support
 */
class LRUCache<T> {
	private cache = new Map<string, { value: T; timestamp: number }>();
	private maxSize: number;
	private ttl: number; // Time to live in milliseconds
	private cleanupInterval: number;
	private cleanupTimer?: NodeJS.Timeout;

	/**
	 * @param ttl 10min
	 * @param cleanupInterval 5s
	 */
	constructor(maxSize: number = 100, ttl: number = 600000, cleanupInterval: number = 5000) {
		this.maxSize = maxSize;
		this.ttl = ttl;
		this.cleanupInterval = cleanupInterval;
		this.startCleanupTimer();
	}

	private startCleanupTimer(): void {
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer);
		}
		this.cleanupTimer = setInterval(() => {
			this.cleanup();
		}, this.cleanupInterval);
	}

	private cleanup(): void {
		const now = Date.now();
		const keysToDelete: string[] = [];

		for (const [key, entry] of this.cache) {
			if (now - entry.timestamp > this.ttl) {
				keysToDelete.push(key);
			}
		}

		keysToDelete.forEach(key => this.cache.delete(key));
	}

	get(key: string): T | undefined {
		const entry = this.cache.get(key);
		if (!entry) return undefined;

		const now = Date.now();
		if (now - entry.timestamp > this.ttl) {
			this.cache.delete(key);
			return undefined;
		}

		// Move to end (most recently used)
		this.cache.delete(key);
		this.cache.set(key, { value: entry.value, timestamp: now });
		return entry.value;
	}

	set(key: string, value: T): void {
		const now = Date.now();

		if (this.cache.has(key)) {
			this.cache.delete(key);
		} else if (this.cache.size >= this.maxSize) {
			// Remove least recently used (first item)
			const firstKey = this.cache.keys().next().value;
			this.cache.delete(firstKey);
		}
		this.cache.set(key, { value, timestamp: now });
	}

	has(key: string): boolean {
		const entry = this.cache.get(key);
		if (!entry) return false;

		const now = Date.now();
		if (now - entry.timestamp > this.ttl) {
			this.cache.delete(key);
			return false;
		}
		return true;
	}

	clear(): void {
		this.cache.clear();
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer);
			this.cleanupTimer = undefined;
		}
	}

	size(): number {
		// Clean expired entries before returning size
		this.cleanup();
		return this.cache.size;
	}

	// Clean up timer when instance is no longer needed
	destroy(): void {
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer);
			this.cleanupTimer = undefined;
		}
	}
}

/**
 * Global regex cache for path filtering
 * Caches compiled RegExp objects to avoid recompilation
 */
const regexCache = new LRUCache<RegExp>(50);

/**
 * Get or create a cached RegExp
 * @param pattern - The regex pattern string
 * @returns Compiled RegExp object
 */
export function getCachedRegex(pattern: string): RegExp {
	let regex = regexCache.get(pattern);
	if (!regex) {
		try {
			regex = new RegExp(pattern);
			regexCache.set(pattern, regex);
		} catch (e) {
			console.error('[getCachedRegex] Error compiling regex:', e);
			// If pattern is invalid, return a regex that matches nothing
			regex = /^$/;
		}
	}
	return regex;
}

const semanticDateRangeCache = new LRUCache<Date>(30);

export function getCachedSemanticDateRange(semantic: string): Date {
	let date = semanticDateRangeCache.get(semantic);
	if (!date) {
		date = parseSemanticDateRange(semantic as any);
		semanticDateRangeCache.set(semantic, date);
	}
	return date;
}

const booleanExpressionCache = new LRUCache<BooleanExpressionParser>(50);
export function getCachedBooleanExpression(expression: string | undefined): BooleanExpressionParser | null {
	if (!expression) return null;
	let parser = booleanExpressionCache.get(expression);
	if (!parser) {
		parser = new BooleanExpressionParser(expression);
		booleanExpressionCache.set(expression, parser);
	}
	return parser;
}