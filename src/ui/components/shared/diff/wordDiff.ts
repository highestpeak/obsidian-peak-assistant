export interface DiffSegment {
    text: string;
    type: 'equal' | 'added' | 'removed';
}

/**
 * Word-level diff using LCS. Splits on whitespace boundaries (preserving whitespace).
 */
export function diffWords(original: string, modified: string): DiffSegment[] {
    const oldTokens = tokenize(original);
    const newTokens = tokenize(modified);

    // Build LCS table
    const m = oldTokens.length;
    const n = newTokens.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = oldTokens[i - 1] === newTokens[j - 1]
                ? dp[i - 1][j - 1] + 1
                : Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
    }

    // Backtrack
    const result: DiffSegment[] = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && oldTokens[i - 1] === newTokens[j - 1]) {
            result.push({ text: oldTokens[i - 1], type: 'equal' });
            i--; j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            result.push({ text: newTokens[j - 1], type: 'added' });
            j--;
        } else {
            result.push({ text: oldTokens[i - 1], type: 'removed' });
            i--;
        }
    }

    return mergeSegments(result.reverse());
}

/** Split text into word + whitespace tokens */
function tokenize(text: string): string[] {
    return text.split(/(\s+)/);
}

/** Merge consecutive segments of the same type */
function mergeSegments(segments: DiffSegment[]): DiffSegment[] {
    const merged: DiffSegment[] = [];
    for (const seg of segments) {
        const last = merged[merged.length - 1];
        if (last && last.type === seg.type) {
            last.text += seg.text;
        } else {
            merged.push({ ...seg });
        }
    }
    return merged;
}
