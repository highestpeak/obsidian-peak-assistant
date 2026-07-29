/**
 * Peak Composer — Obsidian `.base` (YAML view) structural adapter (WP8, §10.12).
 *
 * A `.base` file is a YAML document describing one or more views (table/board/…)
 * with filters, an `order` column list and `formulas`. The S4 spike (execution
 * log §S4) locked the approach: parse with the already-bundled `yaml` package's
 * CST-preserving `parseDocument`, apply TYPED patches through the Document API,
 * and re-serialize with `toString()`. This preserves comments, key order,
 * multi-line formula scalars and — critically — any field this code does not
 * model (future Obsidian keys survive round-trip by construction). We NEVER
 * string-replace to guess structure (handoff §10.12).
 *
 * Framework-neutral: no Obsidian / DOM imports. The app layer reads/writes the
 * separate `.base` file bytes through {@link ComposerNativeFilePort}; this
 * module only transforms text → text.
 */

import { parseDocument } from 'yaml';
import type { Document } from 'yaml';

/** A read-only structural summary of one view, for the preview surface. */
export interface BaseViewSummary {
	type: string;
	name: string;
	/** Column identifiers from the view's `order` list (verbatim). */
	order: string[];
	/** Number of top-level filter clauses (best-effort; 0 when absent). */
	filterCount: number;
	/** Formula keys defined on the view, in document order. */
	formulaKeys: string[];
	/** Formula expressions, retained for the visual configuration table. */
	formulas: Array<{ key: string; expression: string }>;
}

export interface BaseFilePreview {
	views: BaseViewSummary[];
	/** True when the file parsed as a legal YAML `.base` document with ≥1 view. */
	valid: boolean;
	/** Populated when `valid` is false. */
	reason?: string;
}

/**
 * Typed, non-destructive patches over a `.base` document. Each variant maps to a
 * single Document-API mutation; unknown fields are never touched.
 */
export type BaseFilePatch =
	| { op: 'rename-view'; viewIndex: number; name: string }
	| { op: 'add-order-column'; viewIndex: number; column: string }
	| { op: 'remove-order-column'; viewIndex: number; column: string }
	| { op: 'set-formula'; viewIndex: number; key: string; expression: string }
	| { op: 'remove-formula'; viewIndex: number; key: string }
	| { op: 'set-field'; path: Array<string | number>; value: unknown };

/** Parse `.base` bytes into a CST-preserving Document. Throws on malformed YAML. */
export function parseBaseDocument(raw: string): Document {
	const doc = parseDocument(raw);
	if (doc.errors.length > 0) {
		throw new Error(`invalid .base YAML: ${doc.errors[0]?.message ?? 'parse error'}`);
	}
	return doc;
}

function viewsOf(js: unknown): unknown[] {
	if (!js || typeof js !== 'object') return [];
	const views = (js as { views?: unknown }).views;
	return Array.isArray(views) ? views : [];
}

/** Build the read-only preview model from `.base` bytes (never throws). */
export function buildBasePreview(raw: string): BaseFilePreview {
	try {
		const doc = parseBaseDocument(raw);
		const js = doc.toJS() as unknown;
		const rawViews = viewsOf(js);
		if (rawViews.length === 0) {
			return { views: [], valid: false, reason: 'No views defined in this base' };
		}
		const views = rawViews.map((v) => summarizeView(v));
		return { views, valid: true };
	} catch (err) {
		return { views: [], valid: false, reason: err instanceof Error ? err.message : 'Could not parse base' };
	}
}

function summarizeView(view: unknown): BaseViewSummary {
	const v = (view ?? {}) as Record<string, unknown>;
	const order = Array.isArray(v.order) ? v.order.map((c) => String(c)) : [];
	const formulaObject = v.formulas && typeof v.formulas === 'object'
		? v.formulas as Record<string, unknown>
		: {};
	const formulas = Object.entries(formulaObject).map(([key, expression]) => ({
		key,
		expression: typeof expression === 'string' ? expression : String(expression ?? ''),
	}));
	return {
		type: typeof v.type === 'string' ? v.type : 'table',
		name: typeof v.name === 'string' ? v.name : '(unnamed)',
		order,
		filterCount: countFilters(v.filters),
		formulaKeys: formulas.map((formula) => formula.key),
		formulas,
	};
}

function countFilters(filters: unknown): number {
	if (!filters || typeof filters !== 'object') return 0;
	const f = filters as Record<string, unknown>;
	for (const key of ['and', 'or', 'not']) {
		const clause = f[key];
		if (Array.isArray(clause)) return clause.length;
	}
	return Object.keys(f).length;
}

/**
 * Apply typed patches to `.base` bytes, returning the CST-preserved serialized
 * result. Untouched keys/comments/unknown fields are byte-stable; only the
 * targeted nodes change. Throws on malformed YAML or an out-of-range view index.
 */
export function applyBasePatch(raw: string, patches: readonly BaseFilePatch[]): string {
	const doc = parseBaseDocument(raw);
	for (const patch of patches) applyOne(doc, patch);
	return doc.toString();
}

function applyOne(doc: Document, patch: BaseFilePatch): void {
	if (patch.op === 'set-field') {
		doc.setIn(patch.path, patch.value);
		return;
	}
	requireView(doc, patch.viewIndex);
	switch (patch.op) {
		case 'rename-view':
			doc.setIn(['views', patch.viewIndex, 'name'], patch.name);
			return;
		case 'add-order-column':
			addOrderColumn(doc, patch.viewIndex, patch.column);
			return;
		case 'remove-order-column':
			removeOrderColumn(doc, patch.viewIndex, patch.column);
			return;
		case 'set-formula':
			doc.setIn(['views', patch.viewIndex, 'formulas', patch.key], patch.expression);
			return;
		case 'remove-formula':
			doc.deleteIn(['views', patch.viewIndex, 'formulas', patch.key]);
			return;
	}
}

function requireView(doc: Document, index: number): void {
	const views = doc.getIn(['views']) as { items?: unknown[] } | undefined;
	const length = views && Array.isArray(views.items) ? views.items.length : 0;
	if (index < 0 || index >= length) {
		throw new Error(`.base patch: view index ${index} out of range (0..${length - 1})`);
	}
}

function addOrderColumn(doc: Document, viewIndex: number, column: string): void {
	const order = doc.getIn(['views', viewIndex, 'order']) as { add?: (v: unknown) => void; toJSON?: () => unknown[] } | undefined;
	if (order && typeof order.add === 'function') {
		const existing = typeof order.toJSON === 'function' ? order.toJSON() : [];
		if (Array.isArray(existing) && existing.map(String).includes(column)) return; // idempotent
		order.add(column);
		return;
	}
	// No order list yet — create one.
	doc.setIn(['views', viewIndex, 'order'], [column]);
}

function removeOrderColumn(doc: Document, viewIndex: number, column: string): void {
	const order = doc.getIn(['views', viewIndex, 'order']) as { toJSON?: () => unknown[] } | undefined;
	if (!order || typeof order.toJSON !== 'function') return;
	const values = order.toJSON();
	if (!Array.isArray(values)) return;
	const idx = values.map(String).indexOf(column);
	if (idx === -1) return;
	doc.deleteIn(['views', viewIndex, 'order', idx]);
}
