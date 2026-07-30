import type { DocumentSourceLocation } from '@/core/ports/VaultNavigationPort';
import type {
	ComposerBlock,
	ComposerDocumentSnapshot,
	ComposerSubBlockAnchor,
} from '@/core/composer';

export interface ResolvedComposerSourceLocation {
	block: ComposerBlock;
	unit?: ComposerSubBlockAnchor;
	sourceFrom: number;
	sourceTo: number;
	frontmatterKey?: string;
}

/**
 * Resolve an external document location against the current Composer snapshot.
 *
 * Exact source offsets win when their text still matches. A line-local text
 * repair handles harmless drift; the zero-based line remains the final
 * portable fallback. The narrowest containing unit is returned when Composer
 * has one (list item, paragraph line, table cell/row, callout body).
 */
export function resolveComposerSourceLocation(
	snapshot: ComposerDocumentSnapshot,
	location: DocumentSourceLocation,
): ResolvedComposerSourceLocation | null {
	if (snapshot.blocks.length === 0) return null;
	const sourceFrom = resolveSourceFrom(snapshot.sourceText, location);
	const sourceTo = resolveSourceTo(snapshot.sourceText, location, sourceFrom);
	const block = containingBlock(snapshot.blocks, sourceFrom)
		?? nearestBlock(snapshot.blocks, sourceFrom);
	if (!block) return null;
	const units = block.units
		.filter((unit) => containsOffset(unit.from, unit.to, sourceFrom))
		.sort((left, right) => (left.to - left.from) - (right.to - right.from));
	const unit = units[0];
	return {
		block,
		...(unit ? { unit } : {}),
		sourceFrom,
		sourceTo,
		...(block.kind === 'frontmatter' && location.frontmatterKey
			? { frontmatterKey: location.frontmatterKey }
			: {}),
	};
}

export function sourceOffsetAtLine(sourceText: string, zeroBasedLine: number): number {
	const target = Math.max(0, zeroBasedLine);
	let line = 0;
	let offset = 0;
	while (line < target && offset < sourceText.length) {
		const newline = sourceText.indexOf('\n', offset);
		if (newline < 0) return sourceText.length;
		offset = newline + 1;
		line += 1;
	}
	return offset;
}

function resolveSourceFrom(sourceText: string, location: DocumentSourceLocation): number {
	const requested = clampOffset(sourceText, location.from);
	if (requested !== null && sourceTextMatches(sourceText, requested, location.text)) {
		return requested;
	}
	const lineFrom = sourceOffsetAtLine(sourceText, location.line);
	const lineTo = sourceOffsetAtLine(sourceText, location.line + 1);
	if (location.text) {
		const local = sourceText.slice(lineFrom, lineTo).indexOf(location.text);
		if (local >= 0) return lineFrom + local;
	}
	return lineFrom;
}

function resolveSourceTo(
	sourceText: string,
	location: DocumentSourceLocation,
	resolvedFrom: number,
): number {
	const requested = clampOffset(sourceText, location.to);
	const requestedFrom = clampOffset(sourceText, location.from);
	const exactRequestedRange =
		requestedFrom === resolvedFrom
		&& sourceTextMatches(sourceText, resolvedFrom, location.text);
	if (exactRequestedRange && requested !== null && requested >= resolvedFrom) {
		return requested;
	}
	return Math.min(sourceText.length, resolvedFrom + (location.text?.length ?? 0));
}

function sourceTextMatches(sourceText: string, from: number, text?: string): boolean {
	if (!text) return true;
	return sourceText.slice(from, from + text.length) === text;
}

function clampOffset(sourceText: string, value: number | undefined): number | null {
	if (typeof value !== 'number' || !Number.isFinite(value)) return null;
	return Math.max(0, Math.min(sourceText.length, Math.floor(value)));
}

function containingBlock(
	blocks: readonly ComposerBlock[],
	offset: number,
): ComposerBlock | undefined {
	return blocks.find((block) => containsOffset(block.source.from, block.source.to, offset));
}

function nearestBlock(
	blocks: readonly ComposerBlock[],
	offset: number,
): ComposerBlock | undefined {
	return blocks.find((block) => block.source.from >= offset) ?? blocks.at(-1);
}

function containsOffset(from: number, to: number, offset: number): boolean {
	if (from === to) return offset === from;
	return from <= offset && offset < to;
}
