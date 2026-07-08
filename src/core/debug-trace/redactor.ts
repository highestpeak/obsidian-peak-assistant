// Debug Trace redactor — secret scrubbing.
//
// The redactor runs BEFORE any excerpt or raw content is stored on a span.
// In `redacted` mode the raw is dropped entirely; in `raw` mode the raw is
// kept but with matched secret patterns replaced. Either way the excerpt is
// derived from the scrubbed string, so downstream formatters can render it
// safely regardless of mode.
//
// Adding a new pattern:
//   - Prefer high-signal, low-false-positive regexes.
//   - Add a stable `id` string; it appears in `redactionHits[].pattern` so
//     UI can render "3 sk-… keys redacted".
//   - Keep patterns anchored on characteristic prefixes when possible.

import type { DebugRedactionHit } from './types';

export interface PayloadRedactor {
	redact(raw: string): { safe: string; hits: DebugRedactionHit[] };
}

interface RedactionPattern {
	id: string;
	regex: RegExp;
	replacement: (match: string) => string;
}

const REDACTED_TAG = '[REDACTED-{id}]';

function tag(id: string): string {
	return REDACTED_TAG.replace('{id}', id);
}

// Order matters: more specific patterns first. Once a match is replaced with
// `[REDACTED-...]` subsequent patterns can no longer hit it, so putting the
// `sk-ant-` / `sk-or-` variants before the generic `sk-…` prefix ensures they
// get the right label rather than being swallowed by `openai-key`.
const DEFAULT_PATTERNS: RedactionPattern[] = [
	{
		id: 'anthropic-key',
		regex: /\bsk-ant-[A-Za-z0-9_\-]{20,}\b/g,
		replacement: () => tag('anthropic-key'),
	},
	{
		id: 'openrouter-key',
		regex: /\bsk-or-[A-Za-z0-9_\-]{20,}\b/g,
		replacement: () => tag('openrouter-key'),
	},
	{
		id: 'openai-key',
		regex: /\bsk-[A-Za-z0-9_\-]{20,}\b/g,
		replacement: () => tag('openai-key'),
	},
	{
		id: 'google-key',
		regex: /\bAIza[0-9A-Za-z_\-]{20,}\b/g,
		replacement: () => tag('google-key'),
	},
	{
		id: 'bearer-token',
		regex: /\bBearer\s+[A-Za-z0-9_\-\.=]{16,}\b/g,
		replacement: () => tag('bearer-token'),
	},
	{
		id: 'auth-header-value',
		regex: /\b(authorization|api[_-]?key|x-api-key)\s*[:=]\s*['"]?[A-Za-z0-9_\-\.=+/]{12,}['"]?/gi,
		replacement: () => tag('auth-header'),
	},
	{
		id: 'jwt',
		regex: /\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\b/g,
		replacement: () => tag('jwt'),
	},
];

/**
 * Redactor tuned for LLM-adjacent payloads: prompts, tool args, tool results.
 * Callers can pass a custom pattern set (e.g. adding vault-specific paths).
 */
export function createDefaultRedactor(
	extraPatterns: ReadonlyArray<RedactionPattern> = [],
): PayloadRedactor {
	const patterns = [...DEFAULT_PATTERNS, ...extraPatterns];
	return {
		redact(raw: string): { safe: string; hits: DebugRedactionHit[] } {
			if (raw.length === 0) return { safe: '', hits: [] };
			const hitMap = new Map<string, number>();
			let safe = raw;
			for (const p of patterns) {
				// Recreate the regex each scan so global-state lastIndex doesn't
				// leak between calls; using replace with the source ensures a
				// clean scan.
				const local = new RegExp(p.regex.source, p.regex.flags);
				safe = safe.replace(local, (m) => {
					hitMap.set(p.id, (hitMap.get(p.id) ?? 0) + 1);
					return p.replacement(m);
				});
			}
			const hits: DebugRedactionHit[] = [];
			for (const [pattern, count] of hitMap) {
				hits.push({ pattern, count });
			}
			// Deterministic order for golden tests.
			hits.sort((a, b) => a.pattern.localeCompare(b.pattern));
			return { safe, hits };
		},
	};
}

/** A no-op redactor. Test-only escape hatch. Do NOT use in production. */
export function createNoOpRedactor(): PayloadRedactor {
	return {
		redact(raw: string) {
			return { safe: raw, hits: [] };
		},
	};
}
