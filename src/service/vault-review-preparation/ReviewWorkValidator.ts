import type { ReviewAtom, ReviewWorkArtifact } from '@/core/types/review-preparation';

export interface ReviewValidationResult {
	accepted: boolean;
	errors: readonly { field: string; message: string }[];
}

export function validateReviewWorkArtifact(artifact: ReviewWorkArtifact, atoms: readonly ReviewAtom[]): ReviewValidationResult {
	const errors: Array<{ field: string; message: string }> = [];
	const evidence = new Set(atoms.flatMap((atom) => atom.evidenceRefs));
	const revisions = new Set(atoms.flatMap((atom) => atom.sourceRevisionRefs));
	if (!artifact.title.trim()) errors.push({ field: 'title', message: 'Owner-facing title is required.' });
	if (!artifact.ownerQuestion.trim()) errors.push({ field: 'ownerQuestion', message: 'Owner question is required.' });
	if (!artifact.exitCondition.trim()) errors.push({ field: 'exitCondition', message: 'A verifiable exit condition is required.' });
	if (artifact.citations.length === 0) errors.push({ field: 'citations', message: 'At least one frozen citation is required.' });
	for (const citation of artifact.citations) {
		if (!evidence.has(citation.evidenceRef)) errors.push({ field: 'citations', message: `Citation is outside the frozen input: ${citation.evidenceRef}` });
		if (!revisions.has(citation.sourceRevisionRef)) errors.push({ field: 'citations', message: `Source revision is outside the frozen input: ${citation.sourceRevisionRef}` });
	}
	if (artifact.writeBoundary === 'proposal' && artifact.choices.length === 0) errors.push({ field: 'choices', message: 'Proposal-boundary work requires an explicit owner choice.' });
	if (!artifact.validationReceiptId) errors.push({ field: 'validationReceiptId', message: 'Controller validation receipt is required.' });
	return { accepted: errors.length === 0, errors };
}
