// Debug Trace helpers — pure functions shared by recorder + adapters.
//
// Boundary discipline: no imports from `@/app/*`, `@/ui/*`, `@/service/*`,
// or `obsidian`. Only standard library. The recorder test locks this via
// source scan.

import type { DebugClock, DebugIdFactory } from './types';

/** Wall-clock provider. Runners with fake time swap this. */
export function defaultDebugClock(): DebugClock {
	return { now: () => Date.now() };
}

/**
 * Prefixed id factory. Ids look like `<prefix>-<base36-ts>-<seq>`.
 * Same shape as `defaultIdFactory` in run-envelope/helpers so debug ids and
 * run-envelope ids grep the same way in logs.
 */
export function defaultDebugIdFactory(prefix: string): DebugIdFactory {
	let seq = 0;
	return {
		next(): string {
			seq += 1;
			return `${prefix}-${Date.now().toString(36)}-${seq}`;
		},
	};
}

/**
 * Excerpt a string to at most `cap` chars. Collapses internal whitespace to a
 * single space so multi-line prompts render compact. Adds an ellipsis when
 * truncated so the reader knows more content exists.
 */
export function makeExcerpt(raw: string, cap: number): string {
	if (raw.length === 0) return '';
	const collapsed = raw.replace(/\s+/g, ' ').trim();
	if (collapsed.length <= cap) return collapsed;
	return collapsed.slice(0, cap - 1) + '…';
}

/**
 * Stable content hash. Non-cryptographic FNV-1a; the goal is deduping two
 * spans that reference the same content, not tamper-evidence. Output is a
 * base16 string prefixed with `h` so it's obvious what it is.
 */
export function hashContent(raw: string): string {
	// FNV-1a 32-bit
	let hash = 0x811c9dc5;
	for (let i = 0; i < raw.length; i += 1) {
		hash ^= raw.charCodeAt(i);
		// 32-bit imul equivalent
		hash = Math.imul(hash, 0x01000193);
	}
	// `>>> 0` normalises to unsigned before hex conversion.
	return 'h' + (hash >>> 0).toString(16).padStart(8, '0');
}
