/**
 * Peak Composer — formula detail state model (WP5, handoff §10.2 / §3.3).
 *
 * The authoritative decision (§3.3) is that each formula's three details —
 * `解释公式 / 拆分公式 / 变量表` — are INDEPENDENT results: any combination can be
 * open at once on one formula, across different formulas any combination can
 * coexist, and there is ZERO global accordion (opening one never closes
 * another). Clicking PageRank's variable table shows PageRank only.
 *
 * This module is the pure, framework-neutral state model that guarantees those
 * invariants: state is keyed by `${formulaId}::${detailKind}` and every mutation
 * touches exactly one key, so independence holds by construction. Each detail
 * carries its own variant history (regenerate / follow-up), active variant, and
 * `kept` flag (accept-keep-annotation vs close). The Zustand store wrapper
 * (`formulaDetailStore.ts`) drives the UI from these functions.
 */

import type {
	ComposerFormulaAnnotationPayload,
	ComposerFormulaDetailKind,
} from '@/core/schemas/composer';

export type FormulaDetailVariantStatus = 'streaming' | 'ready' | 'failed';

export interface FormulaDetailVariant {
	variantId: string;
	/** Targeted follow-up instruction frozen into this variant (§10.2). */
	instruction?: string;
	status: FormulaDetailVariantStatus;
	/** Accumulated streamed text (renderers never re-accumulate). */
	streamingText: string;
	/** Materialized annotation once the variant is ready. */
	payload?: ComposerFormulaAnnotationPayload;
}

export interface FormulaDetailEntry {
	formulaId: string;
	detailKind: ComposerFormulaDetailKind;
	open: boolean;
	variants: FormulaDetailVariant[];
	activeVariantId: string | null;
	/** Accept-keep-annotation: the detail is pinned rather than discarded on close. */
	kept: boolean;
	/** Split-only acknowledgement that this exact variant was written to source. */
	applied: boolean;
}

export interface FormulaDetailState {
	entries: Readonly<Record<string, FormulaDetailEntry>>;
}

export const EMPTY_FORMULA_DETAIL_STATE: FormulaDetailState = { entries: {} };

/** Composite key for one (formula, detail-kind) result. */
export function detailKey(formulaId: string, kind: ComposerFormulaDetailKind): string {
	return `${formulaId}::${kind}`;
}

export function getDetail(
	state: FormulaDetailState,
	formulaId: string,
	kind: ComposerFormulaDetailKind,
): FormulaDetailEntry | undefined {
	return state.entries[detailKey(formulaId, kind)];
}

export function isDetailOpen(
	state: FormulaDetailState,
	formulaId: string,
	kind: ComposerFormulaDetailKind,
): boolean {
	return getDetail(state, formulaId, kind)?.open ?? false;
}

/** All currently open details (visible panels). Order is insertion order. */
export function visibleDetails(state: FormulaDetailState): FormulaDetailEntry[] {
	return Object.values(state.entries).filter((e) => e.open);
}

/** Detail kinds currently open on ONE formula (independence witness). */
export function openKinds(state: FormulaDetailState, formulaId: string): ComposerFormulaDetailKind[] {
	return Object.values(state.entries)
		.filter((e) => e.formulaId === formulaId && e.open)
		.map((e) => e.detailKind);
}

export function activeVariant(entry: FormulaDetailEntry | undefined): FormulaDetailVariant | undefined {
	if (!entry) return undefined;
	return entry.variants.find((v) => v.variantId === entry.activeVariantId);
}

// ── mutations (each touches exactly one key) ─────────────────────────────────

/**
 * Open a detail, starting a first streaming variant if none exists (or if a
 * prior result was closed-and-dropped). Reopening a kept/closed entry preserves
 * its variant history. Never touches any other key — opening does not close
 * siblings (no global accordion).
 */
export function openDetail(
	state: FormulaDetailState,
	formulaId: string,
	kind: ComposerFormulaDetailKind,
	firstVariantId: string,
	instruction?: string,
): FormulaDetailState {
	const key = detailKey(formulaId, kind);
	const existing = state.entries[key];
	if (existing && existing.variants.length > 0) {
		return patch(state, key, { ...existing, open: true });
	}
	const variant: FormulaDetailVariant = {
		variantId: firstVariantId,
		status: 'streaming',
		streamingText: '',
		...(instruction !== undefined ? { instruction } : {}),
	};
	return patch(state, key, {
		formulaId,
		detailKind: kind,
		open: true,
		variants: [variant],
		activeVariantId: firstVariantId,
		kept: false,
		applied: false,
	});
}

/**
 * Close a detail. When not kept, the result is discarded (entry removed); when
 * kept, the annotation is retained (collapsed, reopenable). §10.2 close.
 */
export function closeDetail(
	state: FormulaDetailState,
	formulaId: string,
	kind: ComposerFormulaDetailKind,
): FormulaDetailState {
	const key = detailKey(formulaId, kind);
	const existing = state.entries[key];
	if (!existing) return state;
	if (!existing.kept || existing.applied) return remove(state, key);
	return patch(state, key, { ...existing, open: false });
}

/** Accept-keep-annotation: pin the detail so it survives close (§10.2). */
export function keepDetail(
	state: FormulaDetailState,
	formulaId: string,
	kind: ComposerFormulaDetailKind,
): FormulaDetailState {
	const key = detailKey(formulaId, kind);
	const existing = state.entries[key];
	if (!existing) return state;
	return patch(state, key, { ...existing, kept: true, applied: false });
}

/** Mark one split review as written without mislabelling it as a kept annotation. */
export function markDetailApplied(
	state: FormulaDetailState,
	formulaId: string,
	kind: ComposerFormulaDetailKind,
): FormulaDetailState {
	const key = detailKey(formulaId, kind);
	const existing = state.entries[key];
	if (!existing || kind !== 'split') return state;
	return patch(state, key, { ...existing, kept: false, applied: true });
}

/** Append a streamed delta to a variant. */
export function appendDelta(
	state: FormulaDetailState,
	formulaId: string,
	kind: ComposerFormulaDetailKind,
	variantId: string,
	delta: string,
): FormulaDetailState {
	return updateVariant(state, formulaId, kind, variantId, (v) => ({
		...v,
		streamingText: v.streamingText + delta,
	}));
}

/** Mark a variant ready with its materialized annotation. */
export function markVariantReady(
	state: FormulaDetailState,
	formulaId: string,
	kind: ComposerFormulaDetailKind,
	variantId: string,
	payload: ComposerFormulaAnnotationPayload,
): FormulaDetailState {
	return updateVariant(state, formulaId, kind, variantId, (v) => ({
		...v,
		status: 'ready',
		payload,
	}));
}

export function markVariantFailed(
	state: FormulaDetailState,
	formulaId: string,
	kind: ComposerFormulaDetailKind,
	variantId: string,
): FormulaDetailState {
	return updateVariant(state, formulaId, kind, variantId, (v) => ({ ...v, status: 'failed' }));
}

/**
 * Append a regeneration / targeted-follow-up variant and make it active. The
 * previous variants stay as history (§10.2 variant history). Requires the detail
 * to exist and be open.
 */
export function regenerate(
	state: FormulaDetailState,
	formulaId: string,
	kind: ComposerFormulaDetailKind,
	variantId: string,
	instruction?: string,
): FormulaDetailState {
	const key = detailKey(formulaId, kind);
	const existing = state.entries[key];
	if (!existing) return state;
	const variant: FormulaDetailVariant = {
		variantId,
		status: 'streaming',
		streamingText: '',
		...(instruction !== undefined ? { instruction } : {}),
	};
	return patch(state, key, {
		...existing,
		variants: [...existing.variants, variant],
		activeVariantId: variantId,
		kept: false,
		applied: false,
	});
}

/** Switch the visible variant (variant-history navigation). */
export function setActiveVariant(
	state: FormulaDetailState,
	formulaId: string,
	kind: ComposerFormulaDetailKind,
	variantId: string,
): FormulaDetailState {
	const key = detailKey(formulaId, kind);
	const existing = state.entries[key];
	if (!existing || !existing.variants.some((v) => v.variantId === variantId)) return state;
	return patch(state, key, { ...existing, activeVariantId: variantId });
}

// ── internals ────────────────────────────────────────────────────────────────

function patch(state: FormulaDetailState, key: string, entry: FormulaDetailEntry): FormulaDetailState {
	return { entries: { ...state.entries, [key]: entry } };
}

function remove(state: FormulaDetailState, key: string): FormulaDetailState {
	if (!(key in state.entries)) return state;
	const next = { ...state.entries };
	delete next[key];
	return { entries: next };
}

function updateVariant(
	state: FormulaDetailState,
	formulaId: string,
	kind: ComposerFormulaDetailKind,
	variantId: string,
	fn: (v: FormulaDetailVariant) => FormulaDetailVariant,
): FormulaDetailState {
	const key = detailKey(formulaId, kind);
	const existing = state.entries[key];
	if (!existing) return state;
	let touched = false;
	const variants = existing.variants.map((v) => {
		if (v.variantId !== variantId) return v;
		touched = true;
		return fn(v);
	});
	if (!touched) return state;
	return patch(state, key, { ...existing, variants });
}
