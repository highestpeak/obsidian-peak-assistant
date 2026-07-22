/**
 * Task E1 — pure overlay + validation utilities for the Media Generation
 * Settings tab.
 *
 * Storage model (see docs/superpowers/plans/2026-07-20-... §5.6):
 *   - `templates/config/media-generation.json` = static, canonical source
 *     of truth for every large table (presets tuple, OpenAI adapter
 *     timings, poll intervals, string templates).
 *   - `settings.ai.mediaDefaults` = SMALL user overlay for the fields the
 *     Settings tab exposes: default route, per-kind default preset id,
 *     per-kind model/aspect/duration/quantity/voice overrides, preferred
 *     native profile id, last-validated timestamp.
 *
 * `applyMediaSettingsOverlay(config, overlay)` merges the overlay into a
 * pre-loaded `MediaGenerationConfig`. Downstream readers (preflight /
 * adapters / probe) see a SINGLE shape and are unaware of the split. This
 * keeps the preset table out of TypeScript / UI code (Configurability
 * rule) while still letting the user tune the small fields that need
 * per-install adjustment.
 *
 * `validateMediaConfiguration(input)` is a pure, LOCAL check — it never
 * makes a network request. It reports missing/malformed values (fal key
 * shape, endpoint id shape, native profile availability, preset override
 * consistency); real remote connectivity is deliberately out of scope
 * (cannot be tested + would spend money).
 *
 * `resolveConfigureTab(action)` is the pure function the ArtifactReceiptCard
 * and ComposerPlusMenu use to translate a preflight `configureAction`
 * into a Settings tab id. Kept here (not in the UI layer) so both callers
 * and the settings module import the same lookup.
 */

import type { AIServiceSettings, MediaSettingsOverride } from '@/core/config/settingsTypes';
import type { Profile } from '@/core/profiles/types';
import type { MediaKind } from '@/core/types/media-generation';
import type {
	MediaGenerationConfig,
	MediaPreset,
} from './mediaGenerationConfig';
import { isValidFalEndpointId } from './mediaGenerationConfig';
import { resolveOpenAiProfile, type OpenAiProfileLookup } from './openaiNativeAvailabilityProbe';

const MEDIA_KINDS: readonly MediaKind[] = ['image', 'video', 'music', 'tts'];

// ─── Overlay merge ─────────────────────────────────────────────────────────

/**
 * Apply a `MediaSettingsOverride` on top of a pre-loaded
 * `MediaGenerationConfig`. The overlay is optional; when unset the config
 * is returned unchanged (referentially).
 *
 * Merge rules:
 *   - `defaultRoute` — scalar override.
 *   - `defaultPresetIds[kind]` — if the referenced preset id exists in
 *     `config.presets[kind]`, that preset REPLACES the current `default`
 *     entry (so downstream `resolvePreset(kind, 'default')` picks it up
 *     without callers threading a new preset id).
 *   - `presetOverrides[kind]` — merged field-by-field onto the resolved
 *     `default` preset AFTER the id swap; only fields present on the
 *     overlay object are copied. Preserves `provider`, `billingUnit`,
 *     `costConfidence` from the base.
 *
 * NEVER mutates inputs; always returns a fresh object graph.
 */
export function applyMediaSettingsOverlay(
	config: MediaGenerationConfig,
	overlay: MediaSettingsOverride | undefined,
): MediaGenerationConfig {
	if (!overlay || Object.keys(overlay).length === 0) return config;

	const nextPresets: MediaGenerationConfig['presets'] = {
		image: { ...config.presets.image },
		video: { ...config.presets.video },
		music: { ...config.presets.music },
		tts: { ...config.presets.tts },
	};

	for (const kind of MEDIA_KINDS) {
		const overrideId = overlay.defaultPresetIds?.[kind];
		if (overrideId && nextPresets[kind][overrideId]) {
			// Swap the referenced preset into the `default` slot so callers
			// that pass `presetId: 'default'` pick it up without knowing
			// which one the user chose.
			nextPresets[kind] = {
				...nextPresets[kind],
				default: { ...nextPresets[kind][overrideId] },
			};
		}
		const fieldOverride = overlay.presetOverrides?.[kind];
		if (fieldOverride && nextPresets[kind].default) {
			nextPresets[kind] = {
				...nextPresets[kind],
				default: mergePresetFields(nextPresets[kind].default, fieldOverride),
			};
		}
	}

	return {
		...config,
		defaultRoute: overlay.defaultRoute ?? config.defaultRoute,
		presets: nextPresets,
	};
}

function mergePresetFields(
	base: MediaPreset,
	patch: NonNullable<MediaSettingsOverride['presetOverrides']>[MediaKind],
): MediaPreset {
	if (!patch) return base;
	return {
		...base,
		...(patch.model !== undefined ? { model: patch.model } : {}),
		...(patch.aspectRatio !== undefined ? { aspectRatio: patch.aspectRatio } : {}),
		...(patch.quantity !== undefined ? { quantity: patch.quantity } : {}),
		...(patch.durationSeconds !== undefined ? { durationSeconds: patch.durationSeconds } : {}),
		...(patch.maxDurationSeconds !== undefined ? { maxDurationSeconds: patch.maxDurationSeconds } : {}),
		...(patch.voice !== undefined ? { voice: patch.voice } : {}),
	};
}

// ─── Validation (LOCAL ONLY — no network, no cost) ─────────────────────────

export interface ValidateMediaInput {
	settings: AIServiceSettings;
	config: MediaGenerationConfig;
	profileLookup: OpenAiProfileLookup;
}

export interface MediaConfigurationProblem {
	/** Machine code, drives UI grouping. */
	code:
		| 'fal-key-missing'
		| 'fal-endpoint-invalid'
		| 'native-profile-missing'
		| 'native-profile-invalid'
		| 'preset-missing'
		| 'preset-override-invalid';
	/** Route / provider affinity — drives "which section is this about". */
	route: 'fal' | 'native' | 'shared';
	/**
	 * Human-facing message rendered under the code chip. E2 R2#1 (E1 I-2)
	 * fix: this string is now generated from `config.strings.validate*` +
	 * `fmt()` slot substitution (`templates/config/media-generation.json`),
	 * NOT a hardcoded English literal.
	 */
	detail: string;
}

/** Template a `{slot}` string with values. Matches `preflight.ts::fmt()`. */
function fmt(template: string, slots: Record<string, string>): string {
	return template.replace(/\{(\w+)\}/g, (_, key) => slots[key] ?? '');
}

export interface ValidateMediaResult {
	problems: MediaConfigurationProblem[];
	/** True when every route+preset check passed locally. Does NOT imply
	 * remote connectivity — validate is explicitly non-spending. */
	ok: boolean;
	/** Epoch ms; caller persists to `settings.ai.mediaDefaults.lastValidatedAt`. */
	validatedAt: number;
}

export function validateMediaConfiguration(
	input: ValidateMediaInput,
	now: () => number = Date.now,
): ValidateMediaResult {
	const problems: MediaConfigurationProblem[] = [];
	const s = input.config.strings;

	// 1. fal key shape (never a live call — merely "did the user paste
	// something plausible"). fal accepts opaque tokens with no fixed
	// prefix, so we only enforce "non-empty after trim".
	const falKey = input.settings.falApiKey?.trim() ?? '';
	const falPresent = falKey.length > 0;
	if (!falPresent) {
		problems.push({
			code: 'fal-key-missing',
			route: 'fal',
			detail: s.validateFalKeyMissingDetail,
		});
	}

	// 2. every fal-provider preset has a well-formed endpoint id.
	for (const kind of MEDIA_KINDS) {
		const byKind = input.config.presets[kind];
		if (!byKind) continue;
		for (const [presetId, preset] of Object.entries(byKind)) {
			if (preset.provider === 'fal' && !isValidFalEndpointId(preset.model)) {
				problems.push({
					code: 'fal-endpoint-invalid',
					route: 'fal',
					detail: fmt(s.validateFalEndpointMalformedDetail, {
						kind,
						presetId,
						modelId: preset.model,
					}),
				});
			}
		}
	}

	// 3. native profile presence.
	const nativeProfileId = input.settings.mediaDefaults?.nativeProfileId;
	const nativeProfile = resolveOpenAiProfile(input.profileLookup, nativeProfileId);
	if (nativeProfileId && !nativeProfile) {
		problems.push({
			code: 'native-profile-invalid',
			route: 'native',
			detail: fmt(s.validateNativeProfileInvalidDetail, { profileId: nativeProfileId }),
		});
	} else if (!nativeProfileId && !nativeProfile) {
		// Not necessarily an error — the user may have chosen fal-only. Only
		// surface when native is the (effective) default route.
		const effectiveRoute = input.settings.mediaDefaults?.defaultRoute ?? input.config.defaultRoute;
		if (effectiveRoute === 'native') {
			problems.push({
				code: 'native-profile-missing',
				route: 'native',
				detail: s.validateNativeProfileMissingDetail,
			});
		}
	}

	// 4. per-kind default preset id (when overridden) actually exists.
	const idOverride = input.settings.mediaDefaults?.defaultPresetIds;
	if (idOverride) {
		for (const kind of MEDIA_KINDS) {
			const chosen = idOverride[kind];
			if (chosen && !input.config.presets[kind]?.[chosen]) {
				problems.push({
					code: 'preset-missing',
					route: 'shared',
					detail: fmt(s.validatePresetMissingDetail, { presetId: chosen, kind }),
				});
			}
		}
	}

	// 5. preset override sanity — duration must fit under the base cap;
	// quantity must be a positive integer; native quantity must respect the
	// per-model maxQuantityByModel bound (E2 R2#2 / E1 M-1).
	const fieldOverrides = input.settings.mediaDefaults?.presetOverrides;
	if (fieldOverrides) {
		for (const kind of MEDIA_KINDS) {
			const patch = fieldOverrides[kind];
			if (!patch) continue;
			// The overlay's `presetOverrides[kind]` layers on top of the
			// preset the user chose via `defaultPresetIds[kind]` (which swaps
			// into the `default` slot). Resolve the effective base by
			// consulting `defaultPresetIds` first, then falling back to the
			// static `default`.
			const chosenId = input.settings.mediaDefaults?.defaultPresetIds?.[kind];
			const base = (chosenId && input.config.presets[kind]?.[chosenId])
				|| input.config.presets[kind]?.default;
			if (patch.durationSeconds !== undefined && patch.durationSeconds <= 0) {
				problems.push({
					code: 'preset-override-invalid',
					route: 'shared',
					detail: fmt(s.validateOverrideDurationPositiveDetail, { kind }),
				});
			}
			if (patch.maxDurationSeconds !== undefined && patch.maxDurationSeconds <= 0) {
				problems.push({
					code: 'preset-override-invalid',
					route: 'shared',
					detail: fmt(s.validateOverrideMaxDurationPositiveDetail, { kind }),
				});
			}
			if (
				patch.durationSeconds !== undefined
				&& patch.maxDurationSeconds !== undefined
				&& patch.durationSeconds > patch.maxDurationSeconds
			) {
				problems.push({
					code: 'preset-override-invalid',
					route: 'shared',
					detail: fmt(s.validateOverrideDurationExceedsMaxDetail, {
						kind,
						durationSeconds: String(patch.durationSeconds),
						maxDurationSeconds: String(patch.maxDurationSeconds),
					}),
				});
			}
			if (patch.quantity !== undefined && (!Number.isInteger(patch.quantity) || patch.quantity < 1)) {
				problems.push({
					code: 'preset-override-invalid',
					route: 'shared',
					detail: fmt(s.validateOverrideQuantityPositiveIntDetail, { kind }),
				});
			}
			if (patch.model !== undefined && base?.provider === 'fal' && !isValidFalEndpointId(patch.model)) {
				problems.push({
					code: 'fal-endpoint-invalid',
					route: 'fal',
					detail: fmt(s.validateOverrideFalEndpointMalformedDetail, { kind, modelId: patch.model }),
				});
			}
			// E2 R2#2 (E1 M-1): quantity override on a NATIVE preset must
			// respect the per-model max (e.g. gpt-image-1 caps at 1). Check
			// the effective model — override wins over base — and read the
			// bound from `native.openai.maxQuantityByModel` (fallback
			// `defaultMaxQuantity`).
			if (patch.quantity !== undefined && base?.provider === 'native') {
				const effectiveModel = patch.model ?? base.model;
				const maxQ = resolveMaxQuantityForNativeModel(input.config, effectiveModel);
				if (maxQ !== undefined && patch.quantity > maxQ) {
					problems.push({
						code: 'preset-override-invalid',
						route: 'native',
						detail: fmt(s.validateOverrideQuantityExceedsMaxDetail, {
							kind,
							quantity: String(patch.quantity),
							modelId: effectiveModel,
							maxQuantity: String(maxQ),
						}),
					});
				}
			}
		}
	}

	return {
		problems,
		ok: problems.length === 0,
		validatedAt: now(),
	};
}

/**
 * E2 R2#2 (E1 M-1) helper: look up the per-model native quantity ceiling,
 * falling back to `defaultMaxQuantity`. Returns `undefined` when the config
 * has neither (defensive — a broken template must not silently unbound).
 */
export function resolveMaxQuantityForNativeModel(
	config: MediaGenerationConfig,
	modelId: string,
): number | undefined {
	const perModel = config.native?.openai?.maxQuantityByModel?.[modelId];
	if (typeof perModel === 'number' && perModel > 0) return perModel;
	const fallback = config.native?.openai?.defaultMaxQuantity;
	if (typeof fallback === 'number' && fallback > 0) return fallback;
	return undefined;
}

// ─── configureAction → Settings tab id ────────────────────────────────────

export type ConfigureActionId = 'media' | 'profiles' | 'mcp' | 'permissions';

/**
 * Pure lookup used by ArtifactReceiptCard / ComposerPlusMenu / Composer
 * unavailable hints. Kept here so every caller resolves the target tab
 * the same way and tests can exercise a single table.
 *
 * NOTE ON MCP: the MCP surface currently lives inside the Tools tab
 * (`ToolsTab.tsx` → `MCPServerSection`). No dedicated tab today; sending
 * MCP configure jumps to the Tools tab so the user lands on the honest
 * section even though there's no auto-scroll. When a dedicated MCP tab
 * appears, this lookup is the ONE place to change.
 */
export function resolveConfigureTab(action: string | undefined): SettingsTabForConfigure {
	switch (action) {
		case 'media':
			return 'mediaGeneration';
		case 'profiles':
			return 'aiSetup';
		case 'mcp':
			return 'tools';
		case 'permissions':
			return 'aiSetup';
		default:
			return 'mediaGeneration';
	}
}

/** Narrow slice of TabId shipped by settings/types.ts. Kept as a string
 * union here to keep this module free of a UI-layer import — the
 * settings/types re-exports the same literal set. */
export type SettingsTabForConfigure =
	| 'overview'
	| 'aiSetup'
	| 'knowledgeIndex'
	| 'tools'
	| 'advanced'
	| 'mediaGeneration';

/**
 * When a receipt has multiple preflight problems, the aggregate
 * `no-available-route` uses `configureAction: 'media'` as the fallback.
 * Callers should prefer a per-route problem's `configureAction` (as
 * documented in task-c2-report §M-1). This helper picks the first
 * per-route action from the problem list; falls back to the aggregate.
 */
export function pickConfigureActionFromProblems(problems: ReadonlyArray<{ code: string; configureAction?: string }>): ConfigureActionId | undefined {
	// Skip the aggregate entry; pick the first entry that carries a real
	// per-route configureAction.
	for (const p of problems) {
		if (p.code === 'no-available-route') continue;
		if (p.configureAction === 'profiles' || p.configureAction === 'media' || p.configureAction === 'mcp' || p.configureAction === 'permissions') {
			return p.configureAction;
		}
	}
	const aggregate = problems.find((p) => p.code === 'no-available-route');
	if (aggregate?.configureAction === 'profiles' || aggregate?.configureAction === 'media' || aggregate?.configureAction === 'mcp' || aggregate?.configureAction === 'permissions') {
		return aggregate.configureAction;
	}
	return undefined;
}

/** Lookup used by validation display; groups problems by their target route. */
export function problemsByRoute(result: ValidateMediaResult): {
	fal: MediaConfigurationProblem[];
	native: MediaConfigurationProblem[];
	shared: MediaConfigurationProblem[];
} {
	return {
		fal: result.problems.filter((p) => p.route === 'fal'),
		native: result.problems.filter((p) => p.route === 'native'),
		shared: result.problems.filter((p) => p.route === 'shared'),
	};
}

/**
 * Discover which OpenAI-kind profiles the Settings tab should list in
 * its "Native profile" picker. Uses the same predicate as the availability
 * probe so the two views cannot disagree. Returns a plain array of
 * `{profileId, name}` snapshots so the UI does not have to import the
 * `Profile` type (avoids widening the settings surface's dependency set).
 */
export function listOpenAiProfilesForNative(
	lookup: OpenAiProfileLookup,
): ReadonlyArray<{ id: string; name: string; hasKey: boolean; enabled: boolean }> {
	return lookup
		.getAllProfiles()
		.filter((p: Profile) => p.kind === 'openai')
		.map((p) => ({
			id: p.id,
			name: p.name,
			hasKey: Boolean(p.apiKey && p.apiKey.trim().length > 0),
			enabled: p.enabled,
		}));
}
