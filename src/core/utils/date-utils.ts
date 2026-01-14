/**
 * Format timestamp as relative time (e.g., "2 days ago", "3 weeks ago")
 * Uses timezone-aware date comparison: if timestamp is before today's 0:00, use day/week/month, otherwise use hours/minutes
 * eg:
 *  "just now",
 *  "1 minute ago",
 *  "1 hour ago",
 *  "1 day ago",
 *  "1 week ago",
 *  "1 month ago",
 *  "1 year ago",
 *  "more than one year ago"
 */
export function humanReadableTime(timestamp: number): string {
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

/**
 * Parse semantic filter string for time ranges ("today", "yesterday", etc) into a Date object.
 * 
 * Supported: "today", "yesterday", "this_week", "this_month", "last_3_months", "this_year"
 * Returns the start time (00:00:00) of the period in local time as a Date.
 * Throws for unsupported input.
 */
export function parseSemanticDateRange(semantic: 'today' | 'yesterday' | 'this_week' | 'this_month' | 'last_3_months' | 'this_year'): Date {
	const now = new Date();
	switch (semantic) {
		case "today": {
			return new Date(now.getFullYear(), now.getMonth(), now.getDate());
		}
		case "yesterday": {
			const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
			d.setDate(d.getDate() - 1);
			return d;
		}
		case "this_week": {
			// ISO week starts on Monday, but users may expect Sunday as start. We'll use local week start.
			const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
			const dayOfWeek = d.getDay(); // 0 = Sunday, 1 = Monday ... 6 = Saturday
			// Back up to Sunday
			d.setDate(d.getDate() - dayOfWeek);
			return d;
		}
		case "this_month": {
			return new Date(now.getFullYear(), now.getMonth(), 1);
		}
		case "last_3_months": {
			return new Date(now.getFullYear(), now.getMonth() - 2, 1); // 2 months ago, 1st day
		}
		case "this_year": {
			return new Date(now.getFullYear(), 0, 1);
		}
		default: {
			throw new Error("Unknown semantic date filter: " + semantic);
		}
	}
}
