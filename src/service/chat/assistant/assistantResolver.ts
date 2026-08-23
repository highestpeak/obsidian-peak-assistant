/**
 * Assistant runtime resolver — task B2 (plan §5.3).
 *
 * Assistants are user-owned durable identities (`ChatAssistantDefinition`).
 * A conversation binds one via `meta.assistantId`; runtime must:
 *   1. Resolve the configured definition exactly; missing storage records fail loudly.
 *   2. Inject `instructions` into the prompt through {@link AssistantSlot}
 *      (never through React or the Composer directly).
 *   3. Fold `knowledgeRefs` into the same explicit-ref/attachment pipe the
 *      Composer already uses.
 *   4. Layer `toolPolicy` on top of the B1 availability list — deny wins
 *      unconditionally, allow becomes a PermissionGuard rule so the ask
 *      path is silent for approved tools.
 *   5. Feed `preferredModel` into the model precedence chain
 *      (conversation.fixed > assistant.preferred > Auto default).
 *
 * This file owns the shared shape (`ResolvedAssistant`) so downstream
 * consumers (`streamChat`, `AssistantSlot`, tool filter, model resolver)
 * all read one snapshot instead of re-querying `AssistantService`.
 */

import type {
	AssistantToolPolicy,
	ChatAssistantDefinition,
	ExplicitContextRef,
} from '@/core/types/chat-studio';
import type { AssistantService } from '@/service/chat/service-assistant';
import type { ChatConversation } from '@/service/chat/types';
import type { ToolDef } from '@/service/agents/harness/tool/types';
import type {
	PermissionMode,
	PermissionRule,
} from '@/service/agents/harness/permission/types';
import type { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import type { AppHandle } from '@/core/ports/AppHandle';
import type { SourceReceiptCollector } from '@/service/chat/tools/sourceReceiptCollector';

/**
 * A single snapshot of the assistant that impacts one turn.
 *
 * `null` never appears in this shape — callers use `resolveAssistantForConversation`
 * whose return is `ResolvedAssistant | null`. Null means "Default assistant, no
 * overlays" (no slot injection, no policy overlay, no preferred model).
 */
export interface ResolvedAssistant {
	definition: ChatAssistantDefinition;
	/** Convenience: never mutate; downstream may filter but not extend. */
	knowledgeRefs: ExplicitContextRef[];
	toolPolicy: AssistantToolPolicy;
	preferredModel?: { profileId: string; modelId: string };
}

/**
 * Look up the assistant bound to a conversation.
 * - Missing/undefined `assistantId` → null (Default).
 * - Deleted assistant → error; a bound identity may not silently become Default.
 * - Archived assistant is still returned; UI hides them from selection but a
 *   conversation already bound to one keeps its behaviour.
 */
export async function resolveAssistantForConversation(
	assistantService: AssistantService | null | undefined,
	conversation: ChatConversation,
): Promise<ResolvedAssistant | null> {
	if (!assistantService) return null;
	const assistantId = conversation.meta.assistantId;
	if (!assistantId) return null;
	try {
		const definition = await assistantService.get(assistantId);
		if (!definition) throw new Error(`The configured assistant "${assistantId}" no longer exists. Runtime assistant fallback is disabled.`);
		return {
			definition,
			knowledgeRefs: definition.knowledgeRefs ?? [],
			toolPolicy: definition.toolPolicy,
			preferredModel: definition.preferredModel,
		};
	} catch (err) {
		throw err instanceof Error ? err : new Error(String(err));
	}
}

// ─── Tool policy: deny-first filter + allow rules ──────────────────────────────

/**
 * Apply assistant `toolPolicy.deny` to a ToolDef list.
 *
 * Deny wins over B1 availability: a tool that resolveToolAvailability marked
 * `available` is removed here if the assistant denies it. Empty deny list is
 * a no-op. Match is exact-name (matches how ChatAssistantDefinition.toolPolicy
 * is authored today — an array of tool ids).
 */
export function filterToolsByAssistantPolicy(
	tools: ToolDef[],
	toolPolicy: AssistantToolPolicy | null | undefined,
): ToolDef[] {
	if (!toolPolicy || toolPolicy.deny.length === 0) return tools;
	const deny = new Set(toolPolicy.deny);
	return tools.filter((t) => !deny.has(t.name));
}

/**
 * Build PermissionGuard rules from an assistant toolPolicy.
 *
 * Deny rules ship even though `filterToolsByAssistantPolicy` already removes
 * the tools: this is defense in depth against a prompt-injection scenario where
 * the model somehow smuggles a denied tool name past the ToolDef list (e.g. an
 * MCP tool that reappears mid-run). PermissionGuard's deny precedence (§3.7)
 * ensures the call would still be blocked at execute time.
 *
 * Allow rules turn the ask path silent for the listed tools — a mutating tool
 * that would normally require confirmation in `mode:'ask'` runs without
 * interruption when the assistant author has whitelisted it.
 */
export function buildAssistantPermissionRules(
	toolPolicy: AssistantToolPolicy | null | undefined,
): PermissionRule[] {
	if (!toolPolicy) return [];
	const rules: PermissionRule[] = [];
	for (const name of toolPolicy.deny) {
		rules.push({
			tool: name,
			effect: 'deny',
			reason: `denied by assistant toolPolicy`,
		});
	}
	for (const name of toolPolicy.allow) {
		// Skip names that also appear in deny — deny wins per PermissionGuard
		// precedence (§3.7) but explicitly documenting it here avoids a mismatch
		// between the ToolDef filter and the guard rules.
		if (toolPolicy.deny.includes(name)) continue;
		rules.push({
			tool: name,
			effect: 'allow',
		});
	}
	return rules;
}

/**
 * Map `AssistantToolPolicy.approval` to a PermissionGuard mode.
 *
 *   always → `'ask'`  (default; even read tools ideally ask, but the guard's
 *                      `ask` mode still auto-allows reads. Assistant authors
 *                      who want read-time confirmation must add explicit
 *                      `ask` rules — surfaced in the report so the UI can
 *                      grow that affordance later.)
 *   writes → `'ask'`  (matches the pre-B2 hardcoded mode; ask for mutating tools)
 *   never  → `'bypassPermissions'`  (skip all prompts; deny rules still enforced)
 *
 * Absent policy falls back to `'ask'` (the B1-era hardcoded default).
 */
export function resolveAssistantPermissionMode(
	toolPolicy: AssistantToolPolicy | null | undefined,
): PermissionMode {
	const approval = toolPolicy?.approval ?? 'writes';
	if (approval === 'never') return 'bypassPermissions';
	return 'ask';
}

// ─── Model precedence ─────────────────────────────────────────────────────────

export interface EffectiveModelInput {
	/** Conversation `modelSelection` — fixed always wins if resolvable. */
	fixedSelection?: { profileId?: string; modelId: string; provider?: string } | null;
	/** Legacy per-conversation mirror (activeModel/activeProvider). */
	legacyActive?: { modelId?: string; provider?: string };
	/** Assistant preferred model (second in precedence). */
	assistantPreferred?: { profileId: string; modelId: string } | null;
	/** Auto default (last resort). */
	defaultModel: { modelId: string; provider: string };
	profileRegistry: ProfileRegistry;
}

export interface EffectiveModelResolution {
	modelId: string;
	provider: string;
	/**
	 * The Profile id resolved for this model, when available. Empty string
	 * for the legacy fallback path (a fixed-model conversation whose
	 * profileId no longer resolves but activeProvider is present) — callers
	 * fall back to profile scanning by provider kind in that case.
	 */
	profileId?: string;
	/**
	 * Which step in the precedence chain provided this value.
	 *
	 * `auto-routed` (chat-studio §8.5 / COMP-05, 2026-07-21) means the
	 * conversation selection is Auto and {@link routeAutoModel} picked a
	 * capable model based on the turn's requirements. `auto-default` remains
	 * the fallback when routing is not requested (legacy code path).
	 */
	source:
		| 'conversation-fixed'
		| 'assistant-preferred'
		| 'auto-routed'
		| 'auto-default';
	/**
	 * If the assistant preferred model was requested but the profile/model was
	 * not resolvable (deleted profile, disabled, model no longer in catalog)
	 * the resolver falls to the next level and this flag records the drop so
	 * the report / receipt can surface it.
	 */
	assistantPreferredUnavailable?: boolean;
	/**
	 * When `source === 'auto-routed'`, a short human-readable reason string
	 * ("attachments include an image; picked X"). Persisted on the receipt
	 * as `routeReason` for auditability; never a chain-of-thought dump.
	 */
	routeReason?: string;
	/**
	 * When Auto is used, the machine-readable list of capabilities the router
	 * treated as required for this turn. Empty array = general chat with no
	 * special requirements. Present on `auto-routed`; may also be present on
	 * `auto-default` when routing was attempted but produced no result and
	 * the caller fell back to the active Chat profile.
	 */
	requiredCapabilities?: string[];
}

/**
 * Fixed order:
 *   1. conversation.meta.modelSelection (mode=='fixed', profile/model resolvable)
 *   2. assistant.preferredModel (profile/model resolvable)
 *   3. Auto default: settings.defaultModel
 *
 * "Resolvable" means the referenced Profile still exists and is enabled and
 * (for step 2) the model id is not empty. When step 2 is requested but not
 * resolvable the resolution drops to step 3 and `assistantPreferredUnavailable`
 * flips to true so the receipt/report shows the degradation honestly.
 */
export function resolveEffectiveModel(input: EffectiveModelInput): EffectiveModelResolution {
	// 1. Conversation fixed selection.
	if (input.fixedSelection && input.fixedSelection.modelId) {
		const profileId = input.fixedSelection.profileId;
		if (profileId) {
			const profile = input.profileRegistry.getProfileById(profileId);
			if (profile && profile.enabled !== false) {
				return {
					modelId: input.fixedSelection.modelId,
					provider: profile.kind,
					profileId: profile.id,
					source: 'conversation-fixed',
				};
			}
		}
		// Legacy rows with an explicit provider remain pinned to that exact
		// provider/model. A missing configured profile is never replaced.
		if (input.fixedSelection.provider) {
			return {
				modelId: input.fixedSelection.modelId,
				provider: input.fixedSelection.provider,
				source: 'conversation-fixed',
			};
		}
		throw new Error(`The conversation's configured model profile "${profileId ?? 'unknown'}" is unavailable. Runtime model fallback is disabled.`);
	}

	// Legacy mirror: activeModel/activeProvider on the conversation.
	// Same precedence tier as `fixedSelection` — a legacy row that never got
	// a modelSelection blob should still pin the model.
	if (input.legacyActive?.modelId && input.legacyActive?.provider) {
		return {
			modelId: input.legacyActive.modelId,
			provider: input.legacyActive.provider,
			source: 'conversation-fixed',
		};
	}

	// 2. Assistant preferred model.
	if (input.assistantPreferred && input.assistantPreferred.modelId) {
		const profile = input.profileRegistry.getProfileById(input.assistantPreferred.profileId);
		if (profile && profile.enabled !== false) {
			return {
				modelId: input.assistantPreferred.modelId,
				provider: profile.kind,
				profileId: profile.id,
				source: 'assistant-preferred',
			};
		}
		throw new Error(`The assistant's configured model ${input.assistantPreferred.profileId}/${input.assistantPreferred.modelId} is unavailable. Runtime model fallback is disabled.`);
	}

	// 3. Auto default.
	return pickAutoDefault(input);
}

function pickAutoDefault(input: EffectiveModelInput): EffectiveModelResolution {
	const chatConfig = input.profileRegistry.getActiveChatConfig();
	if (chatConfig?.modelId && chatConfig.profile) {
		return {
			modelId: chatConfig.modelId,
			provider: chatConfig.profile.kind,
			profileId: chatConfig.profile.id,
			source: 'auto-default',
		};
	}
	throw new Error('No active Chat model is configured. Configure the Chat model explicitly; runtime model fallback is disabled.');
}

// ─── knowledgeRefs → attachment pipe ─────────────────────────────────────────

/**
 * Fold `assistant.knowledgeRefs` into the same `attachments: string[]` pipe
 * the Composer already uses.
 *
 * User attachments are preserved first + deduped by URI; assistant refs are
 * appended after, so a per-turn user attach still takes precedence.
 *
 * Behaviour:
 *   - `vault-file` / `url` refs → their `uri` joins the attachment list.
 *   - `vault-file` refs whose file does not exist in the vault are dropped
 *     (safe fallback; audit-C §1 mandates deleted refs never break turns).
 *   - `vault-folder` refs are dropped entirely — the attachment pipe has no
 *     bulk loader today. A warning is logged so this shows up in dev
 *     without a runtime failure.
 *   - `upload` / `reply` kinds are dropped (already resolved elsewhere or
 *     not applicable as pre-attach context).
 *
 * Every ref that survives is recorded on the SourceReceiptCollector so
 * `TurnExecutionReceipt.actualSources.explicitRefsUsed` shows what the
 * runtime honestly consumed — even in a Default (no-assistant) turn the
 * composer's own refs land here.
 */
export function mergeAssistantKnowledgeRefs(input: {
	userAttachments?: string[];
	resolvedAssistant: ResolvedAssistant | null;
	app: AppHandle;
	receipts?: SourceReceiptCollector;
}): string[] {
	const seen = new Set<string>();
	const merged: string[] = [];
	for (const a of input.userAttachments ?? []) {
		if (!a || seen.has(a)) continue;
		seen.add(a);
		merged.push(a);
	}
	const refs = input.resolvedAssistant?.knowledgeRefs ?? [];
	for (const ref of refs) {
		const uri = tryResolveExplicitRefToAttachment(ref, input.app);
		if (!uri) continue;
		if (!seen.has(uri)) {
			seen.add(uri);
			merged.push(uri);
		}
		input.receipts?.recordExplicitRefUsed(ref);
	}
	return merged;
}

function tryResolveExplicitRefToAttachment(
	ref: ExplicitContextRef,
	app: AppHandle,
): string | null {
	if (ref.kind === 'vault-file') {
		const file = app?.vault?.getAbstractFileByPath?.(ref.uri);
		if (!file) return null;
		return ref.uri;
	}
	if (ref.kind === 'url') return ref.uri;
	// vault-folder / upload / reply are not routed through the attachment
	// pipe — they either need a bulk loader (folder) or a different pre-
	// stage (upload/reply). Skipping is the safe fallback per audit-C §1.
	return null;
}
