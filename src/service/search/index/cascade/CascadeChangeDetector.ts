import type { CascadeChangeInfo, PreIndexSnapshot } from './types';

export function computeChangeMagnitude(
    oldVec: number[] | null,
    newVec: number[] | null,
): number {
    if (!oldVec && !newVec) return 0;
    if (!oldVec || !newVec) return 1;
    if (oldVec.length !== newVec.length) return 1;

    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < oldVec.length; i++) {
        dot += oldVec[i] * newVec[i];
        normA += oldVec[i] * oldVec[i];
        normB += newVec[i] * newVec[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    if (denom === 0) return 1;
    const cosineSim = dot / denom;
    return Math.max(0, Math.min(1, 1 - cosineSim));
}

export function detectChanges(
    docPath: string,
    docNodeId: string,
    preSnapshot: PreIndexSnapshot | null,
    newContentHash: string,
    newOutgoingTargetIds: string[],
    newEmbeddingVector: number[] | null,
): CascadeChangeInfo | null {
    const oldHash = preSnapshot?.contentHash ?? null;
    const oldTargets = preSnapshot?.outgoingTargetIds ?? [];
    const oldVec = preSnapshot?.embeddingVector ?? null;

    const contentHashChanged = oldHash !== newContentHash;

    const oldSet = new Set(oldTargets);
    const newSet = new Set(newOutgoingTargetIds);
    const outgoingLinksChanged =
        oldSet.size !== newSet.size || [...oldSet].some((id) => !newSet.has(id));

    const changeMagnitude = computeChangeMagnitude(oldVec, newEmbeddingVector);
    const embeddingChanged = changeMagnitude > 0.001;

    if (!contentHashChanged && !outgoingLinksChanged && !embeddingChanged) {
        return null;
    }

    return {
        docPath,
        docNodeId,
        contentHashChanged,
        embeddingChanged,
        outgoingLinksChanged,
        oldOutgoingTargetIds: oldTargets,
        newOutgoingTargetIds,
        changeMagnitude,
    };
}
