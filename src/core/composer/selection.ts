/**
 * Peak Composer — inline selection & formatting model (WP4, framework-neutral).
 *
 * The editing chrome (selection toolbar, Easy Copy, paste-URL, comments) speaks
 * this model; the mark-aware serializer in the service layer turns a
 * {@link ComposerSelection} into atomic {@link ComposerOperation}s. Like the
 * rest of `core/composer`, these types know nothing about the DOM, React or
 * Obsidian — the UI resolves a browser Range into this shape and the service
 * layer produces source patches from it, so both sides are testable in Node.
 *
 * Design contract (handoff §7.3 / WP0 S2 gate):
 *   - A selection is split into one {@link ComposerSelectionUnit} per semantic
 *     inline unit (paragraph / heading text / list item / table cell / callout
 *     body). Formatting NEVER wraps a structural node (`p`/`li`/`tr`/`td`) in a
 *     single HTML wrapper — every unit gets its own in-range patch (§7.3 L425).
 *   - Each unit's `[from,to)` is a byte range strictly INSIDE that unit's source
 *     slice, so a per-unit patch can never absorb the inter-block/inter-cell
 *     separator (the WP1/WP2 patch contract).
 */

import type { ComposerBlockKind, ComposerUnitKind } from './types';

/** The deterministic inline marks the selection toolbar can apply (§7.2). */
export type ComposerInlineMark =
	| 'bold'
	| 'italic'
	| 'underline'
	| 'strikethrough'
	| 'text-color'
	| 'highlight';

/**
 * The kind of semantic inline unit a selection slice lives in. `block-text` is
 * a top-level prose/quote paragraph; `heading-text` is a heading's text after
 * the `#` markers; the rest mirror {@link ComposerUnitKind}.
 */
export type ComposerSelectionUnitKind = ComposerUnitKind | 'block-text' | 'heading-text';

/**
 * One semantic inline unit inside a selection. `from`/`to` are UTF-16 offsets
 * into {@link ComposerSelection.sourceText} bounding the selected inline slice
 * of this unit — always inside the unit's own source range.
 */
export interface ComposerSelectionUnit {
	blockId: string;
	blockKind: ComposerBlockKind;
	/** Present for addressable sub-units (list item / table cell / callout body). */
	unitId?: string;
	unitKind: ComposerSelectionUnitKind;
	from: number;
	to: number;
}

/**
 * Selection scope, used both for the toolbar's scope label and for guards
 * (paste-URL / single-anchor comments require a `single` scope).
 */
export type SelectionScopeKind =
	| 'single'
	| 'cross-paragraph'
	| 'cross-block'
	| 'cross-item'
	| 'cross-cell';

/**
 * A frozen selection snapshot. AI text actions and paste-URL target THIS
 * snapshot, not the live browser selection (§7.2 L410): later focus/selection
 * changes must not mutate an in-flight formatting/paste run.
 */
export interface ComposerSelection {
	/** Verbatim source the unit offsets index into (the frozen revision's text). */
	sourceText: string;
	/** One entry per semantic inline unit the selection covers, in document order. */
	units: readonly ComposerSelectionUnit[];
	scope: SelectionScopeKind;
	/** The raw selected text (concatenated), for Easy Copy / labels. */
	text: string;
	collapsed: boolean;
}

/** Why a formatting / paste-URL request was refused (chrome shows the reason). */
export type SelectionGuardReason =
	| 'code-block-rich-format'
	| 'cross-structure-link'
	| 'empty-selection';

/** Result of a selection operation the chrome can act on. */
export type SelectionOpResult =
	| { ok: true; operations: readonly import('./operations').ComposerOperation[]; label: string }
	| { ok: false; reason: SelectionGuardReason; message: string };
