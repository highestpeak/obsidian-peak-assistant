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