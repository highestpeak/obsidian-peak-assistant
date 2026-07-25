/**
 * Peak Composer — History ledger + grouping (WP2, CMP-HIST-01..03).
 *
 * Asserts:
 *   - the record / don't-record matrix (direct + accepted commit recorded;
 *     pending + discarded candidates never recorded);
 *   - a typing burst (shared groupId) coalesces into ONE parent whose children
 *     are still individually locatable + diff-able;
 *   - one AI run (shared runId) coalesces the same way;
 *   - a rollback APPENDS an inverse entry and preserves the original (never
 *     deletes history), and the document returns to the pre-transaction bytes.
 */

import { FakeVault, openSession, makeHub, makeChecker } from './helpers/composer-fakes';

const { check, done } = makeChecker();

async function testRecordMatrix(): Promise<void> {
	const vault = new FakeVault();
	const session = openSession(vault, 'm.md', '# H\n\nbody text\n');
	const hub = makeHub(vault, session);
	const body = session.snapshot.blocks[1];

	// pending candidate → not recorded.
	const pending = hub.createCandidate({
		target: { kind: 'block', blockId: body.blockId },
		proposedChange: { operations: [{ kind: 'replaceRange', from: body.source.from, to: body.source.to, text: 'X' }] },
	});
	check('matrix: pending candidate not recorded', hub.projection().history.length === 0);

	// discarded candidate → not recorded.
	hub.discardCandidate(pending.candidateId);
	check('matrix: discarded candidate not recorded', hub.projection().history.length === 0);

	// direct commit → recorded.
	await hub.commit({
		origin: 'direct',
		label: 'direct edit',
		operations: [{ kind: 'replaceRange', from: body.source.from, to: body.source.to, text: 'edited' }],
		target: { kind: 'block', blockId: body.blockId },
	});
	check('matrix: direct commit recorded', hub.projection().history.length === 1);

	// accepted candidate → recorded.
	const fresh = session.snapshot.blocks[1];
	const accepted = hub.createCandidate({
		target: { kind: 'block', blockId: fresh.blockId },
		proposedChange: { operations: [{ kind: 'replaceRange', from: fresh.source.from, to: fresh.source.to, text: 'accepted body' }], summary: 'apply' },
	});
	await hub.acceptCandidate(accepted.candidateId);
	check('matrix: accepted candidate recorded', hub.projection().history.length === 2, `${hub.projection().history.length}`);
}

async function testBurstGrouping(): Promise<void> {
	const vault = new FakeVault();
	const session = openSession(vault, 'b.md', 'seed\n');
	const hub = makeHub(vault, session);

	for (const text of [' a', ' b', ' c']) {
		const block = session.snapshot.blocks[0];
		await hub.commit({
			origin: 'direct',
			label: 'type',
			groupId: 'burst-1',
			operations: [{ kind: 'replaceRange', from: block.source.to, to: block.source.to, text }],
			target: { kind: 'block', blockId: block.blockId },
		});
	}

	const history = hub.projection().history;
	check('burst: single parent entry', history.length === 1, `${history.length}`);
	const parent = history[0];
	check('burst: parent has 3 children', parent.children?.length === 3, `${parent.children?.length}`);
	check('burst: children keep own transactionId (locate)', parent.children?.every((c) => !!c.transactionId) ?? false);
	check('burst: children keep own target (locate)', parent.children?.every((c) => !!c.target) ?? false);
	check('burst: parent stats aggregate children', parent.stats.added === (parent.children?.reduce((s, c) => s + c.stats.added, 0) ?? -1));
	check('burst: one Undo step for the whole burst', hub.projection().undo.undoDepth === 1, `${hub.projection().undo.undoDepth}`);
}

async function testRunGrouping(): Promise<void> {
	const vault = new FakeVault();
	const session = openSession(vault, 'run.md', 'alpha\n\nbeta\n');
	const hub = makeHub(vault, session);

	const b0 = session.snapshot.blocks[0];
	await hub.commit({
		origin: 'ai',
		label: 'ai change 1',
		runId: 'run-7',
		operations: [{ kind: 'replaceRange', from: b0.source.from, to: b0.source.to, text: 'ALPHA' }],
		target: { kind: 'block', blockId: b0.blockId },
	});
	const b1 = session.snapshot.blocks[1];
	await hub.commit({
		origin: 'ai',
		label: 'ai change 2',
		runId: 'run-7',
		operations: [{ kind: 'replaceRange', from: b1.source.from, to: b1.source.to, text: 'BETA' }],
		target: { kind: 'block', blockId: b1.blockId },
	});

	const history = hub.projection().history;
	check('run: single parent for the run', history.length === 1, `${history.length}`);
	check('run: two children under the run', history[0].children?.length === 2);
	check('run: children carry the runId', history[0].children?.every((c) => c.runId === 'run-7') ?? false);
	check('run: one Undo step for the run', hub.projection().undo.undoDepth === 1);
}

async function testRollbackAppendsInverse(): Promise<void> {
	const vault = new FakeVault();
	const src = 'original line\n';
	const session = openSession(vault, 'rb.md', src);
	const hub = makeHub(vault, session);
	const block = session.snapshot.blocks[0];

	await hub.commit({
		origin: 'direct',
		label: 'change it',
		operations: [{ kind: 'replaceRange', from: block.source.from, to: block.source.to, text: 'changed line' }],
		target: { kind: 'block', blockId: block.blockId },
	});
	const beforeRollback = hub.projection().history;
	const targetId = beforeRollback[0].historyId;
	check('rollback: file changed first', vault.read('rb.md') === 'changed line\n');

	const inverseTxn = await hub.rollback(targetId);
	const after = hub.projection().history;
	check('rollback: appended a new entry (not deleted)', after.length === beforeRollback.length + 1, `${after.length}`);
	check('rollback: original entry still present', after.some((h) => h.historyId === targetId));
	check('rollback: new entry flagged isRollback', after[after.length - 1].isRollback === true);
	check('rollback: system-rollback origin', inverseTxn.origin === 'system-rollback');
	check('rollback: document restored to original bytes', vault.read('rb.md') === src, vault.read('rb.md'));
	check('rollback: rollback is itself undoable', hub.projection().undo.canUndo);
}

async function main(): Promise<void> {
	await testRecordMatrix();
	await testBurstGrouping();
	await testRunGrouping();
	await testRollbackAppendsInverse();
	done('composer-history-grouping');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
