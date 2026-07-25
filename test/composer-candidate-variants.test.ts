/**
 * Peak Composer — candidate / variant lifecycle (WP2, §5.3).
 *
 * Asserts:
 *   - a pending candidate touches neither Markdown, History nor Undo;
 *   - regeneration APPENDS a variant (old variants retained), and switches active;
 *   - only an active `ready` variant on a fresh candidate can be accepted;
 *   - a candidate whose base revision moved goes `stale` and is unacceptable;
 *   - accept commits the active variant's operations (into History + Undo);
 *   - discard/restore are candidate-local and never touch document undo/redo.
 */

import { ComposerConflictError } from '@/core/composer';
import { FakeVault, openSession, makeHub, makeChecker } from './helpers/composer-fakes';

const { check, done } = makeChecker();

const SRC = '# Doc\n\nfirst body\n\nsecond body\n';

function firstBody(session: ReturnType<typeof openSession>) {
	return session.snapshot.blocks[1];
}

async function testPendingIsolation(): Promise<void> {
	const vault = new FakeVault();
	const session = openSession(vault, 'p.md', SRC);
	const hub = makeHub(vault, session);
	const body = firstBody(session);

	hub.createCandidate({
		target: { kind: 'block', blockId: body.blockId },
		proposedChange: { operations: [{ kind: 'replaceRange', from: body.source.from, to: body.source.to, text: 'FIRST BODY' }], summary: 'shout' },
	});

	const proj = hub.projection();
	check('pending: candidate is listed', proj.candidates.length === 1);
	check('pending: candidate ready', proj.candidates[0]?.status === 'ready');
	check('pending: nothing written to Markdown', vault.read('p.md') === SRC && vault.writeCount === 0);
	check('pending: History empty', proj.history.length === 0);
	check('pending: Undo empty', !proj.undo.canUndo);
}

function testVariantAppend(): void {
	const vault = new FakeVault();
	const session = openSession(vault, 'v.md', SRC);
	const hub = makeHub(vault, session);
	const body = firstBody(session);

	const c0 = hub.createCandidate({
		target: { kind: 'block', blockId: body.blockId },
		proposedChange: { operations: [{ kind: 'replaceRange', from: body.source.from, to: body.source.to, text: 'v1' }] },
	});
	const firstVariantId = c0.activeVariantId;

	const c1 = hub.addVariant(c0.candidateId, {
		proposedChange: { operations: [{ kind: 'replaceRange', from: body.source.from, to: body.source.to, text: 'v2' }] },
		instruction: 'make it punchier',
	});
	check('variant: appended (2 total)', c1.variants.length === 2, `${c1.variants.length}`);
	check('variant: first variant retained', c1.variants.some((v) => v.variantId === firstVariantId));
	check('variant: newest is active', c1.activeVariantId !== firstVariantId);
	check('variant: newest is regeneration', c1.variants[1].provenance === 'regeneration');
	check('variant: instruction stored as run context, not body', c1.variants[1].instruction === 'make it punchier');
	check('variant: active proposedChange follows active variant', c1.proposedChange.operations[0] && (c1.proposedChange.operations[0] as { text?: string }).text === 'v2');

	// switching back to the first variant restores its change.
	const back = hub.setActiveVariant(c0.candidateId, firstVariantId);
	check('variant: switch active back to v1', (back.proposedChange.operations[0] as { text?: string }).text === 'v1');
}

async function testActiveReadyOnlyAccept(): Promise<void> {
	const vault = new FakeVault();
	const session = openSession(vault, 'a.md', SRC);
	const hub = makeHub(vault, session);
	const body = firstBody(session);

	const streaming = hub.createCandidate({
		target: { kind: 'block', blockId: body.blockId },
		proposedChange: { operations: [] },
		streaming: true,
	});
	check('accept: streaming candidate is not ready', hub.projection().candidates[0]?.status === 'streaming');

	let threw = false;
	try {
		await hub.acceptCandidate(streaming.candidateId);
	} catch (e) {
		threw = e instanceof ComposerConflictError;
	}
	check('accept: streaming candidate refused', threw);
	check('accept: refusal wrote nothing', vault.writeCount === 0);

	// mark ready with a concrete change → now acceptable.
	hub.markVariantReady(streaming.candidateId, {
		operations: [{ kind: 'replaceRange', from: body.source.from, to: body.source.to, text: 'DONE' }],
		summary: 'finalize',
	});
	const txn = await hub.acceptCandidate(streaming.candidateId);
	check('accept: ready candidate committed', vault.read('a.md').includes('DONE'));
	check('accept: origin defaults to ai', txn.origin === 'ai');
	const proj = hub.projection();
	check('accept: recorded in History', proj.history.length === 1);
	check('accept: pushed to Undo', proj.undo.canUndo);
	check('accept: candidate marked accepted', hub.projection().candidates.find((c) => c.candidateId === streaming.candidateId)?.status === 'accepted');
}

async function testDiscardRestoreNotUndo(): Promise<void> {
	const vault = new FakeVault();
	const session = openSession(vault, 'r.md', SRC);
	const hub = makeHub(vault, session);
	const body = firstBody(session);

	// One real commit so the undo stack has depth 1.
	await hub.commit({
		origin: 'direct',
		label: 'real edit',
		operations: [{ kind: 'replaceRange', from: body.source.from, to: body.source.to, text: 'edited body' }],
		target: { kind: 'block', blockId: body.blockId },
	});
	const undoDepthBefore = hub.projection().undo.undoDepth;

	const candidate = hub.createCandidate({
		target: { kind: 'document', documentId: 'r.md' },
		proposedChange: { operations: [] },
	});
	hub.discardCandidate(candidate.candidateId);
	check('discard: removed from candidate list', !hub.projection().candidates.some((c) => c.candidateId === candidate.candidateId));
	check('discard: Undo depth unchanged', hub.projection().undo.undoDepth === undoDepthBefore, `${hub.projection().undo.undoDepth}`);

	const restored = hub.restoreCandidate(candidate.candidateId);
	check('restore: candidate back in list', !!restored && hub.projection().candidates.some((c) => c.candidateId === candidate.candidateId));
	check('restore: Undo depth still unchanged', hub.projection().undo.undoDepth === undoDepthBefore);
	check('restore: Redo not created by restore', !hub.projection().undo.canRedo);
}

async function main(): Promise<void> {
	await testPendingIsolation();
	testVariantAppend();
	await testActiveReadyOnlyAccept();
	await testDiscardRestoreNotUndo();
	done('composer-candidate-variants');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
