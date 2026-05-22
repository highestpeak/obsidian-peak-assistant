import React, { useEffect, useState, useRef, useCallback } from 'react';
import { ClipboardList, Lightbulb, Search, Sparkles } from 'lucide-react';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { PromptId } from '@/service/prompt/PromptId';
import { cn } from '@/ui/react/lib/utils';

interface ActionSuggestion {
	label: string;
	prompt: string;
	icon?: React.ReactNode;
}

interface Props {
	conversationId: string;
	messages: Array<{ role: string; content: string }>;
	onSelect: (prompt: string) => void;
}

const CONTENT_LIMIT = 400;

const FALLBACK_ACTIONS: ActionSuggestion[] = [
	{ label: 'Summarize', prompt: 'Summarize this conversation concisely.', icon: <ClipboardList className="pktw-w-3 pktw-h-3" /> },
	{ label: 'Search vault', prompt: 'Search the vault for information related to this conversation.', icon: <Search className="pktw-w-3 pktw-h-3" /> },
	{ label: 'Explain further', prompt: 'Explain the last response in more detail.', icon: <Lightbulb className="pktw-w-3 pktw-h-3" /> },
];

/**
 * Action suggestions shown below the last assistant message.
 * Supports keyboard navigation: ArrowLeft/Right to move, Enter to select.
 */
export const SuggestionActions: React.FC<Props> = ({ conversationId, messages, onSelect }) => {
	const { manager } = useServiceContext();
	const [suggestions, setSuggestions] = useState<ActionSuggestion[] | null>(null);
	const [focusedIndex, setFocusedIndex] = useState(-1);
	const generatedForRef = useRef<string | null>(null);

	useEffect(() => {
		if (!manager || messages.length < 2) return;
		const key = `${conversationId}-${messages.length}`;
		if (generatedForRef.current === key) return;
		generatedForRef.current = key;

		let cancelled = false;

		const lastMessages = messages.slice(-6).map(m =>
			`${m.role}: ${m.content.slice(0, CONTENT_LIMIT)}`
		).join('\n\n');

		manager.queryStructured<ActionSuggestion[]>(
			PromptId.ChatSuggestActions,
			{ messages: lastMessages },
		).then(result => {
			if (!cancelled && Array.isArray(result)) {
				const valid = result.filter(s => s.label && s.prompt).slice(0, 3);
				if (valid.length > 0) setSuggestions(valid);
			}
		}).catch(err => {
			console.debug('[SuggestionActions] LLM failed, using fallbacks:', err);
		});

		return () => { cancelled = true; };
	}, [conversationId, messages.length, manager]);

	const display = suggestions ?? FALLBACK_ACTIONS;

	const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
		if (display.length === 0) return;
		if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
			e.preventDefault();
			setFocusedIndex(prev => Math.min(prev + 1, display.length - 1));
		} else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
			e.preventDefault();
			setFocusedIndex(prev => Math.max(prev - 1, 0));
		} else if (e.key === 'Enter' && focusedIndex >= 0) {
			e.preventDefault();
			onSelect(display[focusedIndex].prompt);
		}
	}, [display, focusedIndex, onSelect]);

	return (
		<div
			className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-flex-wrap"
			tabIndex={0}
			onKeyDown={handleKeyDown}
			onFocus={() => { if (focusedIndex < 0) setFocusedIndex(0); }}
			onBlur={() => setFocusedIndex(-1)}
		>
			<span className="pktw-text-[9px] pktw-font-medium pktw-uppercase pktw-tracking-wider pktw-text-muted-foreground pktw-mr-0.5">Actions</span>
			{display.map((s, i) => (
				<span
					key={i}
					className={cn(
						"pktw-inline-flex pktw-items-center pktw-gap-1 pktw-px-2.5 pktw-py-1 pktw-rounded-md pktw-border pktw-bg-background pktw-text-muted-foreground pktw-text-[10px] pktw-cursor-pointer pktw-transition-all",
						focusedIndex === i
							? "pktw-border-[var(--pk-accent)] pktw-text-[var(--pk-accent)] pktw-bg-accent/5"
							: "pktw-border-border hover:pktw-border-[var(--pk-accent)] hover:pktw-text-[var(--pk-accent)] hover:pktw-bg-accent/5"
					)}
					onClick={() => onSelect(s.prompt)}
					onMouseEnter={() => setFocusedIndex(i)}
				>
					{s.icon ?? <Sparkles className="pktw-w-3 pktw-h-3" />}
					{s.label}
				</span>
			))}
		</div>
	);
};
