/**
 * Peak Composer — capability definition & runtime model (WP3).
 *
 * Framework-neutral types the capability runtime is built from. This file
 * IMPLEMENTS AGAINST the frozen `capabilityContracts.ts` (never reshapes it):
 * the definition model here is what the WP3 registry / resolver / coordinator
 * consume to produce the frozen `ComposerActionDescriptor` projections and
 * `ComposerResultEnvelope` results.
 *
 * Contract sources:
 * - spec 2026-07-24-peak-composer-ai-capability-modularity-architecture.md
 *   §5.1 (one registered definition), §5.3 (applicability), §11 (variants),
 *   §12 (registration API)
 * - handoff §11.2 (capability definition fields), §11.4 (typed results)
 *
 * Design notes:
 * - `RuntimeSchema` is a minimal structural interface satisfied by Zod
 *   schemas, so this core file stays free of a zod import (only
 *   `src/core/schemas/*` imports zod, per project convention).
 * - Renderer / writeback dispatch is by ID + result kind ONLY — no label or
 *   `id.includes(...)` dispatch anywhere (spec §10, handoff §2.3).
 */

import type { CapabilityManifest } from '@/core/types/capability';
import type {
	ComposerActionSurface,
	ComposerCapabilityId,
	ComposerContextSnapshot,
	ComposerInvocationHandle,
	ComposerRendererId,
	ComposerResultEnvelope,
	ComposerResultKind,
	ComposerWritebackAdapterId,
} from './capabilityContracts';
import type { ComposerBlockKind } from './types';
import type { ComposerCandidate } from './transaction';

// ── Shared dispatch IDs ───────────────────────────────────────────────────────
// Canonical renderer / writeback adapter IDs referenced by both the service
// packs (definitions) and the UI renderer registry. Stable IDs, never labels.

/** Streaming textual candidate card (inline text patch review). */
export const COMPOSER_STREAMING_TEXT_RENDERER_ID: ComposerRendererId = 'composer.renderer.streaming-text';

/** Text patch writeback: replaces one block/unit source range atomically. */
export const COMPOSER_TEXT_PATCH_WRITEBACK_ID: ComposerWritebackAdapterId = 'composer.writeback.text-patch';

// ── Runtime schema ────────────────────────────────────────────────────────────

/**
 * Minimal runtime validator contract. Structurally satisfied by Zod schemas
 * (`schema.parse`), so definitions can reference validators from
 * `@/core/schemas` without this file importing zod.
 */
export interface RuntimeSchema<T> {
	parse(input: unknown): T;
}

// ── Definition vocabulary (spec §3) ──────────────────────────────────────────

/** How the capability physically executes (spec §3.2). */
export type ComposerCapabilityExecutionMode =
	| 'deterministic'
	| 'model-stream'
	| 'agent'
	| 'media-generation'
	| 'native-patch'
	| 'hybrid';

/** What the capability does to the document when accepted (spec §3.3). */
export type ComposerCapabilityEffectKind =
	| 'analyze'
	| 'rewrite'
	| 'insert'
	| 'delete'
	| 'transform'
	| 'metadata-patch'
	| 'asset-transaction'
	| 'native-object-patch';

/**
 * Target kinds a capability applies to. `document` is the whole-document
 * target; block-level targets are addressed by their parsed block kind.
 */
export type ComposerCapabilityTargetKind = 'document' | ComposerBlockKind;

// ── Applicability (spec §5.3) ─────────────────────────────────────────────────

/**
 * Availability verdict. `hidden` = irrelevant here; `disabled` = relevant but
 * currently unavailable, and MUST carry a user-facing reason (frozen contract:
 * no clickable-but-dead buttons, no bare disabled states).
 */
export type ComposerCapabilityAvailability =
	| { state: 'available'; order?: number }
	| { state: 'hidden'; reason: string }
	| { state: 'disabled'; reason: string };

export interface ComposerApplicabilityContext {
	snapshot: ComposerContextSnapshot;
	surface: ComposerActionSurface;
	/** Parsed kind of the target block (undefined for document targets). */
	blockKind?: ComposerBlockKind;
}

// ── Presentation fallback ─────────────────────────────────────────────────────

/**
 * Compiled fallback presentation for one capability. The authoritative copy
 * lives in `templates/config/composer.json` under `capabilities.actions`
 * (keyed by `configKey`); this fallback keeps the runtime usable at
 * cold-start / in tests, mirroring the loadComposerConfig() pattern.
 */
export interface ComposerCapabilityPresentation {
	title: string;
	description: string;
	lucideIcon: string;
	/** History label used when an accepted candidate is committed. */
	historyLabel: string;
	/** Stable sort order among projected actions (lower first). */
	order: number;
}

// ── The registered definition (spec §5.1 / handoff §11.2) ─────────────────────

/**
 * One registered Composer capability. `manifest.id` is the stable identity —
 * every surface (Block row, selection toolbar, Copilot) projects from the SAME
 * definition; presentation is config, never code.
 */
export interface ComposerCapabilityDefinition<TInput = unknown, TResult = unknown> {
	/** Composes the existing generic CapabilityManifest (id/title/policy/skill/surfaces). */
	readonly manifest: CapabilityManifest;
	readonly version: string;
	readonly owner: string;
	/** Key into `capabilities.actions` config (=== manifest.id by convention). */
	readonly configKey: string;
	/** Composer surfaces this capability projects into. */
	readonly surfaces: readonly ComposerActionSurface[];
	readonly targetKinds: readonly ComposerCapabilityTargetKind[];
	readonly executionMode: ComposerCapabilityExecutionMode;
	readonly effectKind: ComposerCapabilityEffectKind;
	/** PromptId (template-registered) for model-backed modes. Never inline prompt text. */
	readonly promptId?: string;
	readonly inputSchema: RuntimeSchema<TInput>;
	readonly resultSchema: RuntimeSchema<TResult>;
	readonly resultKind: ComposerResultKind;
	readonly rendererId: ComposerRendererId;
	/** Required for every mutation-producing effect kind (all but 'analyze'). */
	readonly writebackAdapterId?: ComposerWritebackAdapterId;
	/** Whether the action supports a targeted instruction input. */
	readonly acceptsInstruction: boolean;
	/**
	 * Production Copilot action id this definition is the canonical form of
	 * (parity alias — e.g. 'polish'). Lets WP10 verify 28-action parity without
	 * guessing from labels.
	 */
	readonly copilotActionId?: string;
	readonly presentationFallback: ComposerCapabilityPresentation;
	/** Applicability guard beyond target-kind matching. */
	evaluate(ctx: ComposerApplicabilityContext): ComposerCapabilityAvailability;
	/**
	 * Map a frozen context snapshot (+ optional targeted instruction) to the
	 * PromptId's template variables. Required for model-backed modes.
	 */
	buildPromptVariables?(snapshot: ComposerContextSnapshot, instruction?: string): Record<string, unknown>;
}

/** A pack groups related definitions; registration is explicit at app composition (spec §12). */
export interface ComposerCapabilityPack {
	readonly id: string;
	definitions(): readonly ComposerCapabilityDefinition[];
}

// ── Typed run events (spec §5.5) ──────────────────────────────────────────────

/**
 * Domain content events for one capability run. Deliberately separate from the
 * operational RunEnvelope `RunEvent`s — a renderer never parses log text to
 * discover a candidate.
 */
export type ComposerCapabilityRunEvent =
	| {
			type: 'run-started';
			runId: string;
			capabilityId: ComposerCapabilityId;
			candidateId: string;
			variantId: string;
	  }
	| {
			type: 'content-delta';
			runId: string;
			candidateId: string;
			variantId: string;
			delta: string;
			/** Accumulated text so far (renderers never re-accumulate). */
			text: string;
	  }
	| {
			type: 'variant-ready';
			runId: string;
			candidateId: string;
			variantId: string;
			envelope: ComposerResultEnvelope;
	  }
	| { type: 'run-failed'; runId: string; candidateId: string; variantId: string; error: string }
	| { type: 'run-cancelled'; runId: string; candidateId: string; variantId: string };

// ── UI-facing candidate runtime port ─────────────────────────────────────────

/**
 * The narrow port the candidate UI (streaming card / host) consumes. The
 * app-owned document runtime implements it; the UI never touches the hub,
 * providers or the registry directly.
 */
export interface ComposerCandidateRuntimePort {
	/** Subscribe to the pending-candidate list (fires immediately). */
	subscribe(cb: (candidates: readonly ComposerCandidate[]) => void): () => void;
	/** Subscribe to typed run events (streaming deltas, ready, failed, cancelled). */
	onRunEvent(cb: (event: ComposerCapabilityRunEvent) => void): () => void;
	/** Renderer to dispatch for a candidate (from its definition). Null when unknown. */
	rendererIdFor(candidateId: string): ComposerRendererId | null;
	/** Append a regeneration variant and stream it. Instruction is run context, never body. */
	regenerate(candidateId: string, instruction?: string): ComposerInvocationHandle;
	/**
	 * Re-run a STALE candidate against the CURRENT document (its base revision
	 * drifted, so an in-place rebase is unsafe): discards the stale candidate and
	 * invokes the same capability afresh on its anchor block, inheriting the last
	 * instruction. Returns null (stays fail-closed) when the anchor block no longer
	 * resolves — the surface then keeps showing the stale notice. Optional so a
	 * runtime may omit it (the card falls back to discard).
	 */
	rerunStale?(candidateId: string): ComposerInvocationHandle | null;
	/** Cancel the in-flight generation for this candidate (variant becomes failed). */
	cancel(candidateId: string): void;
	/** True while a generation is streaming for this candidate. */
	isStreaming(candidateId: string): boolean;
	/** Accept the active completed variant (routes through the transaction hub). */
	accept(candidateId: string): Promise<void>;
	/** Discard the pending candidate (candidate-local; never a document undo). */
	discard(candidateId: string): void;
	/** Switch the visible variant (refused while streaming). */
	setActiveVariant(candidateId: string, variantId: string): void;
}
