import React, { useEffect, useState, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { PromptId } from '@/service/prompt/PromptId';

interface ActionSuggestion {
	label: string;
	prompt: string;
}

interface Props {
	conversationId: string;
	messages: Array<{ role: string; content: string }>;
	onSelect: (prompt: string) => void;
}

const CONTENT_LIMIT = 400;

export const SuggestionActions: React.FC<Props> = ({ conversationId, messages, onSelect }) => {
	const { manager } = useServiceContext();
	const [suggestions, setSuggestions] = useState<ActionSuggestion[]>([]);
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
				setSuggestions(result.filter(s => s.label && s.prompt).slice(0, 3));
			}
		}).catch(err => {
			console.debug('[SuggestionActions] Failed:', err);
		});

		return () => { cancelled = true; };
	}, [conversationId, messages.length, manager]);

	if (suggestions.length === 0) return null;

	return (
		<div className="pktw-flex pktw-gap-1.5 pktw-flex-wrap">
			{suggestions.map((s, i) => (
				<span
					key={i}
					className="pktw-inline-flex pktw-items-center pktw-gap-1 pktw-px-2.5 pktw-py-1 pktw-rounded-md pktw-border pktw-border-border pktw-bg-background pktw-text-muted-foreground pktw-text-[10px] pktw-cursor-pointer hover:pktw-border-[var(--pk-accent,#6d28d9)] hover:pktw-text-[var(--pk-accent,#6d28d9)] hover:pktw-bg-accent/5 pktw-transition-all"
					onClick={() => onSelect(s.prompt)}
				>
					<Sparkles className="pktw-w-3 pktw-h-3" />
					{s.label}
				</span>
			))}
		</div>
	);
};
