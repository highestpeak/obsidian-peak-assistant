import React from 'react';
import { useChatStudioStrings } from '../chatStudioStringsContext';
import type { ChatStudioStrings } from '../chatStudioStrings';

interface DateSeparatorProps {
	date: Date;
}

/**
 * DateSeparator — mock `.date-separator`: two hairline rules flanking a small
 * tertiary label (10px, no uppercase / no bold). The calendar day carries the
 * full-timestamp information the message rows deliberately drop (M3).
 */
export const DateSeparator: React.FC<DateSeparatorProps> = ({ date }) => {
	const studioStrings = useChatStudioStrings();
	const label = formatDateLabel(date, studioStrings);
	return (
		<div className="pktw-flex pktw-items-center pktw-gap-3 pktw-my-4">
			<div className="pktw-flex-1 pktw-h-px pktw-bg-pk-border-soft" />
			<span className="pktw-text-pk-xs pktw-text-pk-text-tertiary">{label}</span>
			<div className="pktw-flex-1 pktw-h-px pktw-bg-pk-border-soft" />
		</div>
	);
};

function formatDateLabel(date: Date, strings: ChatStudioStrings): string {
	const now = new Date();
	const diff = Math.floor((now.getTime() - date.getTime()) / 86400000);
	if (diff === 0) return strings.messages.dateToday;
	if (diff === 1) return strings.messages.dateYesterday;
	// Locale-neutral month/day — respects the user's locale rather than forcing en-US.
	return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
