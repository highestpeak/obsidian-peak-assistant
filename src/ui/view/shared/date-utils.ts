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
 * Format timestamp as relative time (e.g., "2 days ago", "3 weeks ago")
 * Uses timezone-aware date comparison: if timestamp is before today's 0:00, use day/week/month, otherwise use hours/minutes
 */
export function formatRelativeTime(timestamp: number): string {
	const now = Date.now();
	const dateObj = new Date(timestamp);
	const nowDate = new Date(now);
	
	// Get today's date at 0:00 in local timezone
	const today = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
	
	// Check if timestamp is before today's 0:00
	const isBeforeToday = timestamp < today.getTime();
	
	if (isBeforeToday) {
		// Use day/week/month/year for dates before today
		const diffMs = now - timestamp;
		const diffSeconds = Math.floor(diffMs / 1000);
		const diffMinutes = Math.floor(diffSeconds / 60);
		const diffHours = Math.floor(diffMinutes / 60);
		const diffDays = Math.floor(diffHours / 24);
		const diffWeeks = Math.floor(diffDays / 7);
		const diffMonths = Math.floor(diffDays / 30);
		const diffYears = Math.floor(diffDays / 365);
		
		if (diffDays < 7) {
			return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
		} else if (diffWeeks < 4) {
			return `${diffWeeks} ${diffWeeks === 1 ? 'week' : 'weeks'} ago`;
		} else if (diffMonths < 12) {
			return `${diffMonths} ${diffMonths === 1 ? 'month' : 'months'} ago`;
		} else {
			return 'more than one year ago';
		}
	} else {
		// Use minutes/hours for today's timestamps
		const diffMs = now - timestamp;
		const diffSeconds = Math.floor(diffMs / 1000);
		const diffMinutes = Math.floor(diffSeconds / 60);
		const diffHours = Math.floor(diffMinutes / 60);
		
		if (diffSeconds < 60) {
			return 'just now';
		} else if (diffMinutes < 60) {
			return `${diffMinutes} ${diffMinutes === 1 ? 'minute' : 'minutes'} ago`;
		} else {
			return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
		}
	}
}

