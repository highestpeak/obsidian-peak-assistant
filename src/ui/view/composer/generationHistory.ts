import { makeCandidateId, type ComposerCandidate } from '@/core/composer';
import type { FrozenComposerRunEnvelope } from '@/service/composer';
import type { ComposerChromeRuntime } from './chrome/ComposerChromeContext';

/**
 * Put a persisted, not-adopted generation back on the review canvas without
 * changing Markdown or creating a document-history transaction.
 */
export function restoreGenerationReview(
	runtime: ComposerChromeRuntime,
	run: FrozenComposerRunEnvelope,
): boolean {
	if (run.disposition !== 'not-adopted' || !run.review) return false;
	const hub = runtime.hub;
	const candidateRuntime = runtime.candidateRuntime;
	if (!hub || !candidateRuntime?.restoreCandidateRuntimeState) return false;

	const sameSession = hub.restoreCandidate(run.candidateId);
	if (sameSession) return true;

	const candidate = reviewableCandidate(run, runtime.session?.baseRevision);
	if (restoreSnapshot(runtime, candidate, run)) return true;

	// An accepted candidate can still occupy its original id in the session
	// store. Historical review is a new canvas instance, so give only that
	// restored instance a fresh id while preserving its immutable run record.
	return restoreSnapshot(
		runtime,
		{ ...candidate, candidateId: makeCandidateId() },
		run,
	);
}

export function generationPreview(run: FrozenComposerRunEnvelope): string {
	const candidate = run.review?.candidate;
	if (!candidate) return run.error ?? '';
	const variant = candidate.variants.find((item) => item.variantId === run.variantId)
		?? candidate.variants.find((item) => item.variantId === candidate.activeVariantId);
	const result = variant?.proposedChange.result;
	if (typeof result === 'string') return result;
	const record = result && typeof result === 'object'
		? result as Record<string, unknown>
		: null;
	if (record) {
		const payload = record.payload;
		if (payload && typeof payload === 'object') {
			const text = (payload as Record<string, unknown>).text;
			if (typeof text === 'string') return text;
			const itemText = (payload as Record<string, unknown>).itemText;
			if (typeof itemText === 'string') return itemText;
		}
	}
	const operationText = variant?.proposedChange.operations
		.map((operation) => ('text' in operation ? operation.text : ''))
		.filter(Boolean)
		.join('\n');
	return operationText || run.error || '';
}

function reviewableCandidate(
	run: FrozenComposerRunEnvelope,
	currentRevision: string | undefined,
): ComposerCandidate {
	const candidate = JSON.parse(JSON.stringify(run.review!.candidate)) as ComposerCandidate;
	const historicalVariant = candidate.variants.find((item) => item.variantId === run.variantId);
	if (historicalVariant) {
		candidate.activeVariantId = historicalVariant.variantId;
		candidate.proposedChange = historicalVariant.proposedChange;
	}
	const active = candidate.variants.find((item) => item.variantId === candidate.activeVariantId);
	if (currentRevision && candidate.baseRevision !== currentRevision) {
		candidate.status = 'stale';
		return candidate;
	}
	if (active?.status === 'failed') {
		candidate.status = 'failed';
		return candidate;
	}
	if (active?.status === 'cancelled') {
		candidate.status = 'cancelled';
		return candidate;
	}
	candidate.status = 'ready';
	return candidate;
}

function restoreSnapshot(
	runtime: ComposerChromeRuntime,
	candidate: ComposerCandidate,
	run: FrozenComposerRunEnvelope,
): boolean {
	const candidateRuntime = runtime.candidateRuntime;
	const hub = runtime.hub;
	if (!candidateRuntime?.restoreCandidateRuntimeState || !hub || !run.review) return false;
	if (!candidateRuntime.restoreCandidateRuntimeState(candidate, run.review.runtime)) return false;
	return hub.restoreCandidateSnapshot(candidate);
}
