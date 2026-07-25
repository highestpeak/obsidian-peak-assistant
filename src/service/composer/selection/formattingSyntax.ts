/**
 * Peak Composer — inline mark → Markdown/HTML syntax map (WP4, framework-neutral).
 *
 * The delimiter grammar (`**bold**`, `<u>underline</u>`, `<mark>`) is *domain
 * knowledge* — the Markdown/Obsidian syntax the serializer must emit — not a
 * user-tunable label. Per docs/conventions/configurability.md it is centralised
 * here as a typed, documented domain fallback rather than scattered string
 * literals inside the serializer branches; an integration can still override the
 * map (e.g. swap `<u>` for a `++` extension) by passing a partial into
 * {@link resolveFormattingSyntax}.
 *
 * Underline/color/highlight are HTML because Obsidian has no core Markdown mark
 * for them (handoff §7.1: underline is literally `<u>…</u>`). Color/highlight
 * carry a `valueTemplate` so the applied swatch value is injected into the tag.
 */

import type { ComposerInlineMark } from '@/core/composer';

/** How one mark wraps a slice of source text. */
export interface MarkSyntax {
	/** Opening delimiter. For value marks this is the tag WITHOUT the value. */
	open: string;
	/** Closing delimiter. */
	close: string;
	/**
	 * For value-carrying marks (color / highlight): a template whose `{value}`
	 * is replaced with the applied swatch; the resolved string becomes `open`.
	 */
	openTemplate?: string;
}

export type FormattingSyntaxMap = Record<ComposerInlineMark, MarkSyntax>;

/** Documented domain fallback (see file header). */
export const DEFAULT_FORMATTING_SYNTAX: FormattingSyntaxMap = {
	bold: { open: '**', close: '**' },
	italic: { open: '*', close: '*' },
	strikethrough: { open: '~~', close: '~~' },
	underline: { open: '<u>', close: '</u>' },
	'text-color': { open: '<span style="color: {value}">', close: '</span>', openTemplate: '<span style="color: {value}">' },
	highlight: { open: '<mark style="background: {value}">', close: '</mark>', openTemplate: '<mark style="background: {value}">' },
};

/** Marks whose result is written as raw HTML (needs a rendered fragment, not `**`). */
export const HTML_MARKS: ReadonlySet<ComposerInlineMark> = new Set(['underline', 'text-color', 'highlight']);

export function resolveFormattingSyntax(overrides?: Partial<FormattingSyntaxMap>): FormattingSyntaxMap {
	if (!overrides) return DEFAULT_FORMATTING_SYNTAX;
	return { ...DEFAULT_FORMATTING_SYNTAX, ...overrides };
}

/** Resolve the concrete opening delimiter for a mark, injecting a value if needed. */
export function openDelimiter(syntax: MarkSyntax, value?: string): string {
	if (syntax.openTemplate && value) return syntax.openTemplate.replace('{value}', value);
	return syntax.open;
}
