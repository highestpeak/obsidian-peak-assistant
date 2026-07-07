import type { QueryPlan } from '@/service/search/query/query-parser';
import { porterStem } from '@/core/utils/porter-stemmer';
import {
    SEARCH_HIGHLIGHT_HINT_WEIGHT,
    SEARCH_HIGHLIGHT_HINT_DECAY,
} from '@/core/constant';

export type HighlightSpan = { start: number; end: number; type: 'exact' | 'stem' | 'fuzzy' };
export type HighlightResult = { text: string; spans: HighlightSpan[] };

export class HighlightEngine {
    /**
     * Highlight short text (titles). Case-insensitive matching directly on text.
     * Phrases matched first as single spans, then individual terms (skip overlaps).
     */
    highlight(text: string, plan: QueryPlan): HighlightResult {
        const lower = text.toLowerCase();
        const spans: HighlightSpan[] = [];

        // Match phrases first
        for (const phrase of plan.phrases) {
            const phraseLower = phrase.toLowerCase();
            let pos = 0;
            while (pos < lower.length) {
                const idx = lower.indexOf(phraseLower, pos);
                if (idx === -1) break;
                spans.push({ start: idx, end: idx + phraseLower.length, type: 'exact' });
                pos = idx + phraseLower.length;
            }
        }

        // Match individual terms, skip overlaps with already-found spans
        for (const term of plan.terms) {
            const termText = term.text.toLowerCase();
            let pos = 0;
            while (pos < lower.length) {
                const idx = lower.indexOf(termText, pos);
                if (idx === -1) break;
                const end = idx + termText.length;
                if (!this.overlapsAny(spans, idx, end)) {
                    spans.push({ start: idx, end, type: 'exact' });
                }
                pos = idx + termText.length;
            }
        }

        return { text, spans: this.mergeOverlappingSpans(spans) };
    }

    /**
     * Highlight long content. Uses rawContent for display, matches on lowercased rawContent.
     * Selects best window, returns snippet with span positions relative to snippet start.
     */
    highlightSnippet(
        rawContent: string,
        normalizedContent: string,
        plan: QueryPlan,
        windowBefore = 80,
        windowAfter = 140,
        hintOffset?: number,
    ): HighlightResult {
        // Work on lowercased raw content for matching
        const lower = rawContent.toLowerCase();

        // Collect all matches as { start, end, type }
        const allMatches: HighlightSpan[] = [];

        // Phrase matches
        for (const phrase of plan.phrases) {
            const phraseLower = phrase.toLowerCase();
            let pos = 0;
            while (pos < lower.length) {
                const idx = lower.indexOf(phraseLower, pos);
                if (idx === -1) break;
                allMatches.push({ start: idx, end: idx + phraseLower.length, type: 'exact' });
                pos = idx + phraseLower.length;
            }
        }

        // Exact term matches
        for (const term of plan.terms) {
            const termText = term.text.toLowerCase();
            let pos = 0;
            while (pos < lower.length) {
                const idx = lower.indexOf(termText, pos);
                if (idx === -1) break;
                allMatches.push({ start: idx, end: idx + termText.length, type: 'exact' });
                pos = idx + termText.length;
            }

            // Stem matches (only when stem differs from text)
            const stemText = term.stem.toLowerCase();
            if (stemText !== termText) {
                let stemPos = 0;
                // Find word-boundary stem matches
                while (stemPos < lower.length) {
                    const idx = lower.indexOf(stemText, stemPos);
                    if (idx === -1) break;
                    // Check it's a word start (not mid-word)
                    const before = idx > 0 ? lower[idx - 1] : ' ';
                    if (!/\w/.test(before)) {
                        // Find word end (take the whole word)
                        let wordEnd = idx + stemText.length;
                        while (wordEnd < lower.length && /\w/.test(lower[wordEnd])) {
                            wordEnd++;
                        }
                        allMatches.push({ start: idx, end: wordEnd, type: 'stem' });
                    }
                    stemPos = idx + stemText.length;
                }
            }
        }

        if (allMatches.length === 0) {
            // No matches: return snippet from around the hint (if any) or the beginning.
            const windowLen = windowBefore + windowAfter;
            const startFromHint = hintOffset !== undefined
                ? Math.max(0, Math.min(rawContent.length - windowLen, hintOffset - windowBefore))
                : 0;
            const snippet = rawContent.slice(startFromHint, startFromHint + windowLen);
            return { text: snippet, spans: [] };
        }

        // Find best window
        const { start: winStart, end: winEnd } = this.findBestWindow(
            lower,
            allMatches,
            plan,
            windowBefore,
            windowAfter,
            hintOffset,
        );

        const snippet = rawContent.slice(winStart, winEnd);

        // Filter matches that fall within window and adjust positions
        const snippetSpans: HighlightSpan[] = allMatches
            .filter(m => m.start >= winStart && m.end <= winEnd)
            .map(m => ({ start: m.start - winStart, end: m.end - winStart, type: m.type }));

        return { text: snippet, spans: this.mergeOverlappingSpans(snippetSpans) };
    }

    private findBestWindow(
        content: string,
        matches: HighlightSpan[],
        _plan: QueryPlan,
        windowBefore: number,
        windowAfter: number,
        hintOffset?: number,
    ): { start: number; end: number } {
        const windowLen = windowBefore + windowAfter;
        let bestScore = -1;
        let bestStart = 0;

        for (const anchor of matches) {
            // Try centering window around this match
            const winStart = Math.max(0, anchor.start - windowBefore);
            const winEnd = Math.min(content.length, winStart + windowLen);
            const adjustedStart = Math.max(0, winEnd - windowLen);

            // Count unique keywords covered and total match chars
            const coveredKeywords = new Set<string>();
            let totalMatchChars = 0;

            for (const m of matches) {
                if (m.start >= adjustedStart && m.end <= winEnd) {
                    coveredKeywords.add(content.slice(m.start, m.end));
                    totalMatchChars += m.end - m.start;
                }
            }

            const actualWindowLen = winEnd - adjustedStart;
            const density = actualWindowLen > 0 ? totalMatchChars / actualWindowLen : 0;
            let score = coveredKeywords.size * 2 + density;

            // Hint proximity: when the caller knows which region of a large
            // whole-file source is the "expected" chunk, bias the window
            // toward that anchor so multi-chunk files don't always snap to
            // the first match found.
            if (hintOffset !== undefined) {
                const winCenter = adjustedStart + windowLen / 2;
                const distance = Math.abs(winCenter - hintOffset);
                score += SEARCH_HIGHLIGHT_HINT_WEIGHT * Math.exp(-distance / SEARCH_HIGHLIGHT_HINT_DECAY);
            }

            if (score > bestScore) {
                bestScore = score;
                bestStart = adjustedStart;
            }
        }

        const bestEnd = Math.min(content.length, bestStart + windowLen);
        return { start: bestStart, end: bestEnd };
    }

    private mergeOverlappingSpans(spans: HighlightSpan[]): HighlightSpan[] {
        if (spans.length === 0) return [];

        // Sort by start position
        const sorted = [...spans].sort((a, b) => a.start - b.start || a.end - b.end);
        const merged: HighlightSpan[] = [];
        let current = { ...sorted[0] };

        for (let i = 1; i < sorted.length; i++) {
            const next = sorted[i];
            if (next.start < current.end) {
                // Overlapping: extend and pick best type
                current.end = Math.max(current.end, next.end);
                current.type = this.betterType(current.type, next.type);
            } else {
                merged.push(current);
                current = { ...next };
            }
        }
        merged.push(current);
        return merged;
    }

    private betterType(a: HighlightSpan['type'], b: HighlightSpan['type']): HighlightSpan['type'] {
        const rank = { exact: 0, stem: 1, fuzzy: 2 };
        return rank[a] <= rank[b] ? a : b;
    }

    private overlapsAny(spans: HighlightSpan[], start: number, end: number): boolean {
        return spans.some(s => start < s.end && end > s.start);
    }
}
