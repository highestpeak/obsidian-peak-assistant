import { useMemo } from 'react';
import type { ChatConversation } from '@/service/chat/types';
import type { TokenUsageInfo } from '@/ui/component/prompt-input';

export function useTokenUsage(conversation: ChatConversation | null): TokenUsageInfo {
	return useMemo(() => {
		if (!conversation?.messages?.length) return { totalUsed: 0 };
		const totalUsed = conversation.messages.reduce((sum, msg) => {
			if (!msg.tokenUsage) return sum;
			const u = msg.tokenUsage as any;
			const tokens = u.totalTokens ?? u.total_tokens ??
				((u.promptTokens ?? u.prompt_tokens ?? 0) + (u.completionTokens ?? u.completion_tokens ?? 0));
			return sum + (tokens || 0);
		}, 0);
		return { totalUsed };
	}, [conversation]);
}
