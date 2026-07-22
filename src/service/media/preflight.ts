/**
 * Media generation preflight — pure function that consumes a request +
 * routing/adapter capability snapshot and returns a `MediaPreflight`
 * verdict. Never performs I/O; the UI + service both call this to decide
 * whether to enqueue, prompt for confirmation, or surface a configure
 * action.
 *
 * Spec: docs/superpowers/plans/2026-07-20-chat-runtime-capability-closure-claude-handoff.md §5.4
 * Task C1 §R3, Task C2 §R2/§R3 (native adapter + auto routing).
 */

import type {
	MediaGenerationRequest,
	MediaKind,
	MediaOperation,
	MediaPreflight,
	MediaPreflightProblem,
	ResolvedMediaRoute,
} from '@/core/types/media-generation';
import {
	isValidFalEndpointId,
	presetOperation,
	resolvePreset,
	type MediaGenerationConfig,
	type MediaGenerationStrings,
} from './mediaGenerationConfig';

/**
 * Snapshot of a single native adapter's availability for a specific
 * (kind, nativeProfileId?) tuple. C2 turns this into a real value via
 * `openaiNativeAvailabilityProbe`; the C1 stub reports "no adapter".
 */
export interface NativeMediaAvailabilitySnapshot {
	configured: boolean;
	supportedKinds: readonly MediaKind[];
	/**
	 * Operations the route can execute for the queried kind. Absent means
	 * `['generate']` (back-compat with pre-edit snapshots).
	 */
	supportedOperations?: readonly MediaOperation[];
	/** Concrete provider label written to receipt (e.g. `openai`). */
	provider?: string;
	/** Machine-friendly reason for `!configured`. UI translates via `strings`. */
	reason?: 'no-adapter' | 'missing-profile' | 'invalid-profile' | 'unsupported-kind';
}

/** Snapshot input — the probe is a pure function over the request context. */
export interface NativeAvailabilityQuery {
	kind: MediaKind;
	nativeProfileId?: string;
}

/**
 * Injected native-availability probe. Kept as a function type so
 * concrete adapters plug in without editing this file. C1 baseline
 * returns `{configured:false, supportedKinds:[]}` for every query.
 */
export type NativeMediaAvailabilityProbe = (query: NativeAvailabilityQuery) => NativeMediaAvailabilitySnapshot;

export const NO_NATIVE_ADAPTER_YET: NativeMediaAvailabilityProbe = () => ({
	configured: false,
	supportedKinds: [],
	reason: 'no-adapter',
});

/**
 * Fal snapshot: mirrors what a `MediaGenerationPort.isConfigured()` +
 * `.supportedKinds()` query returns. Kept as a plain data value so
 * preflight stays pure.
 */
export interface FalMediaAvailabilitySnapshot {
	configured: boolean;
	supportedKinds: readonly MediaKind[];
	/** Operations available on this route. Absent means `['generate']`. */
	supportedOperations?: readonly MediaOperation[];
}

/**
 * Snapshot of what routes are actually available at preflight time.
 * The service assembles this once per request; keeping it explicit means
 * preflight stays a pure function (testable without any adapters).
 *
 * Note: `native` is a snapshot for the specific (kind, nativeProfileId?)
 * we're evaluating. The service resolves the probe once per preflight call.
 */
export interface MediaRouteAvailability {
	fal: FalMediaAvailabilitySnapshot;
	native: NativeMediaAvailabilitySnapshot;
}

/** Template a strings.messageWithSlots value with `{slot}` placeholders. */
function fmt(template: string, slots: Record<string, string>): string {
	return template.replace(/\{(\w+)\}/g, (_, key) => slots[key] ?? '');
}

/**
 * E2 R2#2 (E1 M-1): resolve the native quantity ceiling for a modelId.
 * Prefers per-model `maxQuantityByModel`; falls back to `defaultMaxQuantity`.
 * Returns `undefined` when neither is configured (defensive — a broken
 * template must not silently unbound the request).
 */
function resolveNativeMaxQuantity(
	config: MediaGenerationConfig,
	modelId: string,
): number | undefined {
	const perModel = config.native?.openai?.maxQuantityByModel?.[modelId];
	if (typeof perModel === 'number' && perModel > 0) return perModel;
	const fallback = config.native?.openai?.defaultMaxQuantity;
	if (typeof fallback === 'number' && fallback > 0) return fallback;
	return undefined;
}

/**
 * Given a `route: 'auto'` request, decide the preferred order to try
 * concrete routes. Preference chain:
 *   1. config.defaultRoute (native / fal / auto)
 *   2. If config.defaultRoute === 'auto', prefer native first, fal second.
 * The caller then filters by actual availability + kind support.
 */
function autoRouteCandidates(config: MediaGenerationConfig): ResolvedMediaRoute[] {
	if (config.defaultRoute === 'native') return ['native', 'fal'];
	if (config.defaultRoute === 'fal') return ['fal', 'native'];
	return ['native', 'fal'];
}

/**
 * Build a route-specific problem for auto failure surface. Used to
 * populate the multi-problem list the spec §5.6 shows to the user.
 */
/** Operations a snapshot supports (absent = generate-only, back-compat). */
function snapshotOperations(
	snapshot: { supportedOperations?: readonly MediaOperation[] },
): readonly MediaOperation[] {
	return snapshot.supportedOperations ?? ['generate'];
}

function buildRouteProblem(
	route: ResolvedMediaRoute,
	kind: MediaKind,
	operation: MediaOperation,
	availability: MediaRouteAvailability,
	strings: MediaGenerationStrings,
): MediaPreflightProblem | null {
	if (route === 'native') {
		if (!availability.native.configured) {
			const reason = availability.native.reason ?? 'no-adapter';
			if (reason === 'missing-profile') {
				return {
					code: 'native-missing-profile',
					message: strings.nativeMissingProfile,
					configureAction: 'profiles',
				};
			}
			if (reason === 'invalid-profile') {
				return {
					code: 'native-invalid-profile',
					message: fmt(strings.nativeInvalidProfile, { profileId: '' }),
					configureAction: 'profiles',
				};
			}
			// `no-adapter` or unknown → surface a generic "no adapter" message.
			return {
				code: 'native-not-configured',
				message: strings.nativeNoAdapter,
				configureAction: 'profiles',
			};
		}
		if (!availability.native.supportedKinds.includes(kind)) {
			return {
				code: 'native-unsupported-kind',
				message: fmt(strings.nativeUnsupportedKind, { kind }),
				configureAction: 'profiles',
			};
		}
		if (!snapshotOperations(availability.native).includes(operation)) {
			return {
				code: 'native-edit-unsupported',
				message: fmt(strings.editRouteUnsupported, { route: 'native' }),
				configureAction: 'profiles',
			};
		}
		return null;
	}
	// fal
	if (!availability.fal.configured) {
		return {
			code: 'fal-missing-key',
			message: strings.falKeyMissing,
			configureAction: 'media',
		};
	}
	if (!availability.fal.supportedKinds.includes(kind)) {
		return {
			code: 'fal-unsupported-kind',
			message: fmt(strings.falUnsupportedKind, { kind }),
			configureAction: 'media',
		};
	}
	if (!snapshotOperations(availability.fal).includes(operation)) {
		return {
			code: 'fal-edit-unsupported',
			message: fmt(strings.editRouteUnsupported, { route: 'fal' }),
			configureAction: 'media',
		};
	}
	return null;
}

export function preflightMediaRequest(
	request: MediaGenerationRequest,
	config: MediaGenerationConfig,
	availability: MediaRouteAvailability,
): MediaPreflight {
	const strings = config.strings;
	const problems: MediaPreflightProblem[] = [];
	const operation: MediaOperation = request.operation ?? 'generate';

	// Step 0 (zero-gap §4 A1): edit-specific request validation — route-
	// independent, so it fires before route resolution.
	if (operation === 'edit') {
		if (!config.editSupportedKinds.includes(request.kind)) {
			problems.push({
				code: 'edit-unsupported-kind',
				message: fmt(strings.editUnsupportedKind, {
					kind: request.kind,
					supportedKinds: config.editSupportedKinds.join(', '),
				}),
			});
			return { state: 'unsupported', problems };
		}
		if (!request.referenceImages || request.referenceImages.length === 0) {
			problems.push({
				code: 'edit-missing-base-image',
				message: strings.editMissingBaseImage,
			});
			return { state: 'needs-configuration', problems };
		}
	}

	// Step 1: resolve the desired concrete route. `auto` iterates the
	// preferred order and picks the first executable route.
	const requested = request.route;
	let resolvedRoute: ResolvedMediaRoute | undefined;
	if (requested === 'native') {
		resolvedRoute = 'native';
	} else if (requested === 'fal') {
		resolvedRoute = 'fal';
	} else {
		// auto: try each candidate in preference order.
		const candidates = autoRouteCandidates(config);
		for (const route of candidates) {
			const problem = buildRouteProblem(route, request.kind, operation, availability, strings);
			if (!problem) {
				resolvedRoute = route;
				break;
			}
		}
		if (!resolvedRoute) {
			// Both routes unavailable — surface every problem so the UI
			// can list "what's missing for each route".
			for (const route of candidates) {
				const problem = buildRouteProblem(route, request.kind, operation, availability, strings);
				if (problem) problems.push(problem);
			}
			const summary = problems.map((p) => p.code).join(', ');
			problems.unshift({
				code: 'no-available-route',
				message: fmt(strings.autoNoRoute, { kind: request.kind, problemSummary: summary }),
				configureAction: 'media',
			});
			return { state: 'needs-configuration', problems };
		}
	}

	// Step 2: route-specific configuration checks (for explicit-route
	// requests). Auto's fallthrough already picked a valid route above.
	if (requested !== 'auto') {
		const problem = buildRouteProblem(resolvedRoute, request.kind, operation, availability, strings);
		if (problem) {
			// Kind-support problems are "unsupported"; config gaps are
			// "needs-configuration". Preserve that distinction.
			const state =
				problem.code.endsWith('unsupported-kind') || problem.code.endsWith('edit-unsupported')
					? 'unsupported'
					: 'needs-configuration';
			problems.push(problem);
			return { state, executionRoute: resolvedRoute, problems };
		}
	}

	// Step 3: preset + endpoint id validation (config-driven).
	const preset = resolvePreset(config, request.kind, request.presetId, operation);
	if (!preset) {
		problems.push({
			code: 'preset-missing',
			message: fmt(strings.presetMissing, { presetId: request.presetId, kind: request.kind }),
			configureAction: 'media',
		});
		return { state: 'needs-configuration', executionRoute: resolvedRoute, problems };
	}
	// Zero-gap §4 A1 — the preset's own operation must match. No silent
	// substitution of an edit request onto a text-to-image preset.
	if (presetOperation(preset) !== operation) {
		problems.push({
			code: 'preset-operation-mismatch',
			message: fmt(strings.presetOperationMismatch, {
				presetId: request.presetId,
				presetOperation: presetOperation(preset),
				operation,
			}),
			configureAction: 'media',
		});
		return { state: 'needs-configuration', executionRoute: resolvedRoute, problems };
	}
	const effectiveModelId = request.requestedModelId?.trim() || preset.model;
	// Step 3b: mask compatibility (edit only).
	if (operation === 'edit') {
		const maskSupported =
			resolvedRoute === 'native'
				? config.native.openai.editSupportsMask
				: Boolean(preset.editCodec?.maskField);
		if (request.maskImage && !maskSupported) {
			problems.push({
				code: 'edit-mask-not-supported',
				message: fmt(strings.editMaskNotSupported, {
					presetId: request.presetId,
					modelId: effectiveModelId,
				}),
				configureAction: 'media',
			});
			return { state: 'needs-configuration', executionRoute: resolvedRoute, problems };
		}
		if (resolvedRoute === 'fal' && preset.editCodec?.maskRequired && !request.maskImage) {
			problems.push({
				code: 'edit-mask-required',
				message: fmt(strings.editMaskRequired, {
					presetId: request.presetId,
					modelId: effectiveModelId,
				}),
				configureAction: 'media',
			});
			return { state: 'needs-configuration', executionRoute: resolvedRoute, problems };
		}
	}
	if (resolvedRoute === 'fal' && !isValidFalEndpointId(effectiveModelId)) {
		problems.push({
			code: 'fal-invalid-endpoint',
			message: fmt(strings.falInvalidEndpoint, { modelId: effectiveModelId }),
			configureAction: 'media',
		});
		return { state: 'needs-configuration', executionRoute: 'fal', problems };
	}

	// E2 R2#2 (E1 M-1): guard native quantity against per-model max BEFORE
	// the adapter fires. gpt-image-1 refuses n>1 at the provider; without
	// this preflight guard the user pays a round-trip for a 400 and lands
	// on a raw provider error message. Failing here surfaces a
	// `needs-configuration` receipt with a config-driven detail line
	// (`preflightQuantityExceedsMaxDetail`) + honest configureAction=media
	// so the Composer/receipt Configure button lands on the right tab.
	if (resolvedRoute === 'native' && typeof request.quantity === 'number') {
		const maxQ = resolveNativeMaxQuantity(config, effectiveModelId);
		if (maxQ !== undefined && request.quantity > maxQ) {
			problems.push({
				code: 'native-quantity-exceeds-max',
				message: fmt(strings.preflightQuantityExceedsMaxDetail, {
					quantity: String(request.quantity),
					modelId: effectiveModelId,
					maxQuantity: String(maxQ),
				}),
				configureAction: 'media',
			});
			return { state: 'needs-configuration', executionRoute: 'native', problems };
		}
	}

	const estimate = {
		amountUsd: preset.estimatedCostUsd,
		billingUnit: preset.billingUnit,
		confidence: preset.costConfidence,
	};

	const providerLabel =
		resolvedRoute === 'native'
			? availability.native.provider ?? 'native'
			: 'fal';

	// Step 4: video / music always require explicit confirmation
	// (billable, potentially slow, cannot silently start).
	if (request.kind === 'video' || request.kind === 'music') {
		return {
			state: 'needs-confirmation',
			executionRoute: resolvedRoute,
			provider: providerLabel,
			modelId: effectiveModelId,
			estimate,
			problems,
		};
	}

	return {
		state: 'ready',
		executionRoute: resolvedRoute,
		provider: providerLabel,
		modelId: effectiveModelId,
		estimate,
		problems,
	};
}
