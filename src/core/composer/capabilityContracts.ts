/**
 * Frozen shared contracts between the Composer capability runtime (WP3) and
 * the Composer editing chrome (WP4).
 *
 * FROZEN INTERFACE — authored by the wave orchestrator before WP3/WP4 were
 * dispatched in parallel. Both work packages implement AGAINST this file and
 * must not reshape it unilaterally; changes require an orchestrator decision
 * recorded in docs/superpowers/plans/2026-07-25-composer-wave-execution-log.md.
 *
 * Contract sources:
 * - handoff §6.4 (flattened action row), §11.2 (capability definition),
 *   §11.4 (typed result kinds), §12.2 (frozen run context)
 * - spec 2026-07-24-peak-composer-ai-capability-modularity-architecture.md
 *   §5 (canonical runtime model), §10 (renderer registry)
 *
 * Ownership after the freeze:
 * - WP3 implements the projection/runtime side (real capability registry,
 *   applicability, executors, result materialization, writeback adapters).
 * - WP4 consumes {@link ComposerCapabilityProjectionPort} to render action
 *   rows and toolbars, using {@link stubComposerCapabilityProjection} until
 *   the runtimes are merged and the integration pass wires the real port.
 */

import type { ComposerTarget } from './types';

/** Stable capability identifier (e.g. `composer.prose.polish`). Never a label. */
export type ComposerCapabilityId = string & { readonly __brand?: 'ComposerCapabilityId' };

/** Renderer dispatch key carried by a typed result (§11.4 / spec §10). */
export type ComposerRendererId = string & { readonly __brand?: 'ComposerRendererId' };

/** Writeback adapter dispatch key carried by a typed result (spec §9). */
export type ComposerWritebackAdapterId = string & { readonly __brand?: 'ComposerWritebackAdapterId' };

/**
 * Typed result families (handoff §11.4). Renderers and writeback adapters
 * dispatch on this kind (plus renderer/adapter IDs) — never on action labels.
 */
export type ComposerResultKind =
	| 'analysis'
	| 'text-patch'
	| 'block-insertion'
	| 'block-replacement'
	| 'metadata-field-patch'
	| 'list-item-patch'
	| 'table-patch'
	| 'chart-source'
	| 'formula-annotation'
	| 'image-asset-candidate'
	| 'image-annotation-patch'
	| 'image-layout-patch'
	| 'native-file-patch'
	| 'finding'
	| 'receipt';

/** Envelope every capability result is materialized into (spec §5.6). */
export interface ComposerResultEnvelope<TPayload = unknown> {
	resultKind: ComposerResultKind;
	rendererId: ComposerRendererId;
	writebackAdapterId?: ComposerWritebackAdapterId;
	payload: TPayload;
}

/**
 * Immutable context snapshot frozen at invocation time (handoff §12.2).
 * Later focus/selection changes must not mutate an in-flight run's snapshot.
 */
export interface ComposerContextSnapshot {
	documentId: string;
	revision: string;
	target: ComposerTarget;
	/** Verbatim source slice of the target at freeze time. */
	targetSource: string;
	/** Frozen selection text when the invocation came from a selection. */
	selectionText?: string;
	/** Bounded surrounding source (before/after the target). */
	nearby?: { before: string; after: string };
}

/** Where an action is surfaced (handoff §6.4 / §7.2). */
export type ComposerActionSurface = 'block-row' | 'selection-toolbar' | 'object-toolbar';

/**
 * What the chrome renders for one invocable capability. Descriptors are
 * PROJECTIONS: the chrome never decides business logic from `title`, only
 * from `capabilityId` / flags. Disabled actions must carry a reason
 * (handoff §6.4: no clickable-but-dead buttons, no bare disabled states).
 */
export interface ComposerActionDescriptor {
	capabilityId: ComposerCapabilityId;
	surface: ComposerActionSurface;
	/** Display title resolved from config/templates by the projection, not by the chrome. */
	title: string;
	/** Supporting copy for capability browsers and recommendation rows. */
	description?: string;
	/** Lucide icon name; chrome maps it to the icon component. */
	lucideIcon?: string;
	/** Deterministic actions and AI actions share geometry; AI gets the sparkle affordance. */
	group: 'deterministic' | 'ai';
	/** Present ⇒ render disabled with this explanation (tooltip/aria). */
	disabledReason?: string;
	/** Supports a targeted instruction input (every AI candidate action does). */
	acceptsInstruction?: boolean;
}

/** One real registry entry exposed to capability browsers. */
export interface ComposerCapabilityCatalogItem {
	capabilityId: ComposerCapabilityId;
	title: string;
	description?: string;
	lucideIcon?: string;
	/** Current-target action when this capability is immediately invocable. */
	action?: ComposerActionDescriptor;
	/** Stable target-kind vocabulary, used only as supporting presentation. */
	targetKinds: readonly string[];
}

/** Handle the chrome gets back when it invokes a capability. */
export interface ComposerInvocationHandle {
	runId: string;
	cancel(): void;
}

export type ComposerInvocationPlacement =
	| { kind: 'list-gap'; insertionIndex: number };

export interface ComposerInvocationOptions {
	instruction?: string;
	modelId?: string;
	/** Explicit user-owned placement. The model may propose content, not move it. */
	placement?: ComposerInvocationPlacement;
}

export interface ComposerModelChoice {
	id: string;
	displayName: string;
	providerLabel?: string;
}

export interface ComposerModelSelectionPort {
	choices(): readonly ComposerModelChoice[];
	defaultModelId(): string | null;
}

/**
 * The single port the editing chrome talks to. WP3 provides the production
 * implementation (registry + applicability + runtime); WP4 renders whatever
 * this port projects and never hardcodes capability lists.
 */
export interface ComposerCapabilityProjectionPort {
	/** Actions applicable to the target, in display order for the given surface. */
	actionsFor(snapshot: ComposerContextSnapshot, surface: ComposerActionSurface): readonly ComposerActionDescriptor[];
	/** Full real registry catalog for capability browsers; older projections may omit it. */
	catalogFor?(snapshot: ComposerContextSnapshot): readonly ComposerCapabilityCatalogItem[];
	/** Invoke a capability against a frozen snapshot. Instruction is run context, never candidate body. */
	invoke(
		capabilityId: ComposerCapabilityId,
		snapshot: ComposerContextSnapshot,
		options?: ComposerInvocationOptions,
	): ComposerInvocationHandle;
}

/**
 * Empty projection for pre-integration chrome work: projects no actions, so
 * the chrome renders no AI affordances (rather than fake buttons) until the
 * real runtime port is wired. Deterministic chrome actions (insert-below /
 * copy / comment / fold / drag) are chrome-owned and do NOT go through this
 * port, so they stay fully functional against the stub.
 */
export const stubComposerCapabilityProjection: ComposerCapabilityProjectionPort = {
	actionsFor: () => [],
	invoke: () => {
		throw new Error('Composer capability runtime not wired yet (stub projection)');
	},
};
