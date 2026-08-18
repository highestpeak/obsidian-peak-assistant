import assert from 'node:assert/strict';
import { IndexRunCoordinator } from '@/app/search/IndexRunCoordinator';
import type { IndexRunResult } from '@/core/ports/IndexRunCoordinatorPort';

let finish: ((result: IndexRunResult) => void) | null = null;
let starts = 0;
const fakeContext = {
	progressReporter: {
		subscribe: () => () => undefined,
	},
} as any;
const coordinator = new IndexRunCoordinator(fakeContext, {
	runPlan: async () => {
		starts++;
		return new Promise<IndexRunResult>((resolve) => { finish = resolve; });
	},
	readIndexStatus: async () => ({ isReady: false, indexedDocs: 0 }),
});

async function main(): Promise<void> {
	const first = await coordinator.startOrAttach({ level: 'fast' });
	const second = await coordinator.startOrAttach({ level: 'fast' });
	const third = await coordinator.startOrAttach({ level: 'semantic' });
	assert.equal(first.disposition, 'started');
	assert.equal(second.disposition, 'attached');
	assert.equal(third.disposition, 'attached', 'a second UI must attach to the active run instead of starting a competing run');
	assert.equal(first.runId, second.runId);
	assert.equal(first.runId, third.runId);
	assert.equal(starts, 1);
	assert.equal((await coordinator.getReadiness()).fullText, 'building');

	finish?.({ status: 'complete', indexedCount: 5, failureCount: 0, totalDocuments: 5, message: 'ready' });
	const result = await coordinator.waitFor(first.runId);
	assert.equal(result.status, 'complete');
	assert.equal(coordinator.getSnapshot().status, 'complete');
	coordinator.dispose();
	console.log('PASS onboarding-index-coordination');
}

void main();
