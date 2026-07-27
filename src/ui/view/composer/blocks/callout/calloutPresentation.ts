import type { ComposerBlock, ComposerDocumentSnapshot } from '@/core/composer';

/**
 * The visual Callout shell deliberately hides the `> [!type]` syntax, while
 * these ranges remain exact source anchors for direct edits. This is a pure
 * projection: no Markdown is normalized or re-serialized during rendering.
 */
export interface CalloutTextRange {
	part: 'title' | 'body';
	index: number;
	text: string;
	from: number;
	to: number;
	/** The original range has no separator; a first title edit must add one. */
	requiresLeadingSpace?: boolean;
	/** The original callout had no body line; a first edit must create one. */
	requiresBodyLine?: boolean;
}

export interface CalloutPresentation {
	type: string;
	title: CalloutTextRange;
	body: readonly CalloutTextRange[];
}

interface LineSlice {
	text: string;
	from: number;
	to: number;
}

const HEADER = /^>\s*\[!([\w-]+)\][+-]?/;

export function presentCallout(snapshot: ComposerDocumentSnapshot, block: ComposerBlock): CalloutPresentation {
	const raw = snapshot.sourceText.slice(block.source.from, block.source.to);
	const lines = splitLines(raw, block.source.from);
	const first = lines[0] ?? { text: '', from: block.source.from, to: block.source.from };
	const header = HEADER.exec(first.text);
	const type = block.renderModel.calloutType ?? header?.[1]?.toLowerCase() ?? 'note';
	const markerEnd = header?.[0].length ?? 0;
	const afterMarker = first.text.slice(markerEnd);
	const spacing = /^[ \t]*/.exec(afterMarker)?.[0] ?? '';
	const titleFrom = first.from + markerEnd + spacing.length;
	const title: CalloutTextRange = {
		part: 'title',
		index: 0,
		text: first.text.slice(markerEnd + spacing.length),
		from: titleFrom,
		to: first.to,
		requiresLeadingSpace: titleFrom === first.to && spacing.length === 0,
	};

	const body = lines.slice(1).map((line, index) => bodyRange(line, index));
	if (body.length === 0) {
		body.push({ part: 'body', index: 0, text: '', from: block.source.to, to: block.source.to, requiresBodyLine: true });
	}
	return { type, title, body };
}

function bodyRange(line: LineSlice, index: number): CalloutTextRange {
	const prefix = /^> ?/.exec(line.text)?.[0] ?? '';
	return {
		part: 'body',
		index,
		text: line.text.slice(prefix.length),
		from: line.from + prefix.length,
		to: line.to,
	};
}

function splitLines(raw: string, absoluteFrom: number): LineSlice[] {
	const lines: LineSlice[] = [];
	let offset = 0;
	while (offset <= raw.length) {
		const newline = raw.indexOf('\n', offset);
		const end = newline === -1 ? raw.length : newline;
		const textEnd = end > offset && raw[end - 1] === '\r' ? end - 1 : end;
		lines.push({ text: raw.slice(offset, textEnd), from: absoluteFrom + offset, to: absoluteFrom + textEnd });
		if (newline === -1) break;
		offset = newline + 1;
	}
	return lines;
}
