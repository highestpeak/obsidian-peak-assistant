import React, { useEffect, useState, useRef } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { PromptId } from '@/service/prompt/PromptId';

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
 */
export const SuggestedFollowups: React.FC<Props> = ({ messageId, userContent, assistantContent, onSelect }) => {
	const { manager } = useServiceContext();
	const [suggestions, setSuggestions] = useState<string[]>([]);
	const [loading, setLoading] = useState(false);
	const generatedForRef = useRef<string | null>(null);

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

	if (loading || suggestions.length === 0) return null;

	return (
		<div className="pktw-flex pktw-gap-1 pktw-mt-1 pktw-flex-wrap">
			{suggestions.map((q, i) => (
				<span
					key={i}
					className="pktw-inline-flex pktw-items-center pktw-gap-1 pktw-px-2 pktw-py-0.5 pktw-rounded pktw-border pktw-border-border pktw-bg-background pktw-text-muted-foreground pktw-text-[10px] pktw-cursor-pointer hover:pktw-border-[var(--pk-accent,#6d28d9)] hover:pktw-text-[var(--pk-accent,#6d28d9)] hover:pktw-bg-accent/10 pktw-transition-all"
					onClick={() => onSelect(q)}
				>
					<MessageSquarePlus className="pktw-w-3 pktw-h-3" />
					{q}
				</span>
			))}
		</div>
	);
};
