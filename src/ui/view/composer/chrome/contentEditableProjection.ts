import katex from 'katex';
import type { SourceVisualPart } from '@/service/composer';
import { styleAttrs } from './StyledRuns';

interface StructuralProjectionRange {
	from: number;
	to: number;
	role: string;
	depth?: number;
}

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
	structuralRanges: readonly StructuralProjectionRange[] = [],
	blockRanges: readonly Array<{ from: number; to: number; kind: string }> = [],
): string {
	if (parts.every((part) => part.kind !== 'math' && part.text.length === 0)) return '';
	if (blockRanges.length > 0) {
		return renderBlockProjection(parts, unitId, structuralRanges, blockRanges);
	}
	return parts.map((part) => renderPart(part, unitId, structuralRanges)).join('');
}

function renderBlockProjection(
	parts: readonly SourceVisualPart[],
	unitId: string | undefined,
	structuralRanges: readonly StructuralProjectionRange[],
	blockRanges: readonly Array<{ from: number; to: number; kind: string }>,
): string {
	const ordered = [...blockRanges].sort((left, right) => left.from - right.from);
	const sourceFrom = parts[0]?.from ?? 0;
	const sourceTo = parts.at(-1)?.to ?? sourceFrom;
	const html: string[] = [];
	let cursor = sourceFrom;
	for (const block of ordered) {
		if (block.to <= cursor || block.from >= sourceTo) continue;
		const from = Math.max(cursor, block.from);
		const to = Math.min(sourceTo, block.to);
		if (cursor < from) {
			html.push(renderProjectionRange(parts, cursor, from, unitId, structuralRanges));
		}
		html.push(
			'<span class="pk-new-block-draft__markdown-block"',
			` data-markdown-block-kind="${escapeAttribute(block.kind)}">`,
			renderProjectionRange(parts, from, to, unitId, structuralRanges),
			'</span>',
		);
		cursor = to;
	}
	if (cursor < sourceTo) {
		html.push(renderProjectionRange(parts, cursor, sourceTo, unitId, structuralRanges));
	}
	return html.join('');
}

function renderProjectionRange(
	parts: readonly SourceVisualPart[],
	from: number,
	to: number,
	unitId: string | undefined,
	structuralRanges: readonly StructuralProjectionRange[],
): string {
	return parts
		.filter((part) => part.to > from && part.from < to)
		.map((part) => renderPart(
			slicePart(part, Math.max(from, part.from), Math.min(to, part.to)),
			unitId,
			structuralRanges,
		))
		.join('');
}

function slicePart(part: SourceVisualPart, from: number, to: number): SourceVisualPart {
	if (from === part.from && to === part.to) return part;
	if (part.kind === 'math') return part;
	return {
		...part,
		from,
		to,
		text: part.text.slice(from - part.from, to - part.from),
	};
}

function renderPart(
	part: SourceVisualPart,
	unitId: string | undefined,
	structuralRanges: readonly StructuralProjectionRange[],
): string {
	if (part.kind === 'hidden') {
		const structural = structuralRanges.find(
			(range) => range.from === part.from && range.to === part.to,
		);
		const depth = structural?.depth === undefined
			? undefined
			: Math.max(0, Math.floor(structural.depth));
		const listMarker = structural?.role === 'ordered-list'
			? orderedListMarker(part.text)
			: undefined;
		return [
			renderSourceAnchor(part.from, unitId),
			'<span class="pk-composer-source-token" contenteditable="false"',
			` data-src-token-from="${part.from}" data-src-token-to="${part.to}"`,
			structural ? ` data-structural-token="${escapeAttribute(structural.role)}"` : '',
			structural ? ` data-src-token-text="${escapeAttribute(part.text)}"` : '',
			listMarker ? ` data-list-marker="${escapeAttribute(listMarker)}"` : '',
			depth === undefined ? '' : ` data-list-depth="${depth}"`,
			depth === undefined ? '' : ` style="--pk-composer-list-depth:${depth}"`,
			' aria-hidden="true">',
			escapeHtml(part.text),
			'</span>',
			renderSourceAnchor(part.to, unitId),
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

function renderSourceAnchor(offset: number, unitId: string | undefined): string {
	const unit = unitId ? ` data-unit-id="${escapeAttribute(unitId)}"` : '';
	return [
		'<span class="pk-composer-source-anchor"',
		` data-src-text-from="${offset}"${unit}>`,
		'</span>',
	].join('');
}

function orderedListMarker(source: string): string {
	const trimmed = source.trimStart();
	const separator = trimmed.indexOf(' ');
	return separator < 0 ? trimmed : trimmed.slice(0, separator);
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

function escapeHtml(value: string | undefined): string {
	return (value ?? '')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');
}

function escapeAttribute(value: string | undefined): string {
	return escapeHtml(value)
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}
