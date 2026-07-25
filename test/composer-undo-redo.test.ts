/**
 * Peak Composer — document Undo/Redo stack (WP2, CMP-UNDO-01 / CMP-UNDO-02).
 *
 * Asserts:
 *   - undo/redo walk the document between the exact revisions transactions
 *     bridge, byte for byte, in LIFO order;
 *   - a new commit AFTER an undo clears the redo branch;
 *   - undo/redo move the stack but never delete History ledger entries;
 *   - undo on an empty stack is a no-op.
 */

import { FakeVault, openSession, makeHub, makeChecker } from './helpers/composer-fakes';

const { check, done } = makeChecker();

const SRC = 'a\n\nb\n';

/** Commit a replace of the whole block at index `i` with `text` (deterministic, standalone). */
async function editBlock(hub: ReturnType<typeof makeHub>, session: ReturnType<typeof openSession>, i: number, text: string, label: string): Promise<void> {
	const block = session.snapshot.blocks[i];
	await hub.commit({
		origin: 'deterministic',
		label,
		operations: [{ kind: 'replaceRange', from: block.source.from, to: block.source.to, text }],
		target: { kind: 'block', blockId: block.blockId },
	});
}

async function testUndoRedoOrder(): Promise<void> {
	const vault = new FakeVault();
	const session = openSession(vault, 'u.md', SRC);
	const hub = makeHub(vault, session);

	await editBlock(hub, session, 0, 'A', 'edit a');
	const afterFirst = vault.read('u.md'); // "A\n\nb\n"
	await editBlock(hub, session, 1, 'B', 'edit b');
	const afterSecond = vault.read('u.md'); // "A\n\nB\n"

	check('order: two undo steps recorded', hub.projection().undo.undoDepth === 2, `${hub.projection().undo.undoDepth}`);

	await hub.undo();
	check('order: undo #1 → after-first', vault.read('u.md') === afterFirst, vault.read('u.md'));
	await hub.undo();
	check('order: undo #2 → original', vault.read('u.md') === SRC, vault.read('u.md'));

	await hub.redo();
	check('order: redo #1 → after-first', vault.read('u.md') === afterFirst, vault.read('u.md'));
	await hub.redo();
	check('order: redo #2 → after-second', vault.read('u.md') === afterSecond, vault.read('u.md'));
	check('order: redo exhausted', !hub.projection().undo.canRedo);
}

async function testNewCommitClearsRedo(): Promise<void> {
	const vault = new FakeVault();
	const session = openSession(vault, 'c.md', SRC);
	const hub = makeHub(vault, session);

	await editBlock(hub, session, 0, 'A', 'edit a');
	await editBlock(hub, session, 1, 'B', 'edit b');
	await hub.undo(); // back to "A\n\nb\n"
	check('clear-redo: redo available after undo', hub.projection().undo.canRedo);

	await editBlock(hub, session, 1, 'C', 'edit c'); // new commit after undo
	check('clear-redo: new commit cleared redo', !hub.projection().undo.canRedo);
	check('clear-redo: undo still available', hub.projection().undo.canUndo);
}

async function testUndoDoesNotDeleteHistory(): Promise<void> {
	const vault = new FakeVault();
	const session = openSession(vault, 'h.md', SRC);
	const hub = makeHub(vault, session);

	await editBlock(hub, session, 0, 'A', 'edit a');
	await editBlock(hub, session, 1, 'B', 'edit b');
	const historyBefore = hub.projection().history.length;

	await hub.undo();
	check('history-relationship: ledger unchanged by undo', hub.projection().history.length === historyBefore, `${hub.projection().history.length} vs ${historyBefore}`);
}

async function testEmptyUndoNoop(): Promise<void> {
	const vault = new FakeVault();
	const session = openSession(vault, 'e.md', SRC);
	const hub = makeHub(vault, session);
	const undone = await hub.undo();
	check('empty: undo on empty stack returns false', undone === false);
	check('empty: redo on empty stack returns false', (await hub.redo()) === false);
	check('empty: nothing written', vault.writeCount === 0);
}

async function main(): Promise<void> {
	await testUndoRedoOrder();
	await testNewCommitClearsRedo();
	await testUndoDoesNotDeleteHistory();
	await testEmptyUndoNoop();
	done('composer-undo-redo');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
