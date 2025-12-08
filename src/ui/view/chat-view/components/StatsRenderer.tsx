import React, { useMemo, useState } from 'react';
import { useProjectStore } from '@/ui/store/projectStore';
import { formatTokenCount, formatDuration } from '@/ui/view/shared/date-utils';

/**
 * Render conversation statistics with hover tooltip
 */
export const StatsRendererComponent: React.FC = () => {
	const conversation = useProjectStore((state) => state.activeConversation);
	const [isHovered, setIsHovered] = useState(false);

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

	const formattedTokens = formatTokenCount(tokenUsage);

	return (
		<div 
			className="pktw-relative pktw-inline-block"
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			{/* Pill-shaped tokens display */}
			<div className="pktw-inline-flex pktw-items-center pktw-px-3 pktw-py-1.5 pktw-rounded-full pktw-bg-muted pktw-border pktw-border-border pktw-text-xs pktw-font-medium pktw-text-foreground pktw-cursor-pointer pktw-transition-colors hover:pktw-bg-muted/80">
				<span>tokens: {formattedTokens} token</span>
			</div>

			{/* Hover tooltip with all stats */}
			{isHovered && (
				<div 
					className="pktw-absolute pktw-right-0 pktw-top-full pktw-pt-1 pktw-z-50"
					onMouseEnter={() => setIsHovered(true)}
					onMouseLeave={() => setIsHovered(false)}
				>
					<div className="pktw-bg-card pktw-border pktw-border-border pktw-rounded-lg pktw-shadow-lg pktw-p-3 pktw-min-w-[160px]">
						<div className="pktw-flex pktw-flex-col pktw-gap-2 pktw-text-xs">
							{/* Messages count */}
							<div className="pktw-flex pktw-items-center pktw-justify-between">
								<span className="pktw-text-muted-foreground">Messages</span>
								<span className="pktw-text-foreground pktw-font-medium">{messageCount}</span>
							</div>

							{/* Tokens */}
							<div className="pktw-flex pktw-items-center pktw-justify-between">
								<span className="pktw-text-muted-foreground">Tokens</span>
								<span className="pktw-text-foreground pktw-font-medium">{formattedTokens}</span>
							</div>

							{/* Duration */}
							<div className="pktw-flex pktw-items-center pktw-justify-between">
								<span className="pktw-text-muted-foreground">Duration</span>
								<span className="pktw-text-foreground pktw-font-medium">{durationText}</span>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

