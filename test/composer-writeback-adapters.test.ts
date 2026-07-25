/**
 * Peak Composer — writeback adapters (WP3, CMP-AI-05/06).
 *
 * The text-patch adapter and the accept path per spec §9 / §15.5:
 *   - operations replace exactly the frozen anchor range `[from,to)`;
 *   - a missing anchor fails CLOSED (no position guessing);
 *   - adapter registry refuses unknown ids and kind mismatches;
 *   - accept routes through the WP2 hub: atomic vault write, one History
 *     entry labeled from the definition config, origin 'ai', undo reverses
 *     to exact bytes;
 *   - a stale candidate (external edit) is refused and nothing is written.
 */

import {
	ComposerDocumentSession,
	ComposerWritebackAdapterRegistry,
	createDefaultWritebackAdapters,
	createTextPatchWritebackAdapter,
} from '@/service/composer';
import {
	COMPOSER_TEXT_PATCH_WRITEBACK_ID,
	ComposerConflictError,
	type ComposerResultEnvelope,
} from '@/core/composer';
import { FakeVault, openSession, makeHub, makeChecker, blockOfKind } from './helpers/composer-fakes';

const { check, done } = makeChecker();

const SOURCE = '# Title\n\nOld paragraph text.\n\nAnother paragraph.\n';

function envelopeOf(text: string): ComposerResultEnvelope {
	return {
		resultKind: 'text-patch',
		rendererId: 'composer.renderer.streaming-text',
		writebackAdapterId: COMPOSER_TEXT_PATCH_WRITEBACK_ID,
		payload: { replacementText: text },
	};
}

function testAdapterOperations(): void {
	const adapter = createTextPatchWritebackAdapter();
	const ops = adapter.buildOperations(envelopeOf('New text.'), {
		target: { kind: 'block', blockId: 'b1' },
		anchor: { from: 9, to: 28 },
	});
	check('one replaceRange op', ops.length === 1 && ops[0].kind === 'replaceRange');
	const op = ops[0] as { from: number; to: number; text: string };
	check('op replaces exactly the anchor range', op.from === 9 && op.to === 28 && op.text === 'New text.');

	let threw: unknown = null;
	try {
		adapter.buildOperations(envelopeOf('x'), { target: { kind: 'document', documentId: 'd' } });
	} catch (err) {
		threw = err;
	}
	check('missing anchor fails closed', threw instanceof Error && /refusing to guess/.test(threw.message));
}

function testAdapterRegistry(): void {
	const registry = createDefaultWritebackAdapters();
	check('default registry resolves text-patch envelope', registry.resolve(envelopeOf('x')).id === COMPOSER_TEXT_PATCH_WRITEBACK_ID);

	let unknownThrew = false;
	try {
		registry.resolve({ ...envelopeOf('x'), writebackAdapterId: 'composer.writeback.nope' });
	} catch {
		unknownThrew = true;
	}
	check('unknown adapter id refused', unknownThrew);

	let noAdapterThrew = false;
	try {
		const envelope = envelopeOf('x');
		delete (envelope as { writebackAdapterId?: string }).writebackAdapterId;
		registry.resolve(envelope);
	} catch {
		noAdapterThrew = true;
	}
	check('envelope without adapter id refused', noAdapterThrew);

	let mismatchThrew = false;
	try {
		registry.resolve({ ...envelopeOf('x'), resultKind: 'table-patch' });
	} catch {
		mismatchThrew = true;
	}
	check('result-kind mismatch refused', mismatchThrew);

	let duplicateThrew = false;
	try {
		const fresh = new ComposerWritebackAdapterRegistry();
		fresh.register(createTextPatchWritebackAdapter());
		fresh.register(createTextPatchWritebackAdapter());
	} catch {
		duplicateThrew = true;
	}
	check('duplicate adapter registration refused', duplicateThrew);
}

async function testAcceptThroughHub(): Promise<void> {
	const vault = new FakeVault();
	const session = openSession(vault, 'doc.md', SOURCE);
	const hub = makeHub(vault, session);
	const para = blockOfKind(session, 'paragraph');
	const adapter = createTextPatchWritebackAdapter();

	const operations = adapter.buildOperations(envelopeOf('Fresh, polished paragraph.'), {
		target: { kind: 'block', blockId: para.blockId },
		anchor: { from: para.source.from, to: para.source.to },
	});
	const candidate = hub.createCandidate({
		target: { kind: 'block', blockId: para.blockId },
		proposedChange: { operations, result: envelopeOf('Fresh, polished paragraph.') },
	});

	check('pending candidate wrote nothing', vault.read('doc.md') === SOURCE);
	check('pending candidate not in History', hub.projection().history.length === 0);

	const txn = await hub.acceptCandidate(candidate.candidateId, { origin: 'ai', label: 'AI polish', runId: 'run-1' });
	check('accept committed the replacement', vault.read('doc.md').includes('Fresh, polished paragraph.'));
	check('surrounding blocks untouched', vault.read('doc.md').startsWith('# Title\n\n') && vault.read('doc.md').includes('Another paragraph.'));
	check('History entry labeled from definition config', hub.projection().history[0]?.label === 'AI polish');
	check('History entry has ai origin', hub.projection().history[0]?.origin === 'ai');
	check('transaction carries the runId', txn.runId === 'run-1');

	const undone = await hub.undo();
	check('undo reverses to exact bytes', undone && vault.read('doc.md') === SOURCE, vault.read('doc.md'));
	check('History keeps the accepted entry after undo', hub.projection().history.length === 1);
}

async function testStaleCandidateRefused(): Promise<void> {
	const vault = new FakeVault();
	const session = openSession(vault, 'doc.md', SOURCE);
	const hub = makeHub(vault, session);
	const para = blockOfKind(session, 'paragraph');
	const adapter = createTextPatchWritebackAdapter();
	const operations = adapter.buildOperations(envelopeOf('Will never land.'), {
		target: { kind: 'block', blockId: para.blockId },
		anchor: { from: para.source.from, to: para.source.to },
	});
	const candidate = hub.createCandidate({
		target: { kind: 'block', blockId: para.blockId },
		proposedChange: { operations },
	});

	// External edit bypasses the hub → candidate must go stale, accept refused.
	const external = SOURCE.replace('Old paragraph text.', 'Externally rewritten.');
	vault.external('doc.md', external);
	hub.adoptExternalSnapshot(ComposerDocumentSession.fromSource('doc.md', external).snapshot);

	let threw: unknown = null;
	try {
		await hub.acceptCandidate(candidate.candidateId, { origin: 'ai', label: 'AI polish' });
	} catch (err) {
		threw = err;
	}
	check('stale candidate accept refused', threw instanceof ComposerConflictError && threw.reason === 'stale-candidate');
	check('nothing written for the stale accept', vault.read('doc.md') === external);
}

async function main(): Promise<void> {
	testAdapterOperations();
	testAdapterRegistry();
	await testAcceptThroughHub();
	await testStaleCandidateRefused();
	done('composer-writeback-adapters');
}

void main();
