import React from 'react';
import { useProjectStore } from '@/ui/store/projectStore';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/ui/component/shared-ui/hover-card';
import { IconButton } from '@/ui/component/shared-ui/icon-button';
import { Brain } from 'lucide-react';

/**
 * Popover component for displaying conversation summary
 */
export const SummaryPopover: React.FC = () => {
	const conversation = useProjectStore((state) => state.activeConversation);

	const summary = conversation?.context?.shortSummary || conversation?.context?.fullSummary;

	if (!conversation) {
		return null;
	}

	return (
		<HoverCard openDelay={200} closeDelay={300}>
			<HoverCardTrigger asChild>
				<IconButton
					size="lg"
					title="View conversation summary"
				>
					<Brain className="pktw-w-4 pktw-h-4" />
				</IconButton>
			</HoverCardTrigger>
			<HoverCardContent
				className="pktw-w-[400px] pktw-max-w-[90vw] pktw-p-4 pktw-bg-white pktw-shadow-lg"
				align="end"
				side="bottom"
				sideOffset={8}
				collisionPadding={16}
			>
				<div className="pktw-flex pktw-flex-col pktw-gap-2">
					<div className="pktw-text-lg pktw-font-semibold pktw-border-b pktw-border-border pktw-pb-2">
						Conversation Summary
					</div>
					{summary ? (
						<div className="pktw-whitespace-pre-wrap pktw-text-sm pktw-text-foreground pktw-select-text pktw-max-h-[400px] pktw-overflow-y-auto">
							{summary}
						</div>
					) : (
						<div className="pktw-text-sm pktw-text-muted-foreground pktw-text-center pktw-py-4">
							No summary available
						</div>
					)}
				</div>
			</HoverCardContent>
		</HoverCard>
	);
};

