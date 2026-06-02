import React from 'react';
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
import { useChatStrings } from '../../chatStringsContext';

const MAX_INLINE_CHIPS = 2;

/**
 * MessageSuggestedNext — follow-up question chips below the last assistant
 * message. Renders up to 2 inline chips and folds the rest into a "More…"
 * popover.
 *
 * Suggestions are generated ONCE when the assistant stream completes (see
 * useStreamChat) and persisted to sqlite, so we never regenerate on remount.
 * Older messages without persisted suggestions render only the actions row
 * (no fallback regeneration).
 */
export interface MessageSuggestedNextProps {
	/**
	 * Persisted follow-up questions for this message. Empty / undefined →
	 * the suggestion row is suppressed (only actions, if any, render).
	 */
	suggestions: string[] | undefined;
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
	suggestions,
	onSelect,
	onRewriteSimply,
	onCreateChecklist,
	onSaveToNote,
	onOpenRelatedNotes,
	onAskCustom,
}) => {
	const strings = useChatStrings();
	const resolved = suggestions ?? [];
	const inline = resolved.slice(0, MAX_INLINE_CHIPS);
	const overflow = resolved.slice(MAX_INLINE_CHIPS);

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

	// If there are no persisted suggestions AND no actions wired, suppress
	// the row entirely. (Suggestions may not exist for older messages
	// generated before persistence landed — we intentionally don't backfill.)
	if (resolved.length === 0 && actionItems.length === 0) return null;

	const hasOverflow = overflow.length > 0 || actionItems.length > 0;

	return (
		<div className="pkchat-msg__suggest">
			{resolved.length > 0 && (
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
