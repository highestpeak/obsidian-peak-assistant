/**
 * Chat runtime configuration — budget + timeouts for the AgentLoop-backed
 * Chat pipeline (task A3, plan
 * docs/superpowers/plans/2026-07-20-chat-runtime-capability-closure-claude-handoff.md §5.1).
 *
 * Source of truth: `templates/config/chat-runtime.json` (editable without
 * recompiling). The JSON import is the compiled fallback so callers always
 * get sensible defaults even when the TemplateManager is not yet bound.
 *
 * Semantics preserved from the pre-migration Vercel tool loop:
 *   - hasTools → maxSteps = 3 (chatToolBuilder legacy hardcode)
 *   - no tools → maxSteps = 1 (single provider round-trip)
 *   - budget.maxTokens / budget.maxToolCalls fall back to the harness
 *     DEFAULT_BUDGET so the numbers stay auditable in one place.
 */

import { ConfigTemplateId } from '@/core/template/TemplateRegistry';
import { TemplateManager } from '@/core/template/TemplateManager';
import chatRuntimeDefaults from '../../../templates/config/chat-runtime.json';

export interface ChatRuntimeBudgetConfig {
	/** Loop max-steps when at least one tool is attached. */
	maxStepsWithTools: number;
	/** Loop max-steps when no tools are attached (single provider round-trip). */
	maxStepsNoTools: number;
	/** Cumulative prompt+completion token cap across all steps. */
	maxTokens: number;
	/** Cumulative tool execution cap. */
	maxToolCalls: number;
}

export interface ChatRuntimeTimeoutsConfig {
	/** Per-provider-chunk stall timeout, milliseconds. */
	stepMs: number;
	/** Whole-run wall-clock timeout, milliseconds. */
	totalMs: number;
}

export interface ChatRuntimeConfig {
	budget: ChatRuntimeBudgetConfig;
	timeouts: ChatRuntimeTimeoutsConfig;
}

/**
 * Domain fallback: the shape that survives when no template is loaded.
 * Values must match the pre-A3 hardcoded behaviour so a broken template
 * cannot silently change chat behaviour.
 */
export const DEFAULT_CHAT_RUNTIME_CONFIG: ChatRuntimeConfig =
	chatRuntimeDefaults as unknown as ChatRuntimeConfig;

/**
 * Load Chat runtime config from the runtime config template, deep-merged
 * onto the compiled defaults. Always resolves — never rejects.
 *
 * The loader is intentionally synchronous-optional: consumers that must not
 * `await` (React render paths, hot-loop step decisions) can read
 * `DEFAULT_CHAT_RUNTIME_CONFIG` directly. Chat's turn pipeline calls
 * `loadChatRuntimeConfig()` once per turn so runtime edits take effect on
 * the next submission without a reload.
 */
export async function loadChatRuntimeConfig(): Promise<ChatRuntimeConfig> {
	try {
		const tm = TemplateManager.getInstance();
		if (!tm) return DEFAULT_CHAT_RUNTIME_CONFIG;
		const parsed = await tm.loadJson<Partial<ChatRuntimeConfig>>(ConfigTemplateId.ChatRuntime);
		if (!parsed || typeof parsed !== 'object') return DEFAULT_CHAT_RUNTIME_CONFIG;
		return mergeChatRuntimeConfig(DEFAULT_CHAT_RUNTIME_CONFIG, parsed);
	} catch {
		return DEFAULT_CHAT_RUNTIME_CONFIG;
	}
}

function mergeChatRuntimeConfig(
	base: ChatRuntimeConfig,
	override: Partial<ChatRuntimeConfig>,
): ChatRuntimeConfig {
	return {
		budget: { ...base.budget, ...(override.budget ?? {}) },
		timeouts: { ...base.timeouts, ...(override.timeouts ?? {}) },
	};
}

/**
 * Pick the effective per-turn max-steps given whether tools are attached.
 * Extracted so callers can test the branch without spinning up a loader.
 */
export function resolveChatMaxSteps(cfg: ChatRuntimeConfig, hasTools: boolean): number {
	return hasTools ? cfg.budget.maxStepsWithTools : cfg.budget.maxStepsNoTools;
}
