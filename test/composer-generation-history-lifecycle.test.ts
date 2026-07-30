import assert from 'assert';
import type {
	ComposerCandidate,
	ComposerCandidateRuntimeSnapshot,
} from '@/core/composer';
import {
	ComposerWorkspaceIntelligenceRuntime,
	groupComposerGenerationRuns,
	type ComposerWorkspaceStateEvent,
	type ComposerWorkspaceStatePersistencePort,
} from '@/service/composer';

class MemoryPersistence implements ComposerWorkspaceStatePersistencePort {
	readonly events: ComposerWorkspaceStateEvent[] = [];

	async load(): Promise<readonly ComposerWorkspaceStateEvent[]> {
		return this.events;
	}

	async append(event: ComposerWorkspaceStateEvent): Promise<void> {
		this.events.push(event);
	}
}

function candidate(): ComposerCandidate {
	return {
		candidateId: 'candidate-history',
		target: { kind: 'block', blockId: 'list-0-abcd1234' },
		baseRevision: 'rev-1',
		status: 'ready',
		activeVariantId: 'variant-1',
		variants: [
			{
				variantId: 'variant-1',
				provenance: 'initial',
				status: 'ready',
				createdAt: 10,
				proposedChange: {
					operations: [],
					result: {
						resultKind: 'text-patch',
						rendererId: 'composer.renderer.streaming-text',
						payload: { replacementText: 'first answer' },
					},
				},
			},
		],
		proposedChange: {
			operations: [],
			result: {
				resultKind: 'text-patch',
				rendererId: 'composer.renderer.streaming-text',
				payload: { replacementText: 'first answer' },
			},
		},
		anchorBlockId: 'list-0-abcd1234',
	};
}

const runtimeSnapshot: ComposerCandidateRuntimeSnapshot = {
	ownerId: 'capability',
	rendererId: 'composer.renderer.streaming-text',
	label: '补缺项',
	payload: {
		capabilityId: 'composer.list.fill-gaps',
		snapshot: { revision: 'rev-1' },
		lastRunId: 'run-1',
	},
};

async function main(): Promise<void> {
	const persistence = new MemoryPersistence();
	const runtime = new ComposerWorkspaceIntelligenceRuntime(persistence);
	await runtime.hydrate();
	runtime.trackDocument('doc-1', 'Doc.md');
	const review = { candidate: candidate(), runtime: runtimeSnapshot };

	runtime.startRun({
		event: {
			type: 'run-started',
			runId: 'run-1',
			capabilityId: 'composer.list.fill-gaps',
			candidateId: review.candidate.candidateId,
			variantId: 'variant-1',
		},
		candidate: review.candidate,
		documentId: 'doc-1',
		filePath: 'Doc.md',
		originHost: 'composer',
		review,
	});
	runtime.applyRunEvent({
		type: 'variant-ready',
		runId: 'run-1',
		candidateId: review.candidate.candidateId,
		variantId: 'variant-1',
		envelope: review.candidate.proposedChange.result as never,
	}, review);
	runtime.markCandidateNotAdopted(review.candidate.candidateId);

	const discarded = runtime.projection().runs[0];
	assert.equal(discarded.disposition, 'not-adopted', 'discard changes disposition instead of deleting generation');
	assert.equal(discarded.review?.candidate.candidateId, review.candidate.candidateId, 'discarded output remains recoverable');
	assert.equal(discarded.variantId, 'variant-1', 'run keeps the variant identity');

	const restoredRuntime = new ComposerWorkspaceIntelligenceRuntime(persistence);
	await restoredRuntime.hydrate();
	const restored = restoredRuntime.projection().runs.find((run) => run.runId === 'run-1');
	assert.equal(restored?.disposition, 'not-adopted', 'disposition survives JSONL replay');
	assert.equal(restored?.review?.candidate.proposedChange.result !== undefined, true, 'output survives JSONL replay');

	const groups = groupComposerGenerationRuns(restoredRuntime.projection().runs, 'doc-1');
	assert.equal(groups.length, 1, 'runs group by candidate');
	assert.equal(groups[0]?.runs.length, 1, 'group retains its generation attempts');
	assert.equal(groups[0]?.label, '补缺项', 'group label comes from persisted runtime metadata');

	restoredRuntime.markRunAccepted('run-1', 'txn-1');
	const accepted = restoredRuntime.projection().runs.find((run) => run.runId === 'run-1');
	assert.equal(accepted?.disposition, 'accepted', 'accepted generation remains in generation history');
	assert.equal(accepted?.acceptedTransactionId, 'txn-1', 'accepted generation links to document transaction');
	assert.equal(accepted?.review?.candidate.candidateId, review.candidate.candidateId, 'accept does not erase generation output');

	console.log('composer-generation-history-lifecycle: passed');
}

void main();
