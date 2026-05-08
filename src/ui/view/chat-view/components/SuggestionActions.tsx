import React, { useEffect, useState, useRef } from 'react';
import { ClipboardList, Lightbulb, Search, Sparkles } from 'lucide-react';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { PromptId } from '@/service/prompt/PromptId';

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

export const SuggestionActions: React.FC<Props> = ({ conversationId, messages, onSelect }) => {
	const { manager } = useServiceContext();
	const [suggestions, setSuggestions] = useState<ActionSuggestion[] | null>(null);
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

	// Use LLM suggestions if available, otherwise fallback to defaults
	const display = suggestions ?? FALLBACK_ACTIONS;

	return (
		<div className="pktw-flex pktw-gap-1.5 pktw-flex-wrap">
			{display.map((s, i) => (
				<span
					key={i}
					className="pktw-inline-flex pktw-items-center pktw-gap-1 pktw-px-2.5 pktw-py-1 pktw-rounded-md pktw-border pktw-border-border pktw-bg-background pktw-text-muted-foreground pktw-text-[10px] pktw-cursor-pointer hover:pktw-border-[var(--pk-accent,#6d28d9)] hover:pktw-text-[var(--pk-accent,#6d28d9)] hover:pktw-bg-accent/5 pktw-transition-all"
					onClick={() => onSelect(s.prompt)}
				>
					{s.icon ?? <Sparkles className="pktw-w-3 pktw-h-3" />}
					{s.label}
				</span>
			))}
		</div>
	);
};
