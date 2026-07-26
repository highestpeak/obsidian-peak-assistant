/**
 * Peak Composer — capability runtime config (WP3).
 *
 * Typed fallback + loader for the `capabilities` section of
 * `templates/config/composer.json`. Per docs/conventions/configurability.md,
 * every user-facing label (action titles, disabled reasons, history labels)
 * and every knob (context window size) is domain config data living in the
 * JSON template; this module is the documented compiled fallback used at
 * cold-start / in tests. Drift guard: test/composer-capability-registry.test.ts
 * asserts the JSON covers every registered capability.
 *
 * No presentation string in this file is ever used for dispatch — dispatch is
 * by capability / renderer / adapter ID only.
 */

import { TemplateManager } from '@/core/template/TemplateManager';
import { ConfigTemplateId } from '@/core/template/TemplateRegistry';
import type { ComposerCapabilityPresentation } from '@/core/composer';

/** Runtime-level strings (guard/disabled reasons surfaced via descriptors). */
export interface ComposerCapabilityRuntimeStrings {
	/** Disabled reason when the frozen snapshot's revision drifted from the live doc. */
	staleSnapshot: string;
	/** Disabled reason when the target has no content to operate on. */
	emptyTarget: string;
	/** Failure text recorded when a run is cancelled by the user. */
	runCancelled: string;
	/** Generic failure text when a run errors without a message. */
	runFailed: string;
	/** Disabled reason when the native object file cannot be edited (no native-file port). */
	nativeUnavailable: string;
}

export interface ComposerCapabilityContextPolicy {
	/** Bounded window (chars) of source captured before/after the target. */
	nearbyChars: number;
}

export interface ComposerCapabilitiesConfig {
	context: ComposerCapabilityContextPolicy;
	/** Per-capability presentation, keyed by the definition's configKey (= stable id). */
	actions: Record<string, Partial<ComposerCapabilityPresentation>>;
	strings: ComposerCapabilityRuntimeStrings;
}

/** Compiled fallback — mirrors templates/config/composer.json `capabilities`. */
export const DEFAULT_COMPOSER_CAPABILITIES_CONFIG: ComposerCapabilitiesConfig = {
	context: { nearbyChars: 800 },
	actions: {
		'composer.prose.polish': {
			title: 'Polish text',
			description: 'Improve clarity and style without changing meaning',
			lucideIcon: 'sparkles',
			historyLabel: 'AI polish',
			order: 10,
		},
	},
	strings: {
		staleSnapshot: 'Document changed — reopen the action to continue',
		emptyTarget: 'Nothing to work on in this block',
		runCancelled: 'Generation cancelled',
		runFailed: 'Generation failed',
		nativeUnavailable: 'This native object cannot be edited here',
	},
};

/** A getter so late-loading config reaches long-lived runtimes without rebuild. */
export type ComposerCapabilitiesConfigProvider = () => ComposerCapabilitiesConfig;

/**
 * Load the capabilities config, preferring the runtime JSON template and
 * falling back to the compiled default on any failure (same contract as
 * `loadComposerConfig`).
 */
export async function loadComposerCapabilitiesConfig(): Promise<ComposerCapabilitiesConfig> {
	try {
		const tm = TemplateManager.getInstance();
		if (!tm) return DEFAULT_COMPOSER_CAPABILITIES_CONFIG;
		const parsed = await tm.loadJson<{ capabilities?: Partial<ComposerCapabilitiesConfig> }>(
			ConfigTemplateId.Composer,
		);
		const section = parsed?.capabilities;
		if (!section || typeof section !== 'object') return DEFAULT_COMPOSER_CAPABILITIES_CONFIG;
		return {
			context: { ...DEFAULT_COMPOSER_CAPABILITIES_CONFIG.context, ...(section.context ?? {}) },
			actions: { ...DEFAULT_COMPOSER_CAPABILITIES_CONFIG.actions, ...(section.actions ?? {}) },
			strings: { ...DEFAULT_COMPOSER_CAPABILITIES_CONFIG.strings, ...(section.strings ?? {}) },
		};
	} catch {
		return DEFAULT_COMPOSER_CAPABILITIES_CONFIG;
	}
}

/** Resolve the effective presentation for one definition (config over fallback). */
export function resolvePresentation(
	config: ComposerCapabilitiesConfig,
	configKey: string,
	fallback: ComposerCapabilityPresentation,
): ComposerCapabilityPresentation {
	const override = config.actions[configKey];
	if (!override) return fallback;
	return { ...fallback, ...override };
}
