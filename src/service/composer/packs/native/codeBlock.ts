/**
 * Peak Composer — Code Block structural helpers (WP8, §7.4 / §10.11).
 *
 * A Code Block only shows/edits code. The editing chrome (WP4) suppresses rich
 * inline formatting (bold/underline/strike/color/highlight) inside code; this
 * module owns the framework-neutral facts that suppression and Easy Copy rely on:
 *   - fence parsing (language + verbatim body, indentation/tabs intact);
 *   - the source-copy preservation contract (newlines + indentation + tabs kept);
 *   - the rich-format suppression predicate (§7.4) so both the chrome and the
 *     capability projection agree on which block kinds forbid rich formatting.
 *
 * Framework-neutral: no Obsidian / DOM imports.
 */

import type { ComposerBlockKind } from '@/core/composer';

const FENCE_RE = /^(```+|~~~+)([^\n]*)\n([\s\S]*?)\n?\1[ \t]*$/;

export interface ParsedCodeFence {
	/** Fence marker used (``` or ~~~), possibly longer for nested fences. */
	fence: string;
	/** Info string after the fence (language + optional attributes), trimmed. */
	info: string;
	/** Language token (first word of the info string), lower-cased. */
	language: string;
	/** Verbatim code body — newlines, indentation and tabs preserved exactly. */
	body: string;
}

/** Parse a fenced code block. Returns null when the slice is not a fence. */
export function parseCodeFence(raw: string): ParsedCodeFence | null {
	const match = FENCE_RE.exec(raw.replace(/\s+$/, (s) => (s.includes('\n') ? '\n' : s)));
	if (!match) return matchLoose(raw);
	const info = match[2].trim();
	return { fence: match[1], info, language: firstToken(info), body: match[3] };
}

/** Fallback for fences without a trailing newline / with trailing spaces. */
function matchLoose(raw: string): ParsedCodeFence | null {
	const lines = raw.split(/\r?\n/);
	const open = /^(```+|~~~+)([^\n]*)$/.exec(lines[0] ?? '');
	if (!open) return null;
	let end = lines.length;
	for (let i = lines.length - 1; i >= 1; i--) {
		if (new RegExp(`^${escapeRe(open[1])}[ \\t]*$`).test(lines[i])) {
			end = i;
			break;
		}
	}
	const info = open[2].trim();
	return { fence: open[1], info, language: firstToken(info), body: lines.slice(1, end).join('\n') };
}

function firstToken(info: string): string {
	return (info.split(/\s+/)[0] ?? '').toLowerCase();
}

function escapeRe(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Source copy of a code block: the body verbatim (newlines/indentation/tabs
 * intact), fence markers stripped. This is what "copy source" and plain-text
 * Easy Copy must yield for code (§7.4 / §7.6 L459).
 */
export function codeSourceCopy(raw: string, blockKind?: ComposerBlockKind): string {
	const parsed = parseCodeFence(raw);
	if (parsed) return parsed.body;
	// Not a recognizable fence (e.g. indented code): return verbatim.
	return blockKind === 'code' ? raw.replace(/\n+$/, '') : raw;
}

/**
 * Block kinds whose editing surface suppresses rich inline formatting (§7.4).
 * The chrome consults this so a selection toolbar over code never offers
 * bold/underline/strike/color/highlight, and a paste-URL never wraps code.
 */
const RICH_FORMAT_SUPPRESSED_KINDS: ReadonlySet<ComposerBlockKind> = new Set<ComposerBlockKind>([
	'code',
	'math',
	'dataview',
	'mermaid',
	'html',
]);

export function isRichFormatSuppressed(kind: ComposerBlockKind): boolean {
	return RICH_FORMAT_SUPPRESSED_KINDS.has(kind);
}
