import { sha256Text } from '@/core/storage/generated-output/GeneratedOutputIntegrity';
import type { ReviewAtom, ReviewPreparationJob } from '@/core/types/review-preparation';

export function workKeyForAtoms(atoms: readonly ReviewAtom[]): string {
	if (atoms.length === 0) throw new Error('Cannot create a review work key without atoms.');
	const first = atoms[0]!;
	const identity = [first.ownerSurfaceId, first.ownerQuestionId, first.writeBoundary, first.verificationKind, ...atoms.flatMap((atom) => atom.objectRefs).sort()];
	return `work:${sha256Text(JSON.stringify(identity)).slice(0, 24)}`;
}

export function planReviewJobs(atoms: readonly ReviewAtom[], id: () => string): ReviewPreparationJob[] {
	const groups = new Map<string, ReviewAtom[]>();
	for (const atom of atoms.filter((candidate) => !candidate.deterministicOnly)) {
		const key = [atom.ownerSurfaceId, atom.ownerQuestionId, atom.writeBoundary, atom.verificationKind].join('\u0000');
		groups.set(key, [...(groups.get(key) ?? []), atom]);
	}
	return [...groups.values()].map((group) => ({ jobId: id(), workKey: workKeyForAtoms(group), atomRefs: group.map((atom) => atom.id), conflictKeys: unique(group.flatMap((atom) => atom.objectRefs)), status: 'queued', attemptIds: [], artifactId: null, error: null }));
}

function unique<T>(values: readonly T[]): T[] { return [...new Set(values)]; }
