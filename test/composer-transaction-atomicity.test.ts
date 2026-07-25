/**
 * Peak Composer — transaction atomicity (WP2, CMP-TXN-01 / CMP-TXN-03 / CMP-TXN-04).
 *
 * Asserts the §5.2 commit contract end-to-end against the in-memory vault:
 *   - the eight steps land in order (write + reparse + History + Undo + event);
 *   - a commit is atomic — a patch that would fuse blocks (step-4 reparse-assert
 *     failure) persists NOTHING and records NOTHING;
 *   - inverse operations are exact: apply-then-invert reproduces the source byte
 *     for byte, for replace / insert / remove / move and multi-op transactions;
 *   - overlapping edits in one transaction are refused whole;
 *   - a concurrent external edit is rejected (revision-mismatch), nothing written;
 *   - a real golden-fixture paragraph edit commits and undoes to exact bytes.
 */

import fs from 'fs';
import path from 'path';
import {
	applyOperations,
	deriveInverseOperations,
	ComposerConflictError,
	type ComposerOperation,
} from '@/core/composer';
import { FakeVault, openSession, makeHub, makeChecker, blockOfKind } from './helpers/composer-fakes';

const { check, done } = makeChecker();

async function testHappyPath(): Promise<void> {
	const vault = new FakeVault();
	const src = '# Title\n\nHello world.\n';
	const session = openSession(vault, 'a.md', src);
	const hub = makeHub(vault, session);
	const events: string[] = [];
	hub.on((e) => events.push(e.type));
	const para = blockOfKind(session, 'paragraph');

	const baseRevision = session.baseRevision;
	const op: ComposerOperation = { kind: 'replaceRange', from: para.source.from, to: para.source.to, text: 'Hello, brave world.' };
	const txn = await hub.commit({
		origin: 'direct',
		label: 'Edit paragraph',
		operations: [op],
		target: { kind: 'block', blockId: para.blockId },
	});

	check('step: vault persisted new text', vault.read('a.md') === '# Title\n\nHello, brave world.\n', vault.read('a.md'));
	check('step: exactly one write hit disk', vault.writeCount === 1, `${vault.writeCount}`);
	check('step: session advanced revision', session.baseRevision !== baseRevision);
	check('step: transaction records base+result', txn.baseRevision === baseRevision && txn.resultRevision === session.baseRevision);
	const proj = hub.projection();
	check('step: History has one entry', proj.history.length === 1, `${proj.history.length}`);
	check('step: History entry is the direct edit', proj.history[0]?.origin === 'direct');
	check('step: stats counted added chars', proj.history[0]?.stats.added > 0);
	check('step: Undo enabled, Redo empty', proj.undo.canUndo && !proj.undo.canRedo);
	check('step: unified committed event fired', events.includes('committed'));

	// inverse exactness against the real committed bytes.
	check('inverse: apply reproduces committed text', applyOperations(src, txn.operations) === vault.read('a.md'));
	check('inverse: invert reproduces source', applyOperations(applyOperations(src, txn.operations), txn.inverseOperations) === src);
}

function testInverseAlgebra(): void {
	const base = 'one two three\n\nfour five six\n';
	const cases: Array<[string, ComposerOperation[]]> = [
		['single replace', [{ kind: 'replaceRange', from: 0, to: 3, text: 'ONE' }]],
		['two disjoint replaces', [
			{ kind: 'replaceRange', from: 0, to: 3, text: 'ONE' },
			{ kind: 'replaceRange', from: 15, to: 19, text: 'FOUR' },
		]],
		['insert block', [{ kind: 'insertBlock', at: base.length, text: '\nappended para\n' }]],
		['remove block', [{ kind: 'removeBlock', from: 0, to: 14 }]],
		['move block', [{ kind: 'moveBlock', from: 0, to: 13, insertAt: base.length }]],
	];
	for (const [label, ops] of cases) {
		const next = applyOperations(base, ops);
		const inverse = deriveInverseOperations(base, ops);
		check(`inverse: ${label} apply+invert === base`, applyOperations(next, inverse) === base, `next=${JSON.stringify(next)}`);
	}

	// overlapping edits in one transaction are refused whole.
	let overlapThrew = false;
	try {
		applyOperations(base, [
			{ kind: 'replaceRange', from: 0, to: 7, text: 'X' },
			{ kind: 'replaceRange', from: 4, to: 10, text: 'Y' },
		]);
	} catch {
		overlapThrew = true;
	}
	check('atomicity: overlapping edits rejected', overlapThrew);
}

async function testFusionRejected(): Promise<void> {
	const vault = new FakeVault();
	const src = 'A\n\nB\n';
	const session = openSession(vault, 'f.md', src);
	const hub = makeHub(vault, session);
	const paraA = session.snapshot.blocks[0];
	const paraB = session.snapshot.blocks[1];

	// Malicious patch spans into the inter-block gap, fusing two paragraphs.
	let threw: ComposerConflictError | null = null;
	try {
		await hub.commit({
			origin: 'ai',
			label: 'evil fuse',
			operations: [{ kind: 'replaceRange', from: paraA.source.from, to: paraB.source.to, text: 'AB' }],
			target: { kind: 'block', blockId: paraA.blockId },
		});
	} catch (e) {
		threw = e as ComposerConflictError;
	}
	check('fusion: commit threw a conflict', threw instanceof ComposerConflictError, String(threw));
	check('fusion: conflict reason is target-missing-after-reparse', threw?.reason === 'target-missing-after-reparse', threw?.reason);
	check('fusion: nothing persisted', vault.writeCount === 0 && vault.read('f.md') === src);
	check('fusion: nothing recorded in History', hub.projection().history.length === 0);
	check('fusion: Undo still empty', !hub.projection().undo.canUndo);
}

async function testConcurrentRejected(): Promise<void> {
	const vault = new FakeVault();
	const src = 'first line\n';
	const session = openSession(vault, 'c.md', src);
	const hub = makeHub(vault, session);
	const para = session.snapshot.blocks[0];

	await hub.commit({
		origin: 'direct',
		label: 'first',
		operations: [{ kind: 'replaceRange', from: para.source.to, to: para.source.to, text: ' edited' }],
		target: { kind: 'block', blockId: para.blockId },
	});
	const afterFirst = vault.writeCount;

	// Someone edits the file out from under the session.
	vault.external('c.md', 'a completely different document\n');

	let threw: ComposerConflictError | null = null;
	try {
		await hub.commit({
			origin: 'direct',
			label: 'second',
			operations: [{ kind: 'replaceRange', from: 0, to: 5, text: 'X' }],
			target: { kind: 'document', documentId: 'c.md' },
		});
	} catch (e) {
		threw = e as ComposerConflictError;
	}
	check('concurrent: commit threw revision-mismatch', threw?.reason === 'revision-mismatch', threw?.reason);
	check('concurrent: no extra write', vault.writeCount === afterFirst);
	check('concurrent: external bytes untouched', vault.read('c.md') === 'a completely different document\n');
}

async function testGoldenFixtureRoundTrip(): Promise<void> {
	const fixture = path.join(process.cwd(), 'test', 'fixtures', 'composer', 'g5-basic-markdown-syntax.md');
	const original = fs.readFileSync(fixture, 'utf8');
	const vault = new FakeVault();
	const session = openSession(vault, 'g5.md', original);
	const hub = makeHub(vault, session);
	const para = blockOfKind(session, 'paragraph');

	await hub.commit({
		origin: 'direct',
		label: 'append to paragraph',
		operations: [{ kind: 'replaceRange', from: para.source.to, to: para.source.to, text: ' (edited)' }],
		target: { kind: 'block', blockId: para.blockId },
	});
	check('golden: real paragraph edit persisted', vault.read('g5.md') !== original && vault.read('g5.md').includes(' (edited)'));

	const undone = await hub.undo();
	check('golden: undo returned true', undone);
	check('golden: undo restores exact original bytes', vault.read('g5.md') === original, 'byte drift after undo');
}

async function main(): Promise<void> {
	await testHappyPath();
	testInverseAlgebra();
	await testFusionRejected();
	await testConcurrentRejected();
	await testGoldenFixtureRoundTrip();
	done('composer-transaction-atomicity');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
