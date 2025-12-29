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

