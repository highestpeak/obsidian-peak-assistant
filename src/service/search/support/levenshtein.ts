/**
 * Compute the Levenshtein edit distance between two strings.
 * Uses Wagner-Fischer DP with O(min(m,n)) space.
 */
export function levenshtein(a: string, b: string): number {
    // Ensure `a` is the shorter string to minimise memory usage
    if (a.length > b.length) {
        [a, b] = [b, a];
    }

    const m = a.length;
    const n = b.length;

    // prev[j] = distance between a[0..i-1] and b[0..j-1]
    let prev = Array.from({ length: m + 1 }, (_, i) => i);

    for (let j = 1; j <= n; j++) {
        const curr = new Array<number>(m + 1);
        curr[0] = j;
        for (let i = 1; i <= m; i++) {
            if (a[i - 1] === b[j - 1]) {
                curr[i] = prev[i - 1];
            } else {
                curr[i] = 1 + Math.min(prev[i - 1], prev[i], curr[i - 1]);
            }
        }
        prev = curr;
    }

    return prev[m];
}

/**
 * Find all vocabulary tokens within `maxDistance` Levenshtein distance of
 * `term`. Exact matches (distance 0) are excluded.
 * Results are sorted by distance ascending, then alphabetically.
 */
export function findFuzzyCandidates(
    term: string,
    vocabulary: string[],
    maxDistance = 2
): string[] {
    const candidates: Array<{ word: string; distance: number }> = [];

    for (const word of vocabulary) {
        const d = levenshtein(term, word);
        if (d > 0 && d <= maxDistance) {
            candidates.push({ word, distance: d });
        }
    }

    candidates.sort((x, y) => {
        if (x.distance !== y.distance) return x.distance - y.distance;
        return x.word < y.word ? -1 : x.word > y.word ? 1 : 0;
    });

    return candidates.map(c => c.word);
}
