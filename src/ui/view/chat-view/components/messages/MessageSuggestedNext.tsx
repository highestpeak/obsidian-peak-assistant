/**
 * MessageSuggestedNext — follow-up chips below the last assistant message
 * (chat-studio §7.8 / MSG-10).
 *
 * Contract:
 *   • Max 2 inline chips.
 *   • Clicking a chip fills the MAIN Composer draft (fillDraftText) AND sets
 *     a reply anchor to the producing assistant message + focuses the
 *     composer. We never render an inline composer per §15.
 *   • The More popover only lists real handlers. The MIGRATION-DEFERRED
 *     rewrite/checklist stubs were removed — no ghost menu items.
 *   • "Custom follow-up" = focus the main Composer with a reply anchor and
 *     no pre-filled text.
 */

import React from 'react';
import { ArrowUpRight, ChevronDown, HelpCircle, Pencil, ListChecks, FilePlus2 } from 'lucide-react';
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
	PopoverItem,
} from '@/ui/components/primitives';
import { useChatStrings } from '../../chatStringsContext';
import { useComposerStore } from '../../store/composerStore';
import type { ChatMessage } from '@/service/chat/types';
import type { ChatStudioStrings } from '../../chatStudioStrings';

const MAX_INLINE_CHIPS = 2;

export interface MessageSuggestedNextProps {
	message: ChatMessage;
	/** Persisted follow-up questions for this message. */
	suggestions: string[] | undefined;
	/** Chat-studio config strings (answer-action prompt templates). */
	studioStrings: ChatStudioStrings;
	/** Optional Save-to-Vault handler; renders when supplied. */
	onSaveToNote?: () => void;
}

export const MessageSuggestedNext: React.FC<MessageSuggestedNextProps> = ({
	message,
	suggestions,
	studioStrings,
	onSaveToNote,
}) => {
	const strings = useChatStrings();
	const resolved = suggestions ?? [];
	const inline = resolved.slice(0, MAX_INLINE_CHIPS);
	const overflow = resolved.slice(MAX_INLINE_CHIPS);

	const anchor = buildReplyAnchor(message, studioStrings.messages.replyAnchorFallback);

	const applyToComposer = (text: string) => {
		const store = useComposerStore.getState();
		store.setReplyAnchor(anchor);
		if (text) store.fillDraftText(text);
		store.requestComposerFocus();
	};

	// No persisted follow-ups → render nothing. Save-to-Vault and custom
	// follow-up stay reachable from the assistant action row, so a lone
	// "More…" with no chips (the old orphan) is never shown (MSG / M2).
	if (resolved.length === 0) return null;

	return (
		<div className="pkchat-msg__suggest">
			<span className="pkchat-msg__suggest-label">
				{strings.message.suggestedNextLabel}
			</span>
			{inline.map((q, i) => (
				<button
					key={i}
					type="button"
					className="pkchat-msg__suggest-chip"
					onClick={() => applyToComposer(q)}
					aria-label={q}
				>
					<ArrowUpRight />
					<span>{q}</span>
				</button>
			))}
			<Popover>
				<PopoverTrigger asChild>
					<button
						type="button"
						className="pkchat-msg__suggest-more"
						aria-label={strings.message.suggestedNextMore}
					>
						<span>{strings.message.suggestedNextMore}</span>
						<ChevronDown />
					</button>
				</PopoverTrigger>
				<PopoverContent align="start" sideOffset={6}>
					{overflow.length > 0 && (
						<>
							<div className="pkchat-msg__suggest-section">
								{strings.message.moreSectionFollowUp}
							</div>
							{overflow.map((q, i) => (
								<PopoverItem key={i} onClick={() => applyToComposer(q)}>
									<HelpCircle />
									<span>{q}</span>
								</PopoverItem>
							))}
						</>
					)}
					{overflow.length > 0 && <div className="pkchat-msg__suggest-divider" />}
					<div className="pkchat-msg__suggest-section">
						{strings.message.moreSectionActions}
					</div>
					{/* Answer actions — fill the main composer with a config prompt
					    template anchored to this reply (mock §7.8 rewrite/checklist). */}
					<PopoverItem onClick={() => applyToComposer(studioStrings.messages.rewritePrompt)}>
						<Pencil />
						<span>{strings.message.moreRewriteSimply}</span>
					</PopoverItem>
					<PopoverItem onClick={() => applyToComposer(studioStrings.messages.checklistPrompt)}>
						<ListChecks />
						<span>{strings.message.moreCreateChecklist}</span>
					</PopoverItem>
					{onSaveToNote && (
						<PopoverItem onClick={onSaveToNote}>
							<FilePlus2 />
							<span>{strings.message.moreSaveToVault}</span>
						</PopoverItem>
					)}
					<PopoverItem onClick={() => applyToComposer('')}>
						<ArrowUpRight />
						<span>{strings.message.moreAskCustomFollowup}</span>
					</PopoverItem>
				</PopoverContent>
			</Popover>
		</div>
	);
};

/** Build a short reply anchor preview from the assistant message content. */
function buildReplyAnchor(
	message: ChatMessage,
	fallbackPreview: string,
): { messageId: string; preview: string } {
	const src = String(message.content ?? '').trim();
	const preview = src.length > 80 ? `${src.slice(0, 77)}…` : src || fallbackPreview;
	return { messageId: message.id, preview };
}
