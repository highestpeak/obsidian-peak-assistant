import katex from 'katex';
import type { SourceVisualPart } from '@/service/composer';
import { styleAttrs } from './StyledRuns';

/**
 * Serialize Composer's source projection for a browser-owned contenteditable.
 *
 * React owns the root and this one `innerHTML` value, but deliberately has no
 * child fibers inside the native editing host. Chromium may therefore delete
 * the last text node without React later trying to remove the same node.
 */
export function renderContentEditableProjection(
	parts: readonly SourceVisualPart[],
	unitId?: string,
	structuralRanges: readonly Array<{ from: number; to: number; role: string }> = [],
): string {
	if (parts.every((part) => part.kind !== 'math' && part.text.length === 0)) return '';
	return parts.map((part) => renderPart(part, unitId, structuralRanges)).join('');
}

function renderPart(
	part: SourceVisualPart,
	unitId: string | undefined,
	structuralRanges: readonly Array<{ from: number; to: number; role: string }>,
): string {
	if (part.kind === 'hidden') {
		const structural = structuralRanges.find(
			(range) => range.from === part.from && range.to === part.to,
		);
		return [
			'<span class="pk-composer-source-token" contenteditable="false"',
			` data-src-token-from="${part.from}" data-src-token-to="${part.to}"`,
			structural ? ` data-structural-token="${escapeAttribute(structural.role)}"` : '',
			structural ? ` data-src-token-text="${escapeAttribute(part.text)}"` : '',
			' aria-hidden="true">',
			escapeHtml(part.text),
			'</span>',
		].join('');
	}
	if (part.kind === 'math') {
		const formula = katex.renderToString(part.latex, {
			throwOnError: false,
			displayMode: false,
			output: 'mathml',
		});
		return [
			'<span class="pk-composer-inline-math" contenteditable="false"',
			' data-inline-math-atom',
			` data-source-from="${part.from}" data-source-to="${part.to}"`,
			' role="math"',
			` aria-label="${escapeAttribute(part.latex)}">`,
			formula,
			'</span>',
		].join('');
	}
	const { className, style } = styleAttrs(part.style);
	const classes = [
		part.linkTarget ? 'pk-composer-link' : '',
		part.linkKind === 'wikilink' ? 'pk-composer-wikilink' : '',
		className ?? '',
	].filter(Boolean).join(' ');
	const attributes = [
		classes ? ` class="${escapeAttribute(classes)}"` : '',
		style ? ` style="${escapeAttribute(serializeStyle(style))}"` : '',
		` data-src-text-from="${part.from}"`,
		unitId ? ` data-unit-id="${escapeAttribute(unitId)}"` : '',
		part.linkTarget ? ` data-link-target="${escapeAttribute(part.linkTarget)}"` : '',
		part.linkKind ? ` data-link-kind="${part.linkKind}"` : '',
		part.linkRange ? ` data-src-link-from="${part.linkRange.from}"` : '',
		part.linkRange ? ` data-src-link-to="${part.linkRange.to}"` : '',
		part.linkTarget ? ' tabindex="0"' : '',
	].join('');
	return `<span${attributes}>${escapeHtml(part.text)}</span>`;
}

function serializeStyle(style: React.CSSProperties): string {
	const declarations: string[] = [];
	if (style.fontWeight !== undefined) declarations.push(`font-weight:${String(style.fontWeight)}`);
	if (style.fontStyle !== undefined) declarations.push(`font-style:${String(style.fontStyle)}`);
	if (style.textDecoration !== undefined) declarations.push(`text-decoration:${String(style.textDecoration)}`);
	if (style.color !== undefined) declarations.push(`color:${String(style.color)}`);
	if (style.backgroundColor !== undefined) declarations.push(`background-color:${String(style.backgroundColor)}`);
	if (style.borderRadius !== undefined) declarations.push(`border-radius:${String(style.borderRadius)}`);
	if (style.padding !== undefined) declarations.push(`padding:${String(style.padding)}`);
	return declarations.join(';');
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');
}

function escapeAttribute(value: string): string {
	return escapeHtml(value)
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}
