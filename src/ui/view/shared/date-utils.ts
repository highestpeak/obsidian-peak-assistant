// todo: move to core/utils/date-utils.ts in a separate commit
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
 * Uses timezone-aware date comparison based on today's 0:00
 */
export function formatRelativeDate(timestamp: number): string {
	const dateObj = new Date(timestamp);
	const now = new Date();

	// Get today's date at 0:00 in local timezone
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

	// Get the date at 0:00 in local timezone for the timestamp
	const targetDate = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());

	// Calculate difference in days
	const diffMs = today.getTime() - targetDate.getTime();
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

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

/**
 * Format timestamp as locale string with timezone support
 */
export function formatTimestampLocale(timestamp: number, timeZone?: string): string {
	const date = new Date(timestamp);
	return date.toLocaleString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		timeZone: timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
	});
}

/**
 * Detect the local timezone or fall back to UTC.
 */
export function detectTimezone(): string {
	try {
		const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
		return detected || 'UTC';
	} catch (error) {
		return 'UTC';
	}
}