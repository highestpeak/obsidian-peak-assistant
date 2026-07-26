/**
 * Peak Composer — candidate renderer registry (WP3, spec §10).
 *
 * Maps `ComposerRendererId` → React renderer component. Dispatch is by the
 * result's declared renderer ID ONLY — never by capability label, title or
 * `id.includes(...)`. An unknown renderer id resolves to the visible
 * unsupported-result fallback (spec §10: "unknown combinations render a
 * visible unsupported-result fallback"), and registry conformance is
 * asserted by test/composer-result-renderer.test.ts.
 *
 * The registry is a plain instance created by `createDefaultCandidateRendererRegistry`
 * at the mount site — no module-level mutable singleton.
 */

import type * as React from 'react';
import type {
	ComposerCandidate,
	ComposerCandidateRuntimePort,
	ComposerRendererId,
} from '@/core/composer';
import type { CandidateUiStrings } from './candidateUiConfig';

/** Props every candidate renderer receives from the host. */
export interface CandidateRendererProps {
	candidate: ComposerCandidate;
	runtime: ComposerCandidateRuntimePort;
	strings: CandidateUiStrings;
	/** Accumulated streaming text for the active variant (null when not streaming). */
	streamingText: string | null;
	/**
	 * Verbatim source the candidate replaces ("before" text), for in-place word
	 * diff (CMP-REV-02). Null when unavailable (non-text-patch, drifted revision,
	 * or no resolver wired) — the renderer then shows the plain replacement.
	 */
	originalText?: string | null;
}

export type CandidateRendererComponent = React.ComponentType<CandidateRendererProps>;

export interface ResolvedCandidateRenderer {
	component: CandidateRendererComponent;
	/** True when the fallback was used (unknown renderer id). */
	unsupported: boolean;
}

export class CandidateRendererRegistry {
	private readonly byId = new Map<string, CandidateRendererComponent>();

	constructor(private readonly fallback: CandidateRendererComponent) {}

	register(id: ComposerRendererId, component: CandidateRendererComponent): void {
		if (this.byId.has(id)) throw new Error(`candidate renderer '${id}' already registered`);
		this.byId.set(id, component);
	}

	has(id: ComposerRendererId): boolean {
		return this.byId.has(id);
	}

	resolve(id: ComposerRendererId | null): ResolvedCandidateRenderer {
		const component = id !== null ? this.byId.get(id) : undefined;
		if (!component) return { component: this.fallback, unsupported: true };
		return { component, unsupported: false };
	}
}

/**
 * Default registry with the built-in renderers. Imported lazily by the mount
 * site (`createDefaultCandidateRendererRegistry()` in index.ts wires the
 * streaming-text card against {@link COMPOSER_STREAMING_TEXT_RENDERER_ID}).
 */
export function createCandidateRendererRegistry(
	fallback: CandidateRendererComponent,
): CandidateRendererRegistry {
	return new CandidateRendererRegistry(fallback);
}
