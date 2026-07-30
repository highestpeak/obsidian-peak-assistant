/**
 * Peak Composer — paste-URL-into-selection serializer (WP4, §7.5).
 *
 * A URL paste over a selection turns the selected text into a link, inside the
 * same transaction system as every other edit. The semantic guard is the whole
 * point: a link may only land on ONE semantic unit (one paragraph / list item /
 * table cell). A selection that spans a structural boundary is REFUSED with a
 * reason (never a destructive wrapper across `p`/`li`/`td`) — the chrome shows
 * the explanation and the selection is left untouched.
 *
 * Pure/framework-neutral; whether a target is an internal vault note is decided
 * by the app-layer adapter and passed in as `internalTarget`.
 */

import type { ComposerOperation, ComposerSelection, SelectionOpResult } from '@/core/composer';
import {
	canonicalizeExternalLinkSelection,
	shouldCanonicalizeLinkAsHtml,
} from './canonicalInlineHtml';
import { visibleSelectionSegments, wrapVisibleSegments } from './visibleSegments';

export interface PasteUrlOptions {
	/**
	 * When set, the URL resolved to a vault note and the link is written as an
	 * Obsidian wikilink `[[internalTarget|text]]`; otherwise a Markdown link
	 * `[text](url)` is written.
	 */
	internalTarget?: string;
	label?: string;
}

/** Build the link operation for a pasted URL, or refuse across a structural boundary. */
export function pasteUrlIntoSelection(
	selection: ComposerSelection,
	url: string,
	options: PasteUrlOptions = {},
): SelectionOpResult {
	if (selection.collapsed || selection.units.length === 0) {
		return { ok: false, reason: 'empty-selection', message: 'Select the text to link first.' };
	}
	// §7.5 L440: a hyperlink can only sit inside a single paragraph / list item /
	// table cell. Anything wider is refused rather than wrapped destructively.
	if (selection.units.length > 1) {
		return {
			ok: false,
			reason: 'cross-structure-link',
			message: 'A link can only land inside a single paragraph, list item or table cell.',
		};
	}

	const unit = selection.units[0];
	const text = selection.sourceText.slice(unit.from, unit.to);
	if (!text.trim()) {
		return { ok: false, reason: 'empty-selection', message: 'Select the text to link first.' };
	}

	const lead = text.length - text.trimStart().length;
	const trail = text.length - text.trimEnd().length;
	const from = unit.from + lead;
	const to = unit.to - trail;
	const allSegments = visibleSelectionSegments(selection.sourceText, { ...unit, from, to });
	const segments = allSegments.filter((segment) => !segment.linkTarget);
	if (segments.length === 0) {
		return { ok: false, reason: 'empty-selection', message: 'The selected text is already linked.' };
	}
	if (shouldCanonicalizeLinkAsHtml(selection.sourceText, allSegments)) {
		if (options.internalTarget) {
			return {
				ok: false,
				reason: 'semantic-inline-html-format',
				message: 'Vault wikilinks cannot be merged into an HTML style run.',
			};
		}
		const canonical = canonicalizeExternalLinkSelection(
			selection.sourceText,
			{ ...unit, from, to },
			segments,
			url,
		);
		if (!canonical.ok) {
			return {
				ok: false,
				reason: canonical.reason,
				message: 'Links, inline code and formulas cannot be merged into an HTML style run.',
			};
		}
		const op: ComposerOperation = {
			kind: 'replaceRange',
			...canonical.patch,
		};
		return { ok: true, operations: [op], label: options.label ?? 'Add link' };
	}
	const open = options.internalTarget ? `[[${options.internalTarget}|` : '[';
	const close = options.internalTarget ? ']]' : `](${url})`;
	const replacement = wrapVisibleSegments(selection.sourceText, from, to, segments, open, close);
	const op: ComposerOperation = { kind: 'replaceRange', from, to, text: replacement };
	return { ok: true, operations: [op], label: options.label ?? 'Add link' };
}
