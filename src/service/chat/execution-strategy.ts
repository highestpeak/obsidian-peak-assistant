/**
 * Chat execution strategy resolver (chat-unified-mode 2026-07-05).
 *
 * Product intent (Track B):
 *   - Users no longer pick Chat / Agent / Plan from a peer three-card UI.
 *     They start ONE Chat experience; tool access is decided by
 *     capabilities + toggles + permissions, not by a UI-selected mode.
 *   - `/plan ` slash-prefix is a per-message planning intent (Debt-2, no
 *     persistent mode).
 *   - Legacy persisted `conversationType.kind === 'plan'` is honoured only
 *     for restored old conversations so those threads keep the planning
 *     UX their author picked. `kind === 'agent'` or `'chat'` are read-only
 *     hints today — the strategy runs the same default assistant profile.
 *
 * This helper returns the execution shape (tool set + step count + optional
 * plan system prompt override) so `service-conversation.streamChat` never
 * has to branch on UI state (`chatMode`) directly.
 */

import type { ToolSet } from 'ai';
import { buildChatTools, type ChatToolDeps } from './tools/chatToolBuilder';
import type { ModelCapabilities } from '@/core/providers/types';

export type ChatExecutionMode = 'default' | 'plan';

export interface ChatExecutionInput {
	/** `/plan ` prefix detected on the current user message. Takes precedence. */
	planIntent: boolean;
	/** Persisted legacy conversation type kind, read only for restored threads. */
	legacyConversationTypeKind?: string | null;
	/** Deps buildChatTools needs (app handle / plugin id / toggles). */
	toolDeps: ChatToolDeps;
	/** Live capability snapshot of the resolved model. */
	modelCapabilities: ModelCapabilities;
}

export interface ChatExecutionStrategy {
	mode: ChatExecutionMode;
	tools: ToolSet;
	maxSteps: number;
	/** True if this run should prepend the planning system prompt. */
	usePlanSystemPrompt: boolean;
}

/**
 * Decide the execution strategy for the next assistant turn.
 *
 * Priority (documented for reviewers so drift is visible):
 *   1. Per-message `/plan ` prefix → planning strategy (no tools).
 *   2. Restored old conversation with `conversationType.kind === 'plan'` →
 *      planning strategy (compat; new conversations no longer land here).
 *   3. Default → tool access driven by `buildChatTools` (which reads UI
 *      toggles + model capabilities). Users get "one Chat that can call
 *      tools when it makes sense", not "pick Agent to enable tools".
 */
export function resolveChatExecutionStrategy(input: ChatExecutionInput): ChatExecutionStrategy {
	const planFromLegacy = input.legacyConversationTypeKind === 'plan';
	const isPlan = input.planIntent || planFromLegacy;

	if (isPlan) {
		return {
			mode: 'plan',
			tools: {},
			maxSteps: 1,
			usePlanSystemPrompt: true,
		};
	}

	const built = buildChatTools(input.toolDeps, input.modelCapabilities);
	return {
		mode: 'default',
		tools: built.tools,
		maxSteps: built.maxSteps,
		usePlanSystemPrompt: false,
	};
}
