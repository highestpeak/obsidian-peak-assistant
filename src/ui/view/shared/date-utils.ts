/**
 * Format duration between two timestamps
 */
export function formatDuration(startTimestamp: number, endTimestamp: number): string {
	const durationMs = endTimestamp - startTimestamp;
	const seconds = Math.floor(durationMs / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);
	
	if (days > 0) {
		return `${days}d ${hours % 24}h`;
	} else if (hours > 0) {
		return `${hours}h ${minutes % 60}m`;
	} else if (minutes > 0) {
		return `${minutes}m`;
	}
	return `${seconds}s`;
}

/**
 * Format token count with K/M suffix
 */
export function formatTokenCount(count: number): string {
	if (count >= 1000000) {
		return `${(count / 1000000).toFixed(1)}M`;
	} else if (count >= 1000) {
		return `${(count / 1000).toFixed(1)}K`;
	}
	return count.toString();
}

/**
 * Format date relative to now
 */
export function formatRelativeDate(timestamp: number): string {
	const dateObj = new Date(timestamp);
	const now = new Date();
	const diffTime = now.getTime() - dateObj.getTime();
	const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
	
	if (diffDays === 0) {
		return 'Today';
	} else if (diffDays === 1) {
		return 'Yesterday';
	} else if (diffDays < 7) {
		return `${diffDays} days ago`;
	} else {
		const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
		return `${monthNames[dateObj.getMonth()]} ${dateObj.getDate()}`;
	}
}

