import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ChevronDown } from 'lucide-react';
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
	PopoverItem,
} from '@/ui/components/primitives';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { PromptId } from '@/service/prompt/PromptId';
import { CHAT_STRINGS } from '../../chatStrings';

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
}

export const MessageSuggestedNext: React.FC<MessageSuggestedNextProps> = ({
	messageId,
	userContent,
	assistantContent,
	onSelect,
}) => {
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

	if (loading || suggestions.length === 0) return null;

	const inline = suggestions.slice(0, MAX_INLINE_CHIPS);
	const overflow = suggestions.slice(MAX_INLINE_CHIPS);

	return (
		<div className="pkchat-msg__suggest">
			<span className="pkchat-msg__suggest-label">
				{CHAT_STRINGS.message.suggestedNextLabel}
			</span>
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
			{overflow.length > 0 && (
				<Popover>
					<PopoverTrigger asChild>
						<button type="button" className="pkchat-msg__suggest-more">
							<span>{CHAT_STRINGS.message.suggestedNextMore}</span>
							<ChevronDown />
						</button>
					</PopoverTrigger>
					<PopoverContent align="start" sideOffset={6}>
						{overflow.map((q, i) => (
							<PopoverItem key={i} onClick={() => onSelect(q)}>
								<ArrowUpRight />
								<span>{q}</span>
							</PopoverItem>
						))}
					</PopoverContent>
				</Popover>
			)}
		</div>
	);
};
