import type {
	ComposerBlock,
	ComposerContextSnapshot,
	ComposerDocumentSnapshot,
} from '@/core/composer';

export interface ComposerUnitActionRange {
	unitId: string;
	from: number;
	to: number;
}

/** Freeze one authored source line/list item as an exact AI rewrite target. */
export function createUnitActionSnapshot(
	snapshot: ComposerDocumentSnapshot,
	block: ComposerBlock,
	range: ComposerUnitActionRange,
): ComposerContextSnapshot {
	const targetSource = snapshot.sourceText.slice(range.from, range.to);
	return {
		documentId: snapshot.documentId,
		revision: snapshot.revision,
		target: {
			kind: 'selection',
			blockId: block.blockId,
			unitId: range.unitId,
			from: range.from,
			to: range.to,
		},
		targetSource,
		selectionText: targetSource,
		nearby: {
			before: snapshot.sourceText.slice(Math.max(0, range.from - 400), range.from),
			after: snapshot.sourceText.slice(range.to, range.to + 400),
		},
	};
}
