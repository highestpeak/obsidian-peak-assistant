/**
 * Line-level diff using longest common subsequence. Returns an ordered list
 * of line operations: equal / removed / added.
 *
 * Lightweight enough for chunked review blocks (≪ 1k lines). Not optimised
 * for whole-document diffs — use a real diff lib for that.
 */

export type LineOp =
	| { type: 'equal'; oldLine: number; newLine: number; text: string }
	| { type: 'removed'; oldLine: number; text: string }
	| { type: 'added'; newLine: number; text: string };

function splitLines(input: string): string[] {
	if (input.length === 0) return [];
	return input.replace(/\r\n/g, '\n').split('\n');
}

function lcsTable(a: string[], b: string[]): number[][] {
	const m = a.length;
	const n = b.length;
	const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
	for (let i = m - 1; i >= 0; i--) {
		for (let j = n - 1; j >= 0; j--) {
			if (a[i] === b[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
			else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
		}
	}
	return dp;
}

export function diffLines(before: string, after: string): LineOp[] {
	const a = splitLines(before);
	const b = splitLines(after);
	const dp = lcsTable(a, b);
	const ops: LineOp[] = [];
	let i = 0;
	let j = 0;
	let oldLine = 1;
	let newLine = 1;
	while (i < a.length && j < b.length) {
		if (a[i] === b[j]) {
			ops.push({ type: 'equal', oldLine, newLine, text: a[i] });
			i++; j++; oldLine++; newLine++;
		} else if (dp[i + 1][j] >= dp[i][j + 1]) {
			ops.push({ type: 'removed', oldLine, text: a[i] });
			i++; oldLine++;
		} else {
			ops.push({ type: 'added', newLine, text: b[j] });
			j++; newLine++;
		}
	}
	while (i < a.length) {
		ops.push({ type: 'removed', oldLine, text: a[i] });
		i++; oldLine++;
	}
	while (j < b.length) {
		ops.push({ type: 'added', newLine, text: b[j] });
		j++; newLine++;
	}
	return ops;
}
