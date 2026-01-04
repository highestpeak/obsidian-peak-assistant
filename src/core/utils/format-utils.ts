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

