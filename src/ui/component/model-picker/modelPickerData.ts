/**
 * Shared profile-qualified model picker data + filter logic (chat-studio §8.5).
 *
 * Data source is the SAME truth as Settings' RoleModelPicker: enabled
 * Profiles from ProfileRegistry + modelRegistry catalog metadata. No second
 * catalog. Filters use AND semantics; models with UNKNOWN values for a
 * positively-selected filter do NOT pass (never inflate capabilities).
 */

import { modelRegistry } from '@/core/providers/model-registry';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import type { Profile } from '@/core/profiles/types';
import type { ModelCapabilities, ModelTokenLimits } from '@/core/providers/types';

/**
 * Resolve a profile id → its provider kind (the legacy `activeProvider`
 * column). The canonical mapping used whenever a fixed ModelSelection must
 * also write the legacy provider so provider resolution / hydration keeps
 * working. Returns undefined when the profile is unknown.
 */
export function providerKindForProfile(profileId: string): string | undefined {
	return ProfileRegistry.getInstance().getAllProfiles().find((p) => p.id === profileId)?.kind;
}

/** Map provider kind → catalog id for model lookup (mirrors RoleModelPicker). */
const PROVIDER_CATALOG: Record<string, string | null> = {
	anthropic: 'claude', openai: 'openai', google: 'gemini',
	perplexity: 'perplexity', ollama: 'ollama', openrouter: 'openrouter',
	litellm: null, custom: null,
};

export interface ProfileModelItem {
	profileId: string;
	profileName: string;
	profileKind: string;
	modelId: string;
	/** Human-facing catalog name (chat-studio §8.5) — trigger + model row show
	 *  this, never the bare id. Falls back to modelId when the catalog omits it. */
	displayName?: string;
	capabilities?: ModelCapabilities;
	tokenLimits?: ModelTokenLimits;
}

export function buildProfileModelItems(profiles: readonly Profile[]): ProfileModelItem[] {
	const items: ProfileModelItem[] = [];
	for (const profile of profiles) {
		if (profile.enabled === false) continue;
		const catalogId = PROVIDER_CATALOG[profile.kind];
		if (!catalogId) continue;
		const models = modelRegistry.getModelsForProvider(catalogId);
		for (const model of models) {
			items.push({
				profileId: profile.id,
				profileName: profile.name,
				profileKind: profile.kind,
				modelId: model.id,
				displayName: model.displayName,
				capabilities: model.capabilities,
				tokenLimits: modelRegistry.getModelTokenLimits(catalogId, model.id),
			});
		}
	}
	return items;
}

// ── Filters ──────────────────────────────────────────────────────────────────

export type CapabilityFilterKey =
	| 'vision' | 'pdfInput' | 'tools' | 'webSearch' | 'reasoning' | 'imageGeneration';

export const CAPABILITY_FILTER_KEYS: CapabilityFilterKey[] = [
	'vision', 'pdfInput', 'tools', 'webSearch', 'reasoning', 'imageGeneration',
];

/** Context floor in tokens; 0 = All. */
export type ContextFloor = 0 | 128_000 | 1_000_000;
export const CONTEXT_FLOORS: ContextFloor[] = [0, 128_000, 1_000_000];

/** Output-token floor; 0 = All. */
export type OutputFloor = 0 | 8_000 | 64_000;
export const OUTPUT_FLOORS: OutputFloor[] = [0, 8_000, 64_000];

export interface ModelFilterState {
	query: string;
	capabilities: CapabilityFilterKey[];
	contextFloor: ContextFloor;
	outputFloor: OutputFloor;
}

export function emptyModelFilter(): ModelFilterState {
	return { query: '', capabilities: [], contextFloor: 0, outputFloor: 0 };
}

export function hasActiveFilters(f: ModelFilterState): boolean {
	return f.capabilities.length > 0 || f.contextFloor !== 0 || f.outputFloor !== 0;
}

/** AND semantics; unknown capability value fails a positive filter. */
export function matchesCapabilityFilters(
	caps: ModelCapabilities | undefined,
	selected: CapabilityFilterKey[]
): boolean {
	if (selected.length === 0) return true;
	if (!caps) return false;
	return selected.every((key) => caps[key] === true);
}

/** Unknown context size fails a positive floor. */
export function matchesContextFloor(
	caps: ModelCapabilities | undefined,
	limits: ModelTokenLimits | undefined,
	floor: ContextFloor
): boolean {
	if (floor === 0) return true;
	const ctx = limits?.maxInputTokens ?? limits?.maxTokens ?? caps?.maxCtx;
	return typeof ctx === 'number' && ctx >= floor;
}

/** Unknown output size fails a positive floor. */
export function matchesOutputFloor(limits: ModelTokenLimits | undefined, floor: OutputFloor): boolean {
	if (floor === 0) return true;
	const out = limits?.maxOutputTokens;
	return typeof out === 'number' && out >= floor;
}

export function matchesQuery(item: ProfileModelItem, query: string): boolean {
	if (!query) return true;
	const q = query.toLowerCase();
	return (
		item.modelId.toLowerCase().includes(q) ||
		item.profileName.toLowerCase().includes(q) ||
		item.profileKind.toLowerCase().includes(q)
	);
}

export function filterProfileModelItems(
	items: ProfileModelItem[],
	filter: ModelFilterState
): ProfileModelItem[] {
	return items.filter((item) =>
		matchesQuery(item, filter.query) &&
		matchesCapabilityFilters(item.capabilities, filter.capabilities) &&
		matchesContextFloor(item.capabilities, item.tokenLimits, filter.contextFloor) &&
		matchesOutputFloor(item.tokenLimits, filter.outputFloor)
	);
}

/** Group filtered items by profile, preserving item order. */
export function groupByProfile(items: ProfileModelItem[]): Array<{
	profile: { id: string; name: string; kind: string };
	items: ProfileModelItem[];
}> {
	const map = new Map<string, { profile: { id: string; name: string; kind: string }; items: ProfileModelItem[] }>();
	for (const item of items) {
		let group = map.get(item.profileId);
		if (!group) {
			group = { profile: { id: item.profileId, name: item.profileName, kind: item.profileKind }, items: [] };
			map.set(item.profileId, group);
		}
		group.items.push(item);
	}
	return Array.from(map.values());
}

export function formatTokenFloor(n: number): string {
	if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}M`;
	if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
	return String(n);
}
