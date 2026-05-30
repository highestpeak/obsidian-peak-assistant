import { useEffect, useState } from 'react';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { ModelRegistry } from '@/core/providers/model-registry';

/**
 * useCurrentContextUtilization — exposes the active conversation's running
 * token total vs the active model's context window, so external surfaces
 * (Usage Dashboard, ambient indicator, etc.) can show a "1.4k / 200k ctx"
 * style readout without reaching into chat internals.
 *
 * Notes on accuracy:
 *   - `used` is summed from `message.tokenUsage.totalTokens` across the
 *     active conversation. This mirrors `useTokenUsage` (composer chip)
 *     but is exported through `integration/` for cross-surface use.
 *   - `max` is best-effort: we look up the conversation's active model in
 *     ModelRegistry and read `capabilities.maxCtx`. If the model can't be
 *     resolved (custom model, not yet registered, mobile bootstrap before
 *     registry hydrates), `max` falls back to 0 — UI consumers should
 *     interpret `ratio === 0` as "unknown" and degrade gracefully.
 *
 * GAP: token-level live tracking (counting the in-flight streaming response
 * before it lands as a message) is intentionally NOT done here — it would
 * require plumbing usage events out of the streaming provider. PR-Chat-4
 * leaves that as a stub for the dashboard worktree; it can subscribe to
 * `useChatDataStore.streamingMessageId` and call back into this hook when
 * accurate live counts become available.
 */
export interface CurrentContextUtilization {
	used: number;
	max: number;
	ratio: number;
}

const EMPTY: CurrentContextUtilization = { used: 0, max: 0, ratio: 0 };

export function useCurrentContextUtilization(): CurrentContextUtilization {
	const activeConversation = useChatDataStore((s) => s.activeConversation);
	const [maxCtx, setMaxCtx] = useState<number>(0);

	useEffect(() => {
		const provider = activeConversation?.meta.activeProvider;
		const modelId = activeConversation?.meta.activeModel;
		if (!provider || !modelId) {
			setMaxCtx(0);
			return;
		}
		try {
			const model = ModelRegistry.getInstance()
				.getModelsForProvider(provider)
				.find((m) => m.id === modelId);
			setMaxCtx(model?.capabilities.maxCtx ?? 0);
		} catch {
			setMaxCtx(0);
		}
	}, [activeConversation?.meta.activeModel, activeConversation?.meta.activeProvider]);

	if (!activeConversation?.messages?.length) return EMPTY;

	const used = activeConversation.messages.reduce((sum, msg) => {
		if (!msg.tokenUsage) return sum;
		const u = msg.tokenUsage as Record<string, number | undefined>;
		const tokens =
			u.totalTokens ??
			u.total_tokens ??
			((u.promptTokens ?? u.prompt_tokens ?? 0) +
				(u.completionTokens ?? u.completion_tokens ?? 0));
		return sum + (tokens || 0);
	}, 0);

	const ratio = maxCtx > 0 ? Math.min(1, used / maxCtx) : 0;
	return { used, max: maxCtx, ratio };
}
