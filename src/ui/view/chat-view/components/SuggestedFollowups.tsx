import React, { useEffect, useState, useRef, useCallback } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { PromptId } from '@/service/prompt/PromptId';
import { cn } from '@/ui/react/lib/utils';

interface Props {
	messageId: string;
	userContent: string;
	assistantContent: string;
	onSelect: (question: string) => void;
}

const CONTENT_LIMIT = 500;

/**
 * LLM-generated follow-up question suggestions, shown below the last assistant message.
 * Generates once per messageId and caches the result.
 * Supports keyboard navigation: ArrowLeft/Right to move, Enter to select.
 */
export const SuggestedFollowups: React.FC<Props> = ({ messageId, userContent, assistantContent, onSelect }) => {
	const { manager } = useServiceContext();
	const [suggestions, setSuggestions] = useState<string[]>([]);
	const [loading, setLoading] = useState(false);
	const [focusedIndex, setFocusedIndex] = useState(-1);
	const generatedForRef = useRef<string | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!manager || !assistantContent || generatedForRef.current === messageId) return;
		generatedForRef.current = messageId;

		let cancelled = false;
		setLoading(true);

		manager.queryStructured<string[]>(
			PromptId.ChatSuggestFollowups,
			{
				userMessage: userContent.slice(0, CONTENT_LIMIT),
				assistantMessage: assistantContent.slice(0, CONTENT_LIMIT),
			},
		).then(result => {
			if (!cancelled && Array.isArray(result)) {
				setSuggestions(result.filter(s => typeof s === 'string').slice(0, 3));
			}
		}).catch(err => {
			console.debug('[SuggestedFollowups] Failed:', err);
		}).finally(() => {
			if (!cancelled) setLoading(false);
		});

		return () => { cancelled = true; };
	}, [messageId, userContent, assistantContent, manager]);

	const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
		if (suggestions.length === 0) return;
		if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
			e.preventDefault();
			setFocusedIndex(prev => Math.min(prev + 1, suggestions.length - 1));
		} else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
			e.preventDefault();
			setFocusedIndex(prev => Math.max(prev - 1, 0));
		} else if (e.key === 'Enter' && focusedIndex >= 0) {
			e.preventDefault();
			onSelect(suggestions[focusedIndex]);
		}
	}, [suggestions, focusedIndex, onSelect]);

	if (loading || suggestions.length === 0) return null;

	return (
		<div
			ref={containerRef}
			className="pktw-flex pktw-items-center pktw-gap-1 pktw-mt-1 pktw-flex-wrap"
			tabIndex={0}
			onKeyDown={handleKeyDown}
			onFocus={() => { if (focusedIndex < 0) setFocusedIndex(0); }}
			onBlur={() => setFocusedIndex(-1)}
		>
			<span className="pktw-text-[9px] pktw-font-medium pktw-uppercase pktw-tracking-wider pktw-text-muted-foreground pktw-mr-0.5">Follow-up</span>
			{suggestions.map((q, i) => (
				<span
					key={i}
					className={cn(
						"pktw-inline-flex pktw-items-center pktw-gap-1 pktw-px-2 pktw-py-0.5 pktw-rounded pktw-border pktw-bg-background pktw-text-muted-foreground pktw-text-[10px] pktw-cursor-pointer pktw-transition-all",
						focusedIndex === i
							? "pktw-border-[var(--pk-accent,#6d28d9)] pktw-text-[var(--pk-accent,#6d28d9)] pktw-bg-accent/10"
							: "pktw-border-border hover:pktw-border-[var(--pk-accent,#6d28d9)] hover:pktw-text-[var(--pk-accent,#6d28d9)] hover:pktw-bg-accent/10"
					)}
					onClick={() => onSelect(q)}
					onMouseEnter={() => setFocusedIndex(i)}
				>
					<MessageSquarePlus className="pktw-w-3 pktw-h-3" />
					{q}
				</span>
			))}
		</div>
	);
};
