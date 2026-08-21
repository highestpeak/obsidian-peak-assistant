/**
 * modelRouter — real "Auto model" resolution (chat-studio §8.5 / COMP-05).
 *
 * When conversation.modelSelection is `{ mode: 'auto' }`, this pure function
 * turns the turn's requirements (task text + attachments + tools + long
 * context + assistant preferredModel) into a concrete
 * `{ profileId, modelId }` chosen from the *enabled* Profile ∪ ModelRegistry
 * catalog.
 *
 * Strategy is data-driven — {@link ConfigTemplateId.ModelRouting} feeds tiers
 * and preference orders so behavior can change without touching this file.
 * Domain fallback embeds the compiled JSON so a broken template cannot
 * silently degrade routing.
 *
 * Precedence (fixed by the enclosing resolver in `assistantResolver.ts`):
 *   1. conversation.fixed          → always wins, this router never sees Auto
 *   2. assistant.preferredModel    → if resolvable, this router honors it;
 *                                    unresolvable → recorded + falls to (3)
 *   3. Auto route (this file)      → score candidates, pick the best
 *
 * Non-goals:
 *   - No LLM call. Signals are heuristic (regex on task text left OFF until
 *     spec allows — attachments + tool list are the only structural signals).
 *   - No side effects. Purely deterministic given inputs.
 */

import type { ModelCapabilities, ModelTokenLimits } from '@/core/providers/types';
import type { Profile } from '@/core/profiles/types';
import { ConfigTemplateId } from '@/core/template/TemplateRegistry';
import { TemplateManager } from '@/core/template/TemplateManager';
import { modelRegistry } from '@/core/providers/model-registry';
import { isKeylessLocalProfile, profileModelCatalogId } from '@/core/providers/profile-model-catalog';
import modelRoutingDefaults from '../../../templates/config/model-routing.json';

// ── Public shape ────────────────────────────────────────────────────────────

/** Signals the router considers when picking a model. */
export interface AutoRoutingSignals {
	/** How many image attachments the turn carries. > 0 → require vision. */
	imageAttachmentCount: number;
	/** How many PDF attachments the turn carries. > 0 → require pdfInput. */
	pdfAttachmentCount: number;
	/** Non-empty → require `tools` capability. */
	toolsNeeded: boolean;
	/**
	 * Rough token estimate of the input (system + history + user + refs).
	 * When present + high enough vs the smallest candidate context, the
	 * router prefers larger-context tiers. `undefined` skips that gate.
	 */
	estimatedInputTokens?: number;
	/**
	 * When the Assistant supplies a preferredModel and it resolves, the outer
	 * resolver takes it directly and the router is not called. This field
	 * exists so callers can share signals for logging without a duplicate
	 * type.
	 */
	assistantPreferred?: { profileId: string; modelId: string } | null;
}

export interface AutoRoutingCandidate {
	profileId: string;
	profileKind: string;
	profileName: string;
	modelId: string;
	displayName?: string;
	capabilities?: ModelCapabilities;
	tokenLimits?: ModelTokenLimits;
}

export interface AutoRoutingResult {
	/** Concrete pick. */
	profileId: string;
	profileKind: string;
	modelId: string;
	/** Short, honest, non-CoT reason string for the receipt. */
	routeReason: string;
	/** Machine-readable capability requirements this turn imposed. */
	requiredCapabilities: string[];
	/** Which tier config matched. */
	tierId: string;
}

export interface AutoRoutingError {
	kind: 'no-candidates';
	message: string;
	requiredCapabilities: string[];
	inspectedProfileCount: number;
}

export type AutoRoutingOutcome =
	| { ok: true; value: AutoRoutingResult }
	| { ok: false; error: AutoRoutingError };

// ── Config schema (mirrors templates/config/model-routing.json) ─────────────

export interface ModelRoutingTier {
	id: string;
	/**
	 * Preference order as `{profileKind}:{modelId}` tuples. First entry that
	 * survives capability + availability wins.
	 */
	preferOrder: string[];
	when: {
		vision?: boolean;
		pdfInput?: boolean;
		toolsNeeded?: boolean;
		longContext?: boolean;
	};
}

export interface ModelRoutingConfig {
	version: number;
	tiers: ModelRoutingTier[];
	routing: {
		contextWindowSafetyFactor: number;
		longContextRatioThreshold: number;
		assistantPreferredWinsOverAuto: boolean;
	};
	messages: Record<string, string>;
}

export const DEFAULT_MODEL_ROUTING_CONFIG: ModelRoutingConfig =
	modelRoutingDefaults as unknown as ModelRoutingConfig;

/**
 * Load routing config from the runtime template with the compiled JSON as
 * fallback. Always resolves — a broken template silently falls back.
 */
export async function loadModelRoutingConfig(): Promise<ModelRoutingConfig> {
	try {
		const tm = TemplateManager.getInstance();
		if (!tm) return DEFAULT_MODEL_ROUTING_CONFIG;
		const parsed = await tm.loadJson<Partial<ModelRoutingConfig>>(ConfigTemplateId.ModelRouting);
		if (!parsed || typeof parsed !== 'object') return DEFAULT_MODEL_ROUTING_CONFIG;
		return mergeRoutingConfig(DEFAULT_MODEL_ROUTING_CONFIG, parsed);
	} catch {
		return DEFAULT_MODEL_ROUTING_CONFIG;
	}
}

function mergeRoutingConfig(base: ModelRoutingConfig, override: Partial<ModelRoutingConfig>): ModelRoutingConfig {
	return {
		version: override.version ?? base.version,
		tiers: (override.tiers && override.tiers.length > 0 ? override.tiers : base.tiers) as ModelRoutingTier[],
		routing: { ...base.routing, ...(override.routing ?? {}) },
		messages: { ...base.messages, ...(override.messages ?? {}) },
	};
}

// ── Candidate materialization ────────────────────────────────────────────────

/**
 * Materialize all catalog models for currently-enabled profiles.
 * Skips profiles without an apiKey and profiles whose provider kind has no
 * catalog mapping (custom/litellm — those never route through Auto because
 * their model list is dynamic and lacks capability metadata).
 */
export function buildAutoRoutingCandidates(profiles: Profile[]): AutoRoutingCandidate[] {
	const candidates: AutoRoutingCandidate[] = [];
	for (const profile of profiles) {
		if (profile.enabled === false) continue;
		if (!profile.apiKey && !isKeylessLocalProfile(profile.kind)) continue;
		const catalogId = profileModelCatalogId(profile);
		if (!catalogId) continue;
		const models = modelRegistry.getModelsForProvider(catalogId);
		for (const model of models) {
			candidates.push({
				profileId: profile.id,
				profileKind: profile.kind,
				profileName: profile.name,
				modelId: model.id,
				displayName: model.displayName,
				capabilities: model.capabilities,
				tokenLimits: modelRegistry.getModelTokenLimits(catalogId, model.id),
			});
		}
	}
	return candidates;
}

// ── Capability computation ───────────────────────────────────────────────────

export interface RequiredCapabilityFlags {
	vision: boolean;
	pdfInput: boolean;
	toolsNeeded: boolean;
	longContext: boolean;
}

/**
 * Convert signals to hard capability requirements.
 *
 * `longContext` is a *routing preference* (prefer larger-context tiers) — not a
 * strict filter, because deciding "how much context is enough" depends on the
 * candidate. It is enforced later in filterCandidates when the candidate's
 * ctx would be blown by the estimated input.
 */
export function requiredCapabilitiesFromSignals(signals: AutoRoutingSignals): RequiredCapabilityFlags {
	return {
		vision: signals.imageAttachmentCount > 0,
		pdfInput: signals.pdfAttachmentCount > 0,
		toolsNeeded: signals.toolsNeeded,
		longContext: false, // computed per-candidate in filterCandidates
	};
}

/**
 * Filter to candidates whose capabilities satisfy required flags AND (if
 * we have an input estimate) whose usable context window fits the input
 * with the safety factor from config.
 */
export function filterCandidates(
	candidates: AutoRoutingCandidate[],
	required: RequiredCapabilityFlags,
	signals: AutoRoutingSignals,
	config: ModelRoutingConfig,
): AutoRoutingCandidate[] {
	return candidates.filter((c) => {
		const caps = c.capabilities;
		if (required.vision && !caps?.vision) return false;
		if (required.pdfInput && !caps?.pdfInput) return false;
		if (required.toolsNeeded && !caps?.tools) return false;
		if (typeof signals.estimatedInputTokens === 'number' && signals.estimatedInputTokens > 0) {
			const usable = usableContextTokens(c, config.routing.contextWindowSafetyFactor);
			if (usable > 0 && signals.estimatedInputTokens > usable) return false;
		}
		return true;
	});
}

function usableContextTokens(c: AutoRoutingCandidate, safety: number): number {
	const raw = c.tokenLimits?.maxInputTokens ?? c.tokenLimits?.maxTokens ?? c.capabilities?.maxCtx;
	if (typeof raw !== 'number' || raw <= 0) return 0;
	return Math.floor(raw * Math.max(0.1, Math.min(1, safety)));
}

// ── Tier scoring ─────────────────────────────────────────────────────────────

/**
 * Given filtered candidates, pick the best one using the tier list.
 * Returns null when no tier's preferOrder yields a survivor; caller then
 * takes the first candidate (any-model fallback) as long as required
 * capabilities are met.
 */
function pickByTier(
	filtered: AutoRoutingCandidate[],
	required: RequiredCapabilityFlags,
	config: ModelRoutingConfig,
	signals: AutoRoutingSignals,
): { candidate: AutoRoutingCandidate; tier: ModelRoutingTier } | null {
	const longContext = deriveLongContext(filtered, signals, config);
	for (const tier of config.tiers) {
		if (tier.when.vision && !required.vision) continue;
		if (tier.when.pdfInput && !required.pdfInput) continue;
		if (tier.when.toolsNeeded && !required.toolsNeeded) continue;
		if (tier.when.longContext && !longContext) continue;
		for (const pref of tier.preferOrder) {
			const [kind, modelId] = pref.split(':');
			if (!kind || !modelId) continue;
			const hit = filtered.find((c) => c.profileKind === kind && c.modelId === modelId);
			if (hit) return { candidate: hit, tier };
		}
	}
	return null;
}

function deriveLongContext(
	filtered: AutoRoutingCandidate[],
	signals: AutoRoutingSignals,
	config: ModelRoutingConfig,
): boolean {
	if (typeof signals.estimatedInputTokens !== 'number') return false;
	// A turn is "long" when the estimate exceeds the median candidate's usable
	// context * longContextRatioThreshold. Median is robust to a few tiny
	// candidates (embedding-only, etc.).
	const sizes = filtered
		.map((c) => usableContextTokens(c, config.routing.contextWindowSafetyFactor))
		.filter((n) => n > 0)
		.sort((a, b) => a - b);
	if (sizes.length === 0) return false;
	const median = sizes[Math.floor(sizes.length / 2)];
	return signals.estimatedInputTokens > median * config.routing.longContextRatioThreshold;
}

// ── Public entry point ───────────────────────────────────────────────────────

/**
 * Resolve Auto to a concrete `{profileId, modelId}` given signals + config.
 *
 * Returns:
 *   - `ok: true`  → routed pick + honest reason string + machine-readable
 *                    required capabilities list.
 *   - `ok: false` → no enabled profile+model satisfies the requirements.
 *                    UI must surface the message and NOT pick a random model.
 *
 * This function does NOT mutate anything and does NOT call the model catalog
 * refresh path — inputs are the source of truth.
 */
export function routeAutoModel(input: {
	profiles: Profile[];
	signals: AutoRoutingSignals;
	config: ModelRoutingConfig;
}): AutoRoutingOutcome {
	const candidates = buildAutoRoutingCandidates(input.profiles);
	const required = requiredCapabilitiesFromSignals(input.signals);
	const requiredKeys = requiredCapabilityKeys(required);
	if (candidates.length === 0) {
		return {
			ok: false,
			error: {
				kind: 'no-candidates',
				message: renderMessage(input.config.messages.noCandidates, {
					requirements: requiredKeys.join(', ') || 'general chat',
				}),
				requiredCapabilities: requiredKeys,
				inspectedProfileCount: input.profiles.length,
			},
		};
	}
	const filtered = filterCandidates(candidates, required, input.signals, input.config);
	if (filtered.length === 0) {
		return {
			ok: false,
			error: {
				kind: 'no-candidates',
				message: renderMessage(input.config.messages.noCandidates, {
					requirements: requiredKeys.join(', ') || 'general chat',
				}),
				requiredCapabilities: requiredKeys,
				inspectedProfileCount: input.profiles.length,
			},
		};
	}
	const tierPick = pickByTier(filtered, required, input.config, input.signals);
	if (tierPick) {
		return {
			ok: true,
			value: {
				profileId: tierPick.candidate.profileId,
				profileKind: tierPick.candidate.profileKind,
				modelId: tierPick.candidate.modelId,
				routeReason: buildRouteReason({
					required,
					tier: tierPick.tier,
					candidate: tierPick.candidate,
					config: input.config,
				}),
				requiredCapabilities: requiredKeys,
				tierId: tierPick.tier.id,
			},
		};
	}
	// Fallback: no tier's preferOrder hit — take the first filtered candidate.
	// This is the "your enabled profiles don't include the preferred models,
	// but do include a capable one" branch. Reason string calls it out.
	const fallback = filtered[0];
	return {
		ok: true,
		value: {
			profileId: fallback.profileId,
			profileKind: fallback.profileKind,
			modelId: fallback.modelId,
			routeReason: renderMessage(input.config.messages.fallbackTier, {
				tier: 'available',
			}) + `; picked ${fallback.profileName}/${fallback.modelId}`,
			requiredCapabilities: requiredKeys,
			tierId: 'fallback',
		},
	};
}

function requiredCapabilityKeys(required: RequiredCapabilityFlags): string[] {
	const keys: string[] = [];
	if (required.vision) keys.push('vision');
	if (required.pdfInput) keys.push('pdfInput');
	if (required.toolsNeeded) keys.push('tools');
	return keys;
}

function buildRouteReason(input: {
	required: RequiredCapabilityFlags;
	tier: ModelRoutingTier;
	candidate: AutoRoutingCandidate;
	config: ModelRoutingConfig;
}): string {
	const parts: string[] = [];
	if (input.required.vision) parts.push(input.config.messages.visionRequired);
	if (input.required.pdfInput) parts.push(input.config.messages.pdfRequired);
	if (input.required.toolsNeeded) parts.push(input.config.messages.toolsRequired);
	if (input.tier.when.longContext) parts.push(input.config.messages.longContextRequired);
	if (parts.length === 0) parts.push(input.config.messages.generalChat);
	parts.push(
		renderMessage(input.config.messages.tierMatch, { tier: input.tier.id }) +
			`; picked ${input.candidate.profileName}/${input.candidate.modelId}`,
	);
	return parts.join('; ');
}

function renderMessage(template: string, vars: Record<string, string>): string {
	return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}
