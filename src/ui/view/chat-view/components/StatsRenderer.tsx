import React, { useMemo } from 'react';
import { useProjectStore } from '@/ui/store/projectStore';
import { formatTokenCount, formatDuration } from '@/ui/view/shared/date-utils';

/**
 * Render conversation statistics
 */
export const StatsRendererComponent: React.FC = () => {
	const conversation = useProjectStore((state) => state.activeConversation);

	const { messageCount, tokenUsage, durationText } = useMemo(() => {
		if (!conversation) {
			return {
				messageCount: 0,
				tokenUsage: 0,
				durationText: '',
			};
		}

		return {
			messageCount: conversation.messages.length,
			tokenUsage: conversation.meta.tokenUsageTotal || 0,
			durationText: formatDuration(
				conversation.meta.createdAtTimestamp,
				conversation.meta.updatedAtTimestamp
			),
		};
	}, [conversation]);

	if (!conversation) return null;

	return (
		<div className="pktw-flex pktw-items-center pktw-gap-4 pktw-text-xs">
			{/* Messages count */}
			<div className="pktw-flex pktw-flex-col">
				<span className="pktw-text-muted-foreground">Messages</span>
				<span className="pktw-text-foreground pktw-font-medium">{messageCount}</span>
			</div>

			{/* Tokens */}
			<div className="pktw-flex pktw-flex-col">
				<span className="pktw-text-muted-foreground">Tokens</span>
				<span className="pktw-text-foreground pktw-font-medium">{formatTokenCount(tokenUsage)}</span>
			</div>

			{/* Duration */}
			<div className="pktw-flex pktw-flex-col">
				<span className="pktw-text-muted-foreground">Duration</span>
				<span className="pktw-text-foreground pktw-font-medium">{durationText}</span>
			</div>
		</div>
	);
};

