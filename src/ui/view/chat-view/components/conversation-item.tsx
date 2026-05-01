import React from 'react';
import { ChatConversation } from '@/service/chat/types';
import { formatRelativeDate } from '@/core/utils/date-utils';
import { cn } from '@/ui/react/lib/utils';
import { Trash2 } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import {
	ConversationType,
	DEFAULT_CONVERSATION_TYPE,
	getConversationTypeLabel,
	getConversationTypeBadgeColor,
} from '@/service/chat/conversation-types';
import { ConversationTypeIcon } from '@/ui/component/mine/ConversationTypeIcon';

export interface ConversationItemProps {
	conversation: ChatConversation;
	onClick: (conversation: ChatConversation) => void;
	onDelete?: (conversation: ChatConversation) => void;
	showIcon?: boolean;
	showDate?: boolean;
	maxPreviewLength?: number;
	className?: string;
}

/**
 * Two-row conversation item component
 * Row 1: type icon + title (truncated) + relative date
 * Row 2: type badge (only for non-chat types)
 */
export const ConversationItem: React.FC<ConversationItemProps> = ({
	conversation,
	onClick,
	onDelete,
	showIcon = true,
	showDate = true,
	className,
}) => {
	const convType: ConversationType =
		conversation.meta.conversationType ?? DEFAULT_CONVERSATION_TYPE;
	const typeLabel = getConversationTypeLabel(convType);
	const badgeColor = getConversationTypeBadgeColor(convType);

	return (
		<div
			className={cn(
				'pktw-group pktw-px-3 pktw-py-2.5 pktw-transition-all pktw-cursor-pointer pktw-border pktw-border-solid pktw-border-border-default pktw-rounded-lg pktw-shadow-sm pktw-bg-card',
				'hover:pktw-shadow-lg hover:pktw-border-border-hover',
				className
			)}
			onClick={() => onClick(conversation)}
		>
			{/* Row 1: icon + title + date + delete */}
			<div className="pktw-flex pktw-items-center pktw-gap-2">
				{showIcon && (
					<ConversationTypeIcon type={convType} className="pktw-w-3.5 pktw-h-3.5 pktw-flex-shrink-0 pktw-text-muted-foreground" />
				)}
				<span className="pktw-flex-1 pktw-text-sm pktw-font-medium pktw-text-foreground pktw-truncate pktw-min-w-0">
					{conversation.meta.title}
				</span>
				{showDate && conversation.meta.createdAtTimestamp && (
					<span className="pktw-text-[11px] pktw-text-muted-foreground pktw-flex-shrink-0 pktw-whitespace-nowrap">
						{formatRelativeDate(conversation.meta.createdAtTimestamp)}
					</span>
				)}
				{onDelete && (
					<Button
						variant="ghost"
						size="icon"
						className="pktw-h-6 pktw-w-6 pktw-opacity-0 group-hover:pktw-opacity-100 pktw-transition-opacity pktw-text-muted-foreground hover:pktw-text-destructive pktw-flex-shrink-0"
						onClick={(e) => { e.stopPropagation(); onDelete(conversation); }}
					>
						<Trash2 className="pktw-h-3.5 pktw-w-3.5" />
					</Button>
				)}
			</div>

			{/* Row 2: type badge (only for non-chat types) */}
			{typeLabel && badgeColor && (
				<div
					className={cn(
						'pktw-mt-1',
						showIcon ? 'pktw-ml-6' : 'pktw-ml-0'
					)}
				>
					<span
						className="pktw-inline-flex pktw-items-center pktw-rounded pktw-px-1.5 pktw-py-0.5 pktw-text-[10px] pktw-font-medium"
						style={{ backgroundColor: badgeColor.bg, color: badgeColor.fg }}
					>
						{typeLabel}
					</span>
				</div>
			)}
		</div>
	);
};
