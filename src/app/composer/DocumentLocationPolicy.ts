import type { DefaultDocumentView } from '@/core/composer';

export interface DocumentLocationLeafCandidate<TLeaf> {
	leaf: TLeaf;
	path: string | null;
	view: DefaultDocumentView | null;
	active: boolean;
}

/**
 * Pick an existing leaf without converting it.
 *
 * The active same-file instance is the strongest expression of user intent.
 * Otherwise prefer the current document View kind, then any existing instance.
 */
export function selectDocumentLocationLeaf<TLeaf>(
	candidates: readonly DocumentLocationLeafCandidate<TLeaf>[],
	filePath: string,
	preferredView: DefaultDocumentView,
): TLeaf | null {
	const matching = candidates.filter((candidate) => candidate.path === filePath);
	return matching.find((candidate) => candidate.active)?.leaf
		?? matching.find((candidate) => candidate.view === preferredView)?.leaf
		?? matching[0]?.leaf
		?? null;
}
