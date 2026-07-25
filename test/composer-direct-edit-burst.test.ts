/**
 * Peak Composer — direct-edit burst → hub integration (WP4, S2 决议).
 *
 * Against the fake vault: continuous typing coalesces into ONE debounced
 * `direct` transaction; the whole editing session shares a stable groupId (NOT
 * the blockId) so multiple flushes project into one grouped History parent and
 * one Undo step; a no-op flush commits nothing; a new session mints a new
 * groupId; block move / insert-below / checkbox builders commit real,
 * reparse-safe transactions through the same hub.
 */

import { DEFAULT_TRANSACTION_CONFIG } from '@/core/composer';
import {
	DirectEditController,
	buildInsertBelowOps,
	buildMoveBlockOps,
	buildToggleTaskOps,
	matchBlocks,
} from '@/service/composer';
import { FakeVault, openSession, makeHub, makeChecker, blockOfKind } from './helpers/composer-fakes';

const { check, done } = makeChecker();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SRC = '# Title\n\nHello world paragraph.\n\n- [ ] task one\n- [x] task two\n\nTail paragraph.\n';

async function testBurst(): Promise<void> {
	const vault = new FakeVault();
	const session = openSession(vault, 'd.md', SRC);
	const hub = makeHub(vault, session, DEFAULT_TRANSACTION_CONFIG);
	let commits = 0;
	hub.on((e) => {
		if (e.type === 'committed') commits += 1;
	});

	// The UI's resolveRange closure: re-locate the paragraph in the CURRENT snapshot.
	const resolveRange = () => {
		const para = session.snapshot.blocks.find((b) => b.kind === 'paragraph');
		if (!para) return null;
		return {
			from: para.source.from,
			to: para.source.to,
			current: session.snapshot.sourceText.slice(para.source.from, para.source.to),
			target: { kind: 'block' as const, blockId: para.blockId },
		};
	};

	const controller = new DirectEditController({
		hub,
		resolveRange,
		label: '直接编辑',
		burstWindowMs: 40,
	});

	// Three keystrokes inside one burst window → ONE transaction.
	controller.onInput('Hello world paragraph. A');
	check('dirty while burst pending', controller.dirty === true);
	controller.onInput('Hello world paragraph. AB');
	controller.onInput('Hello world paragraph. ABC');
	const g1 = controller.sessionGroupId;
	check('groupId minted at first input', typeof g1 === 'string' && g1!.length > 0);
	await sleep(90);
	check('burst coalesced into one commit', commits === 1, String(commits));
	check('dirty cleared after flush', controller.dirty === false);
	check('vault text updated', vault.read('d.md').includes('Hello world paragraph. ABC'));

	// Second burst in the SAME session (still focused) → same groupId.
	controller.onInput('Hello world paragraph. ABCD');
	await controller.flush();
	check('second flush committed', commits === 2, String(commits));
	check('groupId stable across flushes', controller.sessionGroupId === g1);

	// Both transactions project into ONE grouped History parent.
	const history = hub.projection().history;
	const grouped = history.find((h) => h.groupId === g1);
	check('history groups the burst', Boolean(grouped && grouped.children && grouped.children.length === 2), JSON.stringify(history.map((h) => ({ g: h.groupId, c: h.children?.length }))));

	// One undo step reverts the whole session group.
	await hub.undo();
	check('undo reverts the grouped session', vault.read('d.md').includes('Hello world paragraph.') && !vault.read('d.md').includes('ABC'));
	await hub.redo();
	check('redo restores the grouped session', vault.read('d.md').includes('Hello world paragraph. ABCD'));

	// No-op flush (text identical) commits nothing.
	const before = commits;
	controller.onInput('Hello world paragraph. ABCD');
	await controller.flush();
	check('identical text flush is a no-op', commits === before);

	// New session after endSession → NEW groupId.
	await controller.endSession();
	controller.onInput('Hello world paragraph. ABCDE');
	await controller.flush();
	check('new session mints a new groupId', controller.sessionGroupId !== g1);
	controller.dispose();
}

async function testCheckboxAndInsertAndMove(): Promise<void> {
	const vault = new FakeVault();
	const session = openSession(vault, 'm.md', SRC);
	const hub = makeHub(vault, session);

	// Checkbox toggle writes the real [ ] → [x].
	const task = blockOfKind(session, 'task');
	const unit = task.units[0];
	const toggle = buildToggleTaskOps(session.snapshot, task.blockId, unit.unitId);
	check('toggle ops built', Boolean(toggle));
	await hub.commit({ origin: 'direct', label: '勾选任务', operations: toggle!.operations, target: toggle!.target, expectedBlockDelta: toggle!.expectedBlockDelta });
	check('checkbox persisted', vault.read('m.md').includes('- [x] task one'));

	// Insert below commits a real paragraph (+1 block).
	const heading = blockOfKind(session, 'heading');
	const blockCount = session.snapshot.blocks.length;
	const ins = buildInsertBelowOps(session.snapshot, heading.blockId, 'Inserted paragraph.');
	check('insert ops built', Boolean(ins));
	await hub.commit({ origin: 'direct', label: '在下方插入', operations: ins!.operations, target: ins!.target, expectedBlockDelta: ins!.expectedBlockDelta });
	check('insert added exactly one block', session.snapshot.blocks.length === blockCount + 1);
	check('inserted paragraph sits below the heading', /# Title\n\nInserted paragraph\.\n\nHello world/.test(vault.read('m.md')), vault.read('m.md').slice(0, 60));

	// Drag-move: move the tail paragraph to the top (before block 0).
	const prev = session.snapshot;
	const tail = prev.blocks[prev.blocks.length - 1];
	const move = buildMoveBlockOps(prev, tail.blockId, 0);
	check('move ops built', Boolean(move));
	await hub.commit({ origin: 'direct', label: '移动块', operations: move!.operations, target: move!.target, expectedBlockDelta: move!.expectedBlockDelta });
	check('move keeps block count', session.snapshot.blocks.length === prev.blocks.length);
	check('moved block leads the document', session.snapshot.sourceText.startsWith('Tail paragraph.'), JSON.stringify(session.snapshot.sourceText.slice(0, 24)));
	const moved = matchBlocks(prev.blocks, session.snapshot.blocks).find((m) => m.oldBlockId === tail.blockId);
	check('moved block survives rematch', Boolean(moved && moved.reason === 'fingerprint'));

	// Move to end.
	const prev2 = session.snapshot;
	const first = prev2.blocks[0];
	const move2 = buildMoveBlockOps(prev2, first.blockId, prev2.blocks.length);
	await hub.commit({ origin: 'direct', label: '移动块', operations: move2!.operations, target: move2!.target, expectedBlockDelta: move2!.expectedBlockDelta });
	check('move-to-end keeps block count', session.snapshot.blocks.length === prev2.blocks.length);
	check('moved block ends the document', session.snapshot.sourceText.trimEnd().endsWith('Tail paragraph.'));

	// No-op drops return null.
	const b1 = session.snapshot.blocks[1];
	check('same-position drop is a no-op', buildMoveBlockOps(session.snapshot, b1.blockId, 1) === null);
	check('adjacent drop is a no-op', buildMoveBlockOps(session.snapshot, b1.blockId, 2) === null);
	check('empty insert refused', buildInsertBelowOps(session.snapshot, b1.blockId, '   ') === null);
}

async function main(): Promise<void> {
	await testBurst();
	await testCheckboxAndInsertAndMove();
	done('composer-direct-edit-burst');
}

void main();
