/**
 * Multilingual segmentation + normalization for SQLite FTS indexing.
 *
 * Goal:
 * - Convert any language into a whitespace-delimited string so FTS can tokenize reasonably.
 * - Provide a stable, language-agnostic normalization so `genial` matches `Génial`.
 *
 * Notes:
 * - Uses `Intl.Segmenter` (native) to avoid heavy tokenizer dependencies.
 * - Applies Unicode normalization + diacritics removal in JS to avoid depending on ICU extensions.
 */

/**
 * Remove Unicode combining marks after NFKD/NFD normalization.
 */
function stripCombiningMarks(text: string): string {
	try {
		// \p{M} = Mark (combining marks). Requires Unicode property escapes support.
		return text.replace(/\p{M}+/gu, '');
	} catch {
		// Fallback: best-effort for environments without Unicode property escapes.
		return text;
	}
}

/**
 * Normalize text for search (case-insensitive + diacritics-insensitive).
 */
export function normalizeForSearch(text: string): string {
	if (!text) return '';
	// NFKD decomposes compatibility characters and separates diacritics.
	const normalized = text.normalize('NFKD');
	return stripCombiningMarks(normalized).toLowerCase();
}

/**
 * Segment text into whitespace-delimited tokens using Intl.Segmenter.
 *
 * @param text Raw text
 * @param locale Optional locale hint (e.g. 'zh', 'ja', 'en')
 */
export function segmentToWhitespace(text: string, locale?: string): string {
	if (!text) return '';
	const input = text.replace(/\s+/g, ' ').trim();
	if (!input) return '';

	// If Intl.Segmenter is unavailable, fallback to whitespace normalization.
	const Seg = (Intl as any)?.Segmenter as (new (loc?: string | string[], opts?: { granularity: 'word' | 'grapheme' | 'sentence' }) => any) | undefined;
	if (!Seg) return input;

	try {
		const seg = new Seg(locale ? [locale] : undefined, { granularity: 'word' });
		const out: string[] = [];
		for (const part of seg.segment(input)) {
			const s = String(part.segment ?? '').trim();
			if (!s) continue;
			// Keep word-like segments; also keep non-word-like segments that are not pure whitespace.
			// This is intentionally permissive to avoid dropping useful CJK tokens.
			if (part.isWordLike === false) {
				// Skip pure punctuation to reduce noise.
				if (/^\p{P}+$/u.test(s)) continue;
			}
			out.push(s);
		}
		return out.join(' ').replace(/\s+/g, ' ').trim();
	} catch {
		return input;
	}
}

/**
 * Prepare text for FTS indexing: segment + normalize.
 */
export function normalizeTextForFts(text: string, locale?: string): string {
	return normalizeForSearch(segmentToWhitespace(text, locale));
}
