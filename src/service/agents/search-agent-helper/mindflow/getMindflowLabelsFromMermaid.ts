/**
 * Lightweight extraction of node labels from MindFlow Mermaid by state.
 * Pattern: N1["label"]:::state. No regex; uses MINDFLOW_NODE_STATES.
 */

import { MINDFLOW_NODE_STATES } from './types';

/** Normalize a label: strip quotes, replace <br> with space, collapse whitespace. No regex. */
function normalizeLabel(s: string): string {
	let t = s.trim();
	if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
		t = t.slice(1, -1).trim();
	}
	const lower = t.toLowerCase();
	let withoutBr = '';
	for (let i = 0; i < t.length; i++) {
		if (lower.slice(i).startsWith('<br')) {
			const end = t.indexOf('>', i);
			if (end !== -1) {
				withoutBr += ' ';
				i = end;
				continue;
			}
		}
		withoutBr += t[i];
	}
	let out = '';
	let prevSpace = false;
	for (let i = 0; i < withoutBr.length; i++) {
		const c = withoutBr[i];
		const isSpace = c === ' ' || c === '\t' || c === '\n' || c === '\r';
		if (isSpace) {
			if (!prevSpace) out += ' ';
			prevSpace = true;
		} else {
			out += c;
			prevSpace = false;
		}
	}
	return out.trim();
}

function isWordChar(c: string): boolean {
	return c.length > 0 && ((c >= '0' && c <= '9') || (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c === '_');
}

/** Extract labels for nodes matching ]:::state in code. Uses states or MINDFLOW_NODE_STATES. No regex. */
export function getMindflowNodeLabelsFromMermaid(
	mermaid: string,
	states: readonly string[] = MINDFLOW_NODE_STATES
): string[] {
	const s = mermaid ?? '';
	const labels: string[] = [];
	for (const state of states) {
		const suffix = `:::${state}`;
		let i = 0;
		while (true) {
			const pos = s.indexOf(suffix, i);
			if (pos === -1) break;
			const nextCh = s[pos + suffix.length];
			if (nextCh && isWordChar(nextCh)) {
				i = pos + 1;
				continue;
			}
			let endBracket = pos - 1;
			while (endBracket >= 0 && (s[endBracket] === ' ' || s[endBracket] === '\t')) endBracket--;
			if (endBracket < 0 || s[endBracket] !== ']') {
				i = pos + 1;
				continue;
			}
			const startBracket = s.lastIndexOf('[', endBracket);
			if (startBracket === -1) {
				i = pos + 1;
				continue;
			}
			const raw = s.slice(startBracket + 1, endBracket);
			const label = normalizeLabel(raw);
			if (label && !labels.includes(label)) labels.push(label);
			i = pos + 1;
		}
	}
	return labels;
}
