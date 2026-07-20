/**
 * MessageMorePopover — overflow popover consuming the shared message action
 * registry (chat-studio §12.3, MSG-07..09).
 *
 * The registry lives in `../../actions/messageActionRegistry.ts` — this
 * component only renders what the caller passes in `overflow`. Inline row
 * and this popover share the same registry entries; there is exactly one
 * handler per action id.
 *
 * Any future destructive action with a real service handler renders in the
 * destructive group at the bottom with a confirm dialog, never inline. The UI
 * never advertises placeholder actions.
 */

import React, { useState } from 'react';
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
	PopoverItem,
	IconButton,
	Modal,
	Button,
} from '@/ui/components/primitives';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import type { MessageActionDefinition, MessageActionContext } from '../../actions/messageActionRegistry';
import type { ChatStudioStrings } from '../../chatStudioStrings';
import { useChatStrings } from '../../chatStringsContext';

export interface MessageMorePopoverProps {
	overflow: MessageActionDefinition[];
	ctx: MessageActionContext;
	studioStrings: ChatStudioStrings;
	/**
	 * When true and there are zero overflow items, the More trigger is
	 * suppressed entirely (MSG-08: wide → no More button).
	 */
	hideWhenEmpty?: boolean;
}

export const MessageMorePopover: React.FC<MessageMorePopoverProps> = ({
	overflow,
	ctx,
	studioStrings,
	hideWhenEmpty = true,
}) => {
	const chatStrings = useChatStrings();
	const [confirmDelete, setConfirmDelete] = useState<MessageActionDefinition | null>(null);

	if (hideWhenEmpty && overflow.length === 0) return null;

	const regular = overflow.filter((a) => !a.destructive);
	const destructive = overflow.filter((a) => a.destructive);

	const handleClick = (action: MessageActionDefinition) => {
		if (action.destructive) {
			setConfirmDelete(action);
			return;
		}
		void action.execute(ctx);
	};

	return (
		<>
			<Popover>
				<PopoverTrigger asChild>
					<IconButton
						label={chatStrings.message.moreLabel}
						title={chatStrings.message.moreLabel}
						className="pkchat-msg__action pkchat-msg__action--more"
					>
						<MoreHorizontal />
					</IconButton>
				</PopoverTrigger>
				<PopoverContent align="end" sideOffset={6}>
					{regular.map((action) => {
						const Icon = action.icon;
						const disabled = action.disabledReason?.(ctx.message, studioStrings) != null;
						const title = disabled ? action.disabledReason!(ctx.message, studioStrings)! : undefined;
						const detail = action.detail?.(studioStrings);
						return (
							<PopoverItem
								key={action.id}
								onClick={() => !disabled && handleClick(action)}
								title={title}
								className={cn(
									'pkchat-msg-more-item',
									disabled && 'pk-pop-item--disabled',
								)}
							>
								<Icon />
								{detail ? (
									<span className="pkchat-msg-more-item__text">
										<strong>{action.label(studioStrings)}</strong>
										<small>{detail}</small>
									</span>
								) : (
									<span>{action.label(studioStrings)}</span>
								)}
							</PopoverItem>
						);
					})}
					{destructive.length > 0 && (
						<>
							<div className="pkchat-msg__suggest-divider" />
							{destructive.map((action) => {
								const Icon = action.icon;
								return (
									<PopoverItem
										key={action.id}
										className="pk-pop-item pkchat-msg__action--danger"
										onClick={() => handleClick(action)}
									>
										<Icon />
										<span>{action.label(studioStrings)}</span>
									</PopoverItem>
								);
							})}
						</>
					)}
				</PopoverContent>
			</Popover>

			{confirmDelete && (
				<Modal open onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}>
					<Modal.Content>
						<Modal.Header>
							<Modal.Title>{confirmDelete.label(studioStrings)}</Modal.Title>
							<Modal.Close />
						</Modal.Header>
						<Modal.Body>
							<span>{studioStrings.messages.deleteConfirmBody}</span>
						</Modal.Body>
						<Modal.Footer>
							<Button variant="ghost" onClick={() => setConfirmDelete(null)}>
								{studioStrings.messages.cancelLabel}
							</Button>
							<Button
								variant="destructive"
								onClick={() => {
									const a = confirmDelete;
									setConfirmDelete(null);
									void a.execute(ctx);
								}}
							>
								{confirmDelete.label(studioStrings)}
							</Button>
						</Modal.Footer>
					</Modal.Content>
				</Modal>
			)}
		</>
	);
};
