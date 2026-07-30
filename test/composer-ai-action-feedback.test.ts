import assert from 'assert';
import { readFileSync } from 'fs';
import { ComposerCandidateStore } from '@/service/composer/candidateStore';

const store = new ComposerCandidateStore();
const candidate = store.create({
	target: { kind: 'document', documentId: 'doc-a' },
	baseRevision: 'rev-a',
	proposedChange: { operations: [] },
	streaming: true,
});

assert.equal(candidate.status, 'streaming', 'an invoked AI action must immediately create visible progress state');
const failed = store.markVariantFailed(candidate.candidateId, 'Provider unavailable');
assert.equal(failed.status, 'failed');
assert.equal(failed.variants[0]?.error, 'Provider unavailable', 'failure detail must survive on the review variant');

const retrying = store.addVariant(candidate.candidateId, {
	proposedChange: { operations: [] },
	streaming: true,
	instruction: 'try again',
});
assert.equal(retrying.variants.length, 2, 'retry must append a variant instead of erasing the failure');
const cancelled = store.markVariantCancelled(candidate.candidateId);
assert.equal(cancelled.status, 'cancelled', 'user cancellation must be distinct from provider failure');
assert.equal(
	store.prepareAccept(candidate.candidateId, 'rev-a').ok,
	false,
	'cancelled work cannot be accepted',
);
store.markAllStale();
const lateReady = store.markVariantReady(candidate.candidateId, { operations: [] });
assert.equal(
	lateReady.status,
	'stale',
	'a late provider completion cannot revive a candidate after revision drift',
);

const runtime = readFileSync('src/service/composer/capabilities/documentRuntime.ts', 'utf8');
const card = readFileSync('src/ui/view/composer/candidates/StreamingTextCandidateCard.tsx', 'utf8');
const root = readFileSync('src/ui/view/composer/ComposerRoot.tsx', 'utf8');
assert.match(runtime, /run-cancelled/, 'runtime must publish cancellation');
assert.match(runtime, /run-failed/, 'runtime must publish provider failures');
assert.match(card, /activeVariantError/, 'review UI must show the persisted provider error');
assert.match(card, /candidate\.status === 'cancelled'/, 'review UI must show cancellation');
assert.match(card, /runtime\.regenerate/, 'failed and cancelled variants must remain retryable');
assert.match(root, /invokeErrors/, 'synchronous invoke failures must remain visible at the action origin');
assert.doesNotMatch(root, /catch\s*\(\s*\)\s*\{\s*\}/, 'Composer AI actions cannot swallow errors');

console.log('composer-ai-action-feedback: passed');
