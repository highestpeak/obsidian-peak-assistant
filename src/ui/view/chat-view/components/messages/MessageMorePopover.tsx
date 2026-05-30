import React from 'react';
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
	PopoverItem,
	IconButton,
} from '@/ui/components/primitives';
import { Code, Copy, FileJson, MessageSquare, MoreHorizontal, Trash2 } from 'lucide-react';
import { CHAT_STRINGS } from '../../chatStrings';

/**
 * MessageMorePopover — overflow menu for per-message actions that don't
 * belong in the always-visible meta row. Hangs off the trailing "More" icon
 * on the message meta row.
 *
 * Items render only when their corresponding handler is supplied so callers
 * can scope the menu to operations actually supported by the backend.
 */
export interface MessageMorePopoverProps {
	onViewRaw?: () => void;
	onCopyMarkdown?: () => void;
	onCopyJson?: () => void;
	onReplyInline?: () => void;
	onDelete?: () => void;
}

export const MessageMorePopover: React.FC<MessageMorePopoverProps> = ({
	onViewRaw,
	onCopyMarkdown,
	onCopyJson,
	onReplyInline,
	onDelete,
}) => {
	const items = [
		onViewRaw && {
			key: 'view-raw',
			label: CHAT_STRINGS.message.moreViewRaw,
			icon: <Code />,
			onClick: onViewRaw,
		},
		onCopyMarkdown && {
			key: 'copy-markdown',
			label: CHAT_STRINGS.message.moreCopyMarkdown,
			icon: <Copy />,
			onClick: onCopyMarkdown,
		},
		onCopyJson && {
			key: 'copy-json',
			label: CHAT_STRINGS.message.moreCopyJson,
			icon: <FileJson />,
			onClick: onCopyJson,
		},
		onReplyInline && {
			key: 'reply-inline',
			label: CHAT_STRINGS.message.moreReplyInline,
			icon: <MessageSquare />,
			onClick: onReplyInline,
		},
	].filter(Boolean) as Array<{ key: string; label: string; icon: React.ReactNode; onClick: () => void }>;

	if (items.length === 0 && !onDelete) return null;

	return (
		<Popover>
			<PopoverTrigger asChild>
				<IconButton
					label={CHAT_STRINGS.message.moreLabel}
					title={CHAT_STRINGS.message.moreLabel}
					className="pkchat-msg__action pkchat-msg__action--more"
				>
					<MoreHorizontal />
				</IconButton>
			</PopoverTrigger>
			<PopoverContent align="end" sideOffset={6}>
				{items.map((item) => (
					<PopoverItem key={item.key} onClick={item.onClick}>
						{item.icon}
						<span>{item.label}</span>
					</PopoverItem>
				))}
				{onDelete && (
					<PopoverItem
						className="pk-pop-item pkchat-msg__action--danger"
						onClick={onDelete}
					>
						<Trash2 />
						<span>{CHAT_STRINGS.message.moreDelete}</span>
					</PopoverItem>
				)}
			</PopoverContent>
		</Popover>
	);
};
