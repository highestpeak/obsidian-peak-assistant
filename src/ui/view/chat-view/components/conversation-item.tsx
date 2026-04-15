import React from 'react';
import { ChatConversation } from '@/service/chat/types';
import { formatRelativeDate } from '@/ui/view/shared/date-utils';
import { cn } from '@/ui/react/lib/utils';
import { MessageSquare, Calendar, Trash2 } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';

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
 * Unified conversation item component
 * Provides consistent styling and hover effects across different views
 */
export const ConversationItem: React.FC<ConversationItemProps> = ({
	conversation,
	onClick,
	onDelete,
	showIcon = true,
	showDate = true,
	maxPreviewLength = 150,
	className,
}) => {
	const previewText = conversation.messages.length > 0
		? conversation.messages[0].content.substring(0, maxPreviewLength)
		: '';

	return (
		<div
			className={cn(
				'pktw-group pktw-p-4 pktw-transition-all pktw-cursor-pointer pktw-border pktw-border-solid pktw-border-border-default pktw-rounded-lg pktw-shadow-sm pktw-bg-card',
				'hover:pktw-shadow-lg hover:pktw-border-border-hover',
				className
			)}
			onClick={() => onClick(conversation)}
		>
			<div className="pktw-flex pktw-items-center pktw-justify-between">
				<div className="pktw-flex pktw-items-center pktw-gap-3 pktw-flex-1">
					{showIcon && (
						<div className="pktw-p-2 pktw-rounded-lg pktw-bg-muted">
							<MessageSquare className="pktw-h-5 pktw-w-5 pktw-text-muted-foreground" />
						</div>
					)}
					<div className="pktw-flex-1">
						<div className="pktw-text-sm pktw-font-medium pktw-text-foreground">
							{conversation.meta.title}
						</div>
						{previewText && (
							<div className="pktw-text-xs pktw-text-muted-foreground pktw-mt-0.5 pktw-line-clamp-2">
								{previewText}
								{conversation.messages[0].content.length > maxPreviewLength ? '...' : ''}
							</div>
						)}
					</div>
				</div>
				<div className="pktw-flex pktw-items-center pktw-gap-1">
					{showDate && conversation.meta.createdAtTimestamp && (
						<div className="pktw-flex pktw-items-center pktw-gap-1 pktw-text-xs pktw-text-muted-foreground">
							<Calendar className="pktw-h-3 pktw-w-3" />
							{formatRelativeDate(conversation.meta.createdAtTimestamp)}
						</div>
					)}
					{onDelete && (
						<Button
							variant="ghost"
							size="icon"
							className="pktw-h-6 pktw-w-6 pktw-opacity-0 group-hover:pktw-opacity-100 pktw-transition-opacity pktw-text-muted-foreground hover:pktw-text-destructive"
							onClick={(e) => { e.stopPropagation(); onDelete(conversation); }}
						>
							<Trash2 className="pktw-h-3.5 pktw-w-3.5" />
						</Button>
					)}
				</div>
			</div>
		</div>
	);
};

