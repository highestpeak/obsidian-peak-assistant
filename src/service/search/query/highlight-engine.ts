import type { QueryPlan } from '@/service/search/query/query-parser';
import { porterStem } from '@/core/utils/porter-stemmer';
import { segmentToWhitespace } from '@/core/utils/segmenter';
import {
    SEARCH_HIGHLIGHT_HINT_WEIGHT,
    SEARCH_HIGHLIGHT_HINT_DECAY,
} from '@/core/constant';

const CJK_RE = /[　-鿿가-힯豈-﫿]/;

export type HighlightSpan = { start: number; end: number; type: 'exact' | 'stem' | 'fuzzy' };
export type HighlightResult = { text: string; spans: HighlightSpan[] };

// Multi-window snippet knobs. Each anchor gets a small sub-window; overlapping
// picks are merged so the joined snippet never repeats text.
const SNIPPET_MAX_WINDOWS = 3;
const SNIPPET_WIN_BEFORE = 50;
const SNIPPET_WIN_AFTER = 90;
const SNIPPET_MERGE_GAP = 20;
const SNIPPET_JOINER = ' … ';
// When the caller passes a hintOffset (chunk-anchored source), subsequent
// windows must land within this radius so multi-window doesn't drag in
// matches from unrelated chunks in the same big file. Chosen tighter than
// SEARCH_HIGHLIGHT_HINT_DECAY (400) so a hinted call stays inside a
// paragraph-sized context around the retrieved chunk.
const SNIPPET_HINT_RADIUS = 300;

// Sanitize markup noise that shows up in snippets — wiki-links, markdown
// links, JSON escape residue, and long runs of whitespace. Span positions
// are re-mapped through the edit list so highlights stay aligned; spans that
// land entirely inside a removed range are dropped.
type Edit = { start: number; end: number; newText: string };

const SANITIZE_RULES: Array<{ re: RegExp; replace: (m: RegExpMatchArray) => string }> = [
    // Wiki-links (`[[X]]`, `[[X|Y]]`, `![[X]]`) are intentionally preserved:
    // they carry Obsidian link semantics that users rely on to distinguish
    // "note explicitly links to X" from "prose mentions X". Only markdown
    // links and structural noise get stripped below.

    // Markdown link — keep the anchor text, drop the URL. Only when the URL
    // looks like a path/http, so we don't accidentally strip prose brackets.
    { re: /\[([^\]\n]+)\]\((?:https?:\/\/|\/|\.\.?\/|[A-Za-z0-9_-]+\/)[^)\n]+\)/g, replace: (m) => m[1] },
    // Orphan `](url)` tail — happens when the snippet window sliced off the
    // opening `[` of a markdown link. Drop just the URL half; leaves the
    // preceding anchor text intact.
    { re: /\]\((?:https?:\/\/|\/|\.\.?\/|[A-Za-z0-9_-]+\/)[^)\n]+\)/g, replace: () => '' },
    // Long absolute / relative path (5+ segments) in prose — a whole file
    // path pasted as note body. Compress to `…/lastSegment` so the snippet
    // shows the meaningful tail without the filesystem lineage. Runs after
    // markdown-link rules so paths inside `[X](path)` stay owned by those.
    {
        re: /(?:\/[^\s/]+){5,}/g,
        replace: (m) => {
            const parts = m[0].split('/');
            return '…/' + parts[parts.length - 1];
        },
    },
    // JSON escape residue from serialized dumps stored as note body.
    { re: /\\"/g, replace: () => '"' },
    { re: /\\n/g, replace: () => ' ' },
    { re: /\\t/g, replace: () => ' ' },
];

function collectEdits(text: string): Edit[] {
    const edits: Edit[] = [];
    for (const { re, replace } of SANITIZE_RULES) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) {
            const start = m.index;
            const end = m.index + m[0].length;
            if (edits.some(e => start < e.end && end > e.start)) continue;
            edits.push({ start, end, newText: replace(m) });
            if (m[0].length === 0) re.lastIndex++;
        }
    }
    edits.sort((a, b) => a.start - b.start);
    return edits;
}

function translatePos(pos: number, edits: Edit[]): number {
    let delta = 0;
    for (const e of edits) {
        if (pos >= e.end) delta += e.newText.length - (e.end - e.start);
        else if (pos > e.start) return -1;
        else break;
    }
    return pos + delta;
}

function sanitizeSnippet(input: HighlightResult): HighlightResult {
    const edits = collectEdits(input.text);
    let out = '';
    let cursor = 0;
    for (const e of edits) {
        out += input.text.slice(cursor, e.start) + e.newText;
        cursor = e.end;
    }
    out += input.text.slice(cursor);
    const remapped: HighlightSpan[] = [];
    for (const s of input.spans) {
        const ns = translatePos(s.start, edits);
        const ne = translatePos(s.end, edits);
        if (ns < 0 || ne < 0 || ne <= ns) continue;
        remapped.push({ start: ns, end: ne, type: s.type });
    }
    // Whitespace collapse — a second pass so the rule list above stays simple.
    // Also trims leading/trailing whitespace introduced by dropped embeds.
    return collapseWhitespace({ text: out, spans: remapped });
}

function collapseWhitespace(input: HighlightResult): HighlightResult {
    const src = input.text;
    // Build a position map src[i] → dst index while collapsing whitespace runs
    // to a single space and trimming leading/trailing whitespace.
    const map = new Int32Array(src.length + 1);
    let dst = '';
    let seenNonWs = false;
    let lastWasWs = false;
    for (let i = 0; i < src.length; i++) {
        map[i] = dst.length;
        const c = src[i];
        const ws = c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v';
        if (!ws) {
            dst += c;
            seenNonWs = true;
            lastWasWs = false;
        } else if (seenNonWs && !lastWasWs) {
            dst += ' ';
            lastWasWs = true;
        }
    }
    map[src.length] = dst.length;
    // Trim trailing space introduced by the loop when src ends with whitespace.
    let trimmed = dst;
    if (trimmed.endsWith(' ')) trimmed = trimmed.slice(0, -1);
    const spans: HighlightSpan[] = [];
    for (const s of input.spans) {
        const ns = Math.min(map[Math.min(s.start, src.length)], trimmed.length);
        const ne = Math.min(map[Math.min(s.end, src.length)], trimmed.length);
        if (ne > ns) spans.push({ start: ns, end: ne, type: s.type });
    }
    return { text: trimmed, spans };
}

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

        // CJK sub-token fallback: a CJK term like "英语练习" is stored as a single
        // token because there is no whitespace, but the FTS retrievers match it
        // via segmentation and fuzzy expansion (e.g. `英语练习 → 练习`). Without
        // this fallback the snippet/title stay un-highlighted even when the user
        // sees the corrected token in the text. Sub-tokens are marked 'fuzzy'.
        for (const sub of this.cjkSubTokens(plan)) {
            let pos = 0;
            while (pos < lower.length) {
                const idx = lower.indexOf(sub, pos);
                if (idx === -1) break;
                const end = idx + sub.length;
                if (!this.overlapsAny(spans, idx, end)) {
                    spans.push({ start: idx, end, type: 'exact' });
                }
                pos = idx + sub.length;
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

        // CJK sub-token fallback. See `highlight()` for the motivation — the
        // retriever may match a segmented sub-token of a CJK term even when the
        // full merged term is not a substring. Styled as an exact hit so users
        // see one consistent highlight colour.
        for (const sub of this.cjkSubTokens(plan)) {
            let pos = 0;
            while (pos < lower.length) {
                const idx = lower.indexOf(sub, pos);
                if (idx === -1) break;
                allMatches.push({ start: idx, end: idx + sub.length, type: 'exact' });
                pos = idx + sub.length;
            }
        }

        if (allMatches.length === 0) {
            // No matches: return snippet from around the hint (if any) or the beginning.
            const windowLen = windowBefore + windowAfter;
            const startFromHint = hintOffset !== undefined
                ? Math.max(0, Math.min(rawContent.length - windowLen, hintOffset - windowBefore))
                : 0;
            const snippet = rawContent.slice(startFromHint, startFromHint + windowLen);
            return sanitizeSnippet({ text: snippet, spans: [] });
        }

        // Pick up to N disjoint mini-windows around top-scoring anchors so multi-hit
        // docs surface multiple contexts instead of one long block. Widths are per
        // sub-window; total budget stays bounded by SNIPPET_MAX_WINDOWS. When
        // hintOffset is set, first-pick scoring is hint-biased and subsequent
        // picks are constrained to a radius so we don't drag in matches from an
        // unrelated chunk in the same big file.
        const subWindows = this.pickAnchorWindows(
            lower,
            allMatches,
            SNIPPET_WIN_BEFORE,
            SNIPPET_WIN_AFTER,
            SNIPPET_MAX_WINDOWS,
            hintOffset,
        );

        // Join sub-windows with a visible separator so users can tell "distinct
        // context blocks" apart. Match spans are translated into the joined text
        // via the per-window textOffset bookkeeping.
        let joined = '';
        const remap: Array<{ rawStart: number; rawEnd: number; textOffset: number }> = [];
        for (let i = 0; i < subWindows.length; i++) {
            const w = subWindows[i];
            if (i > 0) joined += SNIPPET_JOINER;
            remap.push({ rawStart: w.start, rawEnd: w.end, textOffset: joined.length });
            joined += rawContent.slice(w.start, w.end);
        }

        const joinedSpans: HighlightSpan[] = [];
        for (const m of allMatches) {
            for (const r of remap) {
                if (m.start >= r.rawStart && m.end <= r.rawEnd) {
                    joinedSpans.push({
                        start: r.textOffset + (m.start - r.rawStart),
                        end: r.textOffset + (m.end - r.rawStart),
                        type: m.type,
                    });
                    break;
                }
            }
        }

        return sanitizeSnippet({
            text: joined,
            spans: this.mergeOverlappingSpans(joinedSpans),
        });
    }

    /**
     * Greedy pick of up to `maxWindows` disjoint anchor windows. Each iteration
     * scores every remaining match by the window it would seed (unique-keyword
     * coverage + density), takes the best, masks out any matches inside it, and
     * repeats. Overlapping/adjacent picked windows are merged so the joined
     * snippet doesn't repeat text.
     */
    private pickAnchorWindows(
        lower: string,
        matches: HighlightSpan[],
        windowBefore: number,
        windowAfter: number,
        maxWindows: number,
        hintOffset?: number,
    ): Array<{ start: number; end: number }> {
        const windowLen = windowBefore + windowAfter;
        const remaining = new Set<number>(matches.map((_, i) => i));
        const picked: Array<{ start: number; end: number }> = [];
        while (picked.length < maxWindows && remaining.size > 0) {
            let bestIdx = -1;
            let bestScore = -1;
            let bestStart = 0;
            let bestEnd = 0;
            for (const i of remaining) {
                const anchor = matches[i];
                const winStart = Math.max(0, anchor.start - windowBefore);
                const winEnd = Math.min(lower.length, winStart + windowLen);
                const adjStart = Math.max(0, winEnd - windowLen);
                // After a first pick, only accept candidates within HINT_RADIUS
                // of the hint so distant chunks don't leak into the snippet.
                if (hintOffset !== undefined && picked.length > 0) {
                    const winCenter = adjStart + (winEnd - adjStart) / 2;
                    if (Math.abs(winCenter - hintOffset) > SNIPPET_HINT_RADIUS) continue;
                }
                let covered = new Set<string>();
                let matchChars = 0;
                for (const j of remaining) {
                    const mj = matches[j];
                    if (mj.start >= adjStart && mj.end <= winEnd) {
                        covered.add(lower.slice(mj.start, mj.end));
                        matchChars += mj.end - mj.start;
                    }
                }
                const actualLen = winEnd - adjStart;
                const density = actualLen > 0 ? matchChars / actualLen : 0;
                let score = covered.size * 2 + density;
                // Hint proximity bias — mirror the old findBestWindow so the
                // first pick lands near the caller's expected chunk.
                if (hintOffset !== undefined) {
                    const winCenter = adjStart + (winEnd - adjStart) / 2;
                    const distance = Math.abs(winCenter - hintOffset);
                    score += SEARCH_HIGHLIGHT_HINT_WEIGHT * Math.exp(-distance / SEARCH_HIGHLIGHT_HINT_DECAY);
                }
                if (score > bestScore) {
                    bestScore = score;
                    bestIdx = i;
                    bestStart = adjStart;
                    bestEnd = winEnd;
                }
            }
            if (bestIdx < 0) break;
            picked.push({ start: bestStart, end: bestEnd });
            for (const i of Array.from(remaining)) {
                const m = matches[i];
                if (m.start >= bestStart && m.end <= bestEnd) remaining.delete(i);
            }
        }
        // Sort and merge overlapping / near-adjacent windows so the joiner never
        // stitches two windows across almost-identical text.
        picked.sort((a, b) => a.start - b.start);
        const merged: Array<{ start: number; end: number }> = [];
        for (const w of picked) {
            const last = merged[merged.length - 1];
            if (last && w.start - last.end < SNIPPET_MERGE_GAP) {
                last.end = Math.max(last.end, w.end);
            } else {
                merged.push({ start: w.start, end: w.end });
            }
        }
        return merged;
    }

    /**
     * Expand plan.terms into CJK sub-tokens for fallback highlighting. Returns
     * lowercased unique sub-tokens that are shorter than the parent term (so
     * we don't duplicate the exact-match pass) and non-trivial (>= 1 char).
     * Empty when no plan term contains CJK — zero-alloc on the common path.
     */
    private cjkSubTokens(plan: QueryPlan): string[] {
        const out = new Set<string>();
        for (const term of plan.terms) {
            const text = term.text.toLowerCase();
            if (!CJK_RE.test(text)) continue;
            const segmented = segmentToWhitespace(text);
            if (!segmented) continue;
            for (const part of segmented.split(/\s+/)) {
                const p = part.trim().toLowerCase();
                if (!p || p === text) continue;
                out.add(p);
            }
        }
        return [...out];
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
