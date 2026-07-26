/**
 * Peak Composer — word-level in-place diff (CMP-REV-02, framework-neutral).
 *
 * Projects a `(before, after)` string pair into a flat run of diff segments the
 * candidate card paints IN PLACE: deleted words struck through at their original
 * position, inserted words highlighted — never a whole-line duplicate. This is a
 * pure RENDER PROJECTION: it owns no state, touches no DOM/React/Obsidian, and is
 * unit-tested in Node.
 *
 * Segmentation grammar (spec CMP-REV-02):
 *   - English / Latin words + digit runs are one token (compared whole);
 *   - each CJK character is its own token ("按字" — Chinese diffs per character);
 *   - each non-word punctuation / symbol is its own single token;
 *   - whitespace is its own token but never surfaces as a standalone del/ins:
 *     a pure-whitespace deletion is dropped and a pure-whitespace insertion is
 *     folded into the surrounding flow ("纯空白变化归入相邻词").
 *
 * The alignment is a classic O(n·m) LCS DP over the token arrays — exact for the
 * paragraph-sized inputs the card handles. Inputs whose token count exceeds
 * {@link MAX_DIFF_TOKENS} degrade to a single whole-segment replacement so a
 * pathological paste never blocks the render thread.
 *
 * Post-conditions (asserted by test/composer-word-diff.test.ts):
 *   - adjacent same-kind segments are merged (no run of two `del`s in a row);
 *   - `same + del` segment text, concatenated, reproduces `before`
 *     (modulo dropped pure-whitespace deletions);
 *   - `same + ins` segment text, concatenated, reproduces `after`.
 */

import type {
	ComposerCandidate,
	ComposerDocumentSnapshot,
	ComposerResultEnvelope,
} from '@/core/composer';

export type DiffSegmentKind = 'same' | 'del' | 'ins';

export interface DiffSegment {
	kind: DiffSegmentKind;
	text: string;
}

/** Token-count ceiling per side; above it the diff degrades to a whole replace. */
export const MAX_DIFF_TOKENS = 2000;

// ── tokenization ────────────────────────────────────────────────────────────

/** Latin word char: ASCII letters/digits + Latin-1/Extended letters. */
function isWordChar(cp: number): boolean {
	return (
		(cp >= 0x30 && cp <= 0x39) || // 0-9
		(cp >= 0x41 && cp <= 0x5a) || // A-Z
		(cp >= 0x61 && cp <= 0x7a) || // a-z
		(cp >= 0xc0 && cp <= 0x24f) // Latin-1 Supplement + Extended-A/B letters
	);
}

function isWsChar(cp: number): boolean {
	// space, tab, CR, LF, form-feed, vertical tab, NBSP, ideographic space
	return cp === 0x20 || cp === 0x09 || cp === 0x0a || cp === 0x0d || cp === 0x0c || cp === 0x0b || cp === 0xa0 || cp === 0x3000;
}

/**
 * Split into diff tokens: whitespace runs and Latin word runs stay contiguous;
 * every other code point (CJK, punctuation, symbol, emoji) is its own token.
 */
function tokenize(text: string): string[] {
	const tokens: string[] = [];
	let i = 0;
	while (i < text.length) {
		const cp = text.codePointAt(i)!;
		const width = cp > 0xffff ? 2 : 1;
		if (isWsChar(cp)) {
			let j = i + width;
			while (j < text.length) {
				const next = text.codePointAt(j)!;
				if (!isWsChar(next)) break;
				j += next > 0xffff ? 2 : 1;
			}
			tokens.push(text.slice(i, j));
			i = j;
			continue;
		}
		if (isWordChar(cp)) {
			let j = i + width;
			while (j < text.length) {
				const next = text.codePointAt(j)!;
				if (!isWordChar(next)) break;
				j += next > 0xffff ? 2 : 1;
			}
			tokens.push(text.slice(i, j));
			i = j;
			continue;
		}
		// CJK / punctuation / symbol: one code point per token.
		tokens.push(text.slice(i, i + width));
		i += width;
	}
	return tokens;
}

function isPureWhitespace(text: string): boolean {
	if (text.length === 0) return false;
	for (let i = 0; i < text.length; i++) {
		if (!isWsChar(text.codePointAt(i)!)) return false;
	}
	return true;
}

// ── core diff ───────────────────────────────────────────────────────────────

/**
 * Word-level diff of `before` → `after`. See the module header for the grammar
 * and invariants. Returns a flat, merged run of {@link DiffSegment}s.
 */
export function diffWords(before: string, after: string): DiffSegment[] {
	if (before === after) return before.length ? [{ kind: 'same', text: before }] : [];

	const a = tokenize(before);
	const b = tokenize(after);

	// Degrade guard: a pathological input becomes one whole-segment replacement.
	if (a.length > MAX_DIFF_TOKENS || b.length > MAX_DIFF_TOKENS) {
		return finalize([
			{ kind: 'del', text: before },
			{ kind: 'ins', text: after },
		]);
	}

	const raw = alignTokens(a, b);
	return finalize(raw);
}

/**
 * Two tokens are "equal" for alignment when identical, OR when both are pure
 * whitespace (any whitespace run matches any other). Loose whitespace equality
 * means a spacing-only difference (`foo  bar` vs `foo bar`) never becomes a
 * struck/highlighted space: the runs align and the segment simply carries the
 * AFTER-side spacing.
 */
function tokensEqual(a: string, b: string): boolean {
	if (a === b) return true;
	return isPureWhitespace(a) && isPureWhitespace(b);
}

/** LCS backtrack → token-granular raw segments (before merge / ws-folding). */
function alignTokens(a: string[], b: string[]): DiffSegment[] {
	const n = a.length;
	const m = b.length;
	// dp[i][j] = LCS length of a[i..] and b[j..]; extra row/col of zeros.
	const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			dp[i][j] = tokensEqual(a[i], b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
		}
	}
	const raw: DiffSegment[] = [];
	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		if (tokensEqual(a[i], b[j])) {
			// Prefer the AFTER-side text so a matched-but-different whitespace run
			// renders the new spacing (identical tokens make the choice moot).
			raw.push({ kind: 'same', text: b[j] });
			i++;
			j++;
		} else if (dp[i + 1][j] >= dp[i][j + 1]) {
			raw.push({ kind: 'del', text: a[i] });
			i++;
		} else {
			raw.push({ kind: 'ins', text: b[j] });
			j++;
		}
	}
	while (i < n) raw.push({ kind: 'del', text: a[i++] });
	while (j < m) raw.push({ kind: 'ins', text: b[j++] });
	return raw;
}

/**
 * Merge adjacent same-kind runs FIRST, then fold ISOLATED pure-whitespace edits:
 *   - a fully-whitespace `del` run (a removed space with no deleted word around
 *     it) is dropped — removed spacing shows no strike;
 *   - a fully-whitespace `ins` run becomes `same` — added spacing renders plainly.
 * Merging first is what preserves the reconstruction law: a space BETWEEN two
 * deleted words is absorbed into the surrounding `del` run (so it is struck with
 * the words, not dropped), and only a genuinely standalone spacing change folds.
 */
function finalize(raw: DiffSegment[]): DiffSegment[] {
	const merged: DiffSegment[] = [];
	for (const seg of raw) {
		if (seg.text.length === 0) continue;
		const last = merged[merged.length - 1];
		if (last && last.kind === seg.kind) {
			last.text += seg.text;
			continue;
		}
		merged.push({ kind: seg.kind, text: seg.text });
	}
	const out: DiffSegment[] = [];
	for (const seg of merged) {
		let { kind } = seg;
		if (isPureWhitespace(seg.text)) {
			if (kind === 'del') continue; // isolated removed whitespace: no marker
			if (kind === 'ins') kind = 'same'; // isolated added whitespace folds into flow
		}
		const last = out[out.length - 1];
		if (last && last.kind === kind) {
			last.text += seg.text;
			continue;
		}
		out.push({ kind, text: seg.text });
	}
	return out;
}

// ── candidate → original ("before") text resolution ──────────────────────────

/**
 * Resolve the verbatim "before" text a text-patch candidate replaces, sliced
 * from the live snapshot at the candidate's frozen replace range. Returns null
 * (⇒ the card falls back to a plain replacement view, never a wrong slice) when:
 *   - the candidate is not a `text-patch` result;
 *   - its base revision drifted from the snapshot (offsets no longer align);
 *   - it carries no single `replaceRange` operation yet (still streaming);
 *   - the frozen range falls outside the snapshot source.
 *
 * A ready text-patch candidate's writeback compiles the replacement into exactly
 * one `replaceRange` over the target's base-revision anchor (writebackAdapters),
 * so `snapshot.sourceText.slice(from, to)` is the exact original the model saw.
 */
export function originalTextForTextPatchCandidate(
	snapshot: Pick<ComposerDocumentSnapshot, 'sourceText' | 'revision'> | null | undefined,
	candidate: Pick<ComposerCandidate, 'baseRevision' | 'proposedChange'>,
): string | null {
	if (!snapshot) return null;
	const envelope = candidate.proposedChange.result as ComposerResultEnvelope | undefined;
	if (!envelope || envelope.resultKind !== 'text-patch') return null;
	if (candidate.baseRevision !== snapshot.revision) return null;
	const replace = candidate.proposedChange.operations.find((op) => op.kind === 'replaceRange');
	if (!replace || replace.kind !== 'replaceRange') return null;
	const { from, to } = replace;
	if (from < 0 || to < from || to > snapshot.sourceText.length) return null;
	return snapshot.sourceText.slice(from, to);
}
