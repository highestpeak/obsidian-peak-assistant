import React, { useEffect, useRef, useState } from 'react';
import {
	ArrowUpRight,
	ChevronDown,
	HelpCircle,
	Wand2,
	CheckSquare,
	FolderOpen,
	Pencil,
} from 'lucide-react';
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
	PopoverItem,
} from '@/ui/components/primitives';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { PromptId } from '@/service/prompt/PromptId';
import { useChatStrings } from '../../chatStringsContext';

const CONTENT_LIMIT = 500;
const MAX_INLINE_CHIPS = 2;

/**
 * MessageSuggestedNext — LLM-generated follow-up question chips below the
 * last assistant message. Renders up to 2 inline chips and folds the rest
 * into a "More…" popover.
 *
 * Behaviour mirrors the legacy SuggestedFollowups but uses retained-design
 * pkchat-msg__suggest-* styles and the PR-0 Popover primitive.
 */
export interface MessageSuggestedNextProps {
	messageId: string;
	userContent: string;
	assistantContent: string;
	onSelect: (question: string) => void;
	/**
	 * Optional ACTIONS group handlers — shown in the "More…" popover below
	 * the FOLLOW-UP overflow questions. Each renders only when supplied so
	 * the caller can scope the menu progressively.
	 *
	 * MIGRATION-DEFERRED: real handlers for Rewrite / Checklist / Open related
	 * notes don't exist yet — only `onAskCustom` (delegates to inline followup
	 * composer) is wired. Other slots will light up as their service plumbing
	 * lands. Tracked in chat surface modernization.
	 */
	onRewriteSimply?: () => void;
	onCreateChecklist?: () => void;
	onSaveToNote?: () => void;
	onOpenRelatedNotes?: () => void;
	onAskCustom?: () => void;
}

export const MessageSuggestedNext: React.FC<MessageSuggestedNextProps> = ({
	messageId,
	userContent,
	assistantContent,
	onSelect,
	onRewriteSimply,
	onCreateChecklist,
	onSaveToNote,
	onOpenRelatedNotes,
	onAskCustom,
}) => {
	const strings = useChatStrings();
	const { manager } = useServiceContext();
	const [suggestions, setSuggestions] = useState<string[]>([]);
	const [loading, setLoading] = useState(false);
	const generatedForRef = useRef<string | null>(null);

	useEffect(() => {
		if (!manager || !assistantContent || generatedForRef.current === messageId) return;
		generatedForRef.current = messageId;

		let cancelled = false;
		setLoading(true);

		manager
			.queryStructured<string[]>(PromptId.ChatSuggestFollowups, {
				userMessage: userContent.slice(0, CONTENT_LIMIT),
				assistantMessage: assistantContent.slice(0, CONTENT_LIMIT),
			})
			.then((result) => {
				if (!cancelled && Array.isArray(result)) {
					setSuggestions(result.filter((s) => typeof s === 'string').slice(0, 5));
				}
			})
			.catch((err) => {
				console.debug('[MessageSuggestedNext] Failed:', err);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [messageId, userContent, assistantContent, manager]);

	const inline = suggestions.slice(0, MAX_INLINE_CHIPS);
	const overflow = suggestions.slice(MAX_INLINE_CHIPS);

	const actionItems = [
		onRewriteSimply && {
			key: 'rewrite',
			icon: <Wand2 />,
			label: strings.message.moreRewriteSimply,
			onClick: onRewriteSimply,
		},
		onCreateChecklist && {
			key: 'checklist',
			icon: <CheckSquare />,
			label: strings.message.moreCreateChecklist,
			onClick: onCreateChecklist,
		},
		onSaveToNote && {
			key: 'save',
			icon: <ArrowUpRight />,
			label: strings.message.moreSaveToVault,
			onClick: onSaveToNote,
		},
		onOpenRelatedNotes && {
			key: 'related',
			icon: <FolderOpen />,
			label: strings.message.moreOpenRelatedNotes,
			onClick: onOpenRelatedNotes,
		},
		onAskCustom && {
			key: 'custom',
			icon: <Pencil />,
			label: strings.message.moreAskCustomFollowup,
			onClick: onAskCustom,
		},
	].filter(Boolean) as Array<{ key: string; icon: React.ReactNode; label: string; onClick: () => void }>;

	// If the LLM hasn't returned questions AND there are no actions wired,
	// the row has nothing to show. Suppress entirely. (Loading state stays
	// invisible — chips just appear when ready.)
	if (loading) return null;
	if (suggestions.length === 0 && actionItems.length === 0) return null;

	const hasOverflow = overflow.length > 0 || actionItems.length > 0;

	return (
		<div className="pkchat-msg__suggest">
			{suggestions.length > 0 && (
				<span className="pkchat-msg__suggest-label">
					{strings.message.suggestedNextLabel}
				</span>
			)}
			{inline.map((q, i) => (
				<button
					key={i}
					type="button"
					className="pkchat-msg__suggest-chip"
					onClick={() => onSelect(q)}
				>
					<ArrowUpRight />
					<span>{q}</span>
				</button>
			))}
			{hasOverflow && (
				<Popover>
					<PopoverTrigger asChild>
						<button type="button" className="pkchat-msg__suggest-more">
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
									<PopoverItem key={i} onClick={() => onSelect(q)}>
										<HelpCircle />
										<span>{q}</span>
									</PopoverItem>
								))}
							</>
						)}
						{actionItems.length > 0 && (
							<>
								{overflow.length > 0 && <div className="pkchat-msg__suggest-divider" />}
								<div className="pkchat-msg__suggest-section">
									{strings.message.moreSectionActions}
								</div>
								{actionItems.map((it) => (
									<PopoverItem key={it.key} onClick={it.onClick}>
										{it.icon}
										<span>{it.label}</span>
									</PopoverItem>
								))}
							</>
						)}
					</PopoverContent>
				</Popover>
			)}
		</div>
	);
};
