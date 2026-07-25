/**
 * Peak Composer — selection-scoped AI writeback + stale re-run (WP4.5,
 * CMP-AI-01 selection half / CMP-SEL selection-range / stale-regenerate).
 *
 * Two integration slices over the REAL capability runtime + a fake executor:
 *
 *   1. Selection range writeback — a `selection` target carries an explicit
 *      `[from,to)` inside a block; invoke → stream → accept replaces ONLY those
 *      bytes (the surrounding block + document are byte-for-byte untouched), and
 *      it rides the transaction hub (History + exact undo).
 *   2. Stale re-run — after an edit elsewhere drifts the base revision the
 *      candidate goes stale; `rerunStale` re-invokes on the anchor block against
 *      the CURRENT source (inheriting the instruction), and fails closed
 *      (returns null) when the anchor block no longer resolves.
 */

import { POLISH_CAPABILITY_ID, ComposerDocumentSession } from '@/service/composer';
import { FakeVault, openSession, makeHub, makeChecker, blockOfKind } from './helpers/composer-fakes';
import { FakeComposerExecutor, makeCapabilityRuntime, nextRunEvent } from './helpers/capability-fakes';
import type { ComposerResultEnvelope } from '@/core/composer';
import type { ComposerTextPatchPayload } from '@/core/schemas/composer';

const { check, done } = makeChecker();

const SOURCE = '# Note\n\nThis paragraf has speling issues here.\n\nUntouched trailing paragraph.\n';

function setup() {
	const vault = new FakeVault();
	const session = openSession(vault, 'note.md', SOURCE);
	const hub = makeHub(vault, session);
	const executor = new FakeComposerExecutor();
	const runtime = makeCapabilityRuntime(session, hub, executor);
	return { vault, session, hub, executor, runtime };
}

async function testSelectionRangeWriteback(): Promise<void> {
	const { vault, session, hub, executor, runtime } = setup();
	const para = blockOfKind(session, 'paragraph');
	const source = session.snapshot.sourceText;
	const word = 'paragraf';
	const from = source.indexOf(word);
	const to = from + word.length;

	const snapshot = runtime.assembleSnapshot({ kind: 'selection', blockId: para.blockId, from, to }, word);
	check('sel: target is a selection', snapshot.target.kind === 'selection');
	check('sel: targetSource is the selected slice only', snapshot.targetSource === word, snapshot.targetSource);
	check('sel: scope resolves to selection (selectionText present)', snapshot.selectionText === word);

	const action = runtime.actionsFor(snapshot, 'selection-toolbar').find((a) => a.capabilityId === POLISH_CAPABILITY_ID);
	check('sel: polish projects on the selection toolbar', !!action && !action.disabledReason);

	executor.queue({ chunks: ['paragraph'] });
	const ready = nextRunEvent(runtime, 'variant-ready');
	runtime.invoke(POLISH_CAPABILITY_ID, snapshot);
	await ready;

	const candidate = hub.projection().candidates[0]!;
	check('sel: candidate anchored to the block', candidate.anchorBlockId === para.blockId);
	check('sel: executor got scope=selection', executor.requests[0]?.variables.scope === 'selection');
	const envelope = candidate.proposedChange.result as ComposerResultEnvelope;
	check('sel: payload is the replacement', (envelope.payload as ComposerTextPatchPayload).replacementText === 'paragraph');
	check('sel: nothing written while pending', vault.read('note.md') === SOURCE);

	await runtime.accept(candidate.candidateId);
	const after = vault.read('note.md');
	const expected = source.slice(0, from) + 'paragraph' + source.slice(to);
	check('sel: only the selected bytes were replaced', after === expected, after);
	check('sel: the rest of the block is untouched (speling remains)', after.includes('speling issues here.'));
	check('sel: surrounding blocks untouched', after.includes('Untouched trailing paragraph.') && after.startsWith('# Note'));

	check('sel: one History entry', hub.projection().history.length === 1);
	const undone = await hub.undo();
	check('sel: undo restores exact bytes', undone && vault.read('note.md') === SOURCE);
}

async function testStaleRerun(): Promise<void> {
	const { vault, session, hub, executor, runtime } = setup();
	const para = blockOfKind(session, 'paragraph');
	const snapshot = runtime.assembleSnapshot({ kind: 'block', blockId: para.blockId });

	executor.queue({ chunks: ['Polished v1.'] });
	let ready = nextRunEvent(runtime, 'variant-ready');
	runtime.invoke(POLISH_CAPABILITY_ID, snapshot, { instruction: 'tighten it' });
	await ready;
	const staleId = hub.projection().candidates[0]!.candidateId;

	// Commit an edit elsewhere → the pending candidate goes stale.
	const trailing = session.snapshot.blocks[session.snapshot.blocks.length - 1]!;
	await hub.commit({
		origin: 'direct',
		label: 'edit trailing',
		operations: [{ kind: 'replaceRange', from: trailing.source.from, to: trailing.source.to, text: 'Edited trailing.' }],
	});
	check('rerun: candidate is stale after the drift', hub.projection().candidates[0]?.status === 'stale');

	// Re-run against the current source: old candidate discarded, fresh one runs.
	executor.queue({ chunks: ['Polished after rerun.'] });
	ready = nextRunEvent(runtime, 'variant-ready');
	const handle = runtime.rerunStale(staleId);
	check('rerun: rerunStale returns a handle when the anchor resolves', handle !== null);
	await ready;

	check('rerun: stale candidate was discarded', hub.projection().candidates.find((c) => c.candidateId === staleId) === undefined);
	const fresh = hub.projection().candidates.find((c) => c.status === 'ready');
	check('rerun: a fresh ready candidate exists on the block', !!fresh && fresh.anchorBlockId === para.blockId);
	check('rerun: instruction inherited into the re-run', executor.requests[1]?.variables.instruction === 'tighten it');

	await runtime.accept(fresh!.candidateId);
	check('rerun: accepted the re-run output', vault.read('note.md').includes('Polished after rerun.'));

	// Fail-closed: a stale candidate whose anchor block no longer resolves.
	const { session: s2, hub: hub2, executor: ex2, runtime: rt2 } = setup();
	const p2 = blockOfKind(s2, 'paragraph');
	ex2.queue({ chunks: ['v1'] });
	const r2 = nextRunEvent(rt2, 'variant-ready');
	rt2.invoke(POLISH_CAPABILITY_ID, rt2.assembleSnapshot({ kind: 'block', blockId: p2.blockId }));
	await r2;
	const cid2 = hub2.projection().candidates[0]!.candidateId;
	// Adopt a document with NO paragraph: the anchor can no longer map anywhere →
	// candidate stale with an unresolvable anchor block.
	const foreign = ComposerDocumentSession.fromSource('note.md', '# Only headings now\n\n## Another heading\n').snapshot;
	hub2.adoptExternalSnapshot(foreign);
	check('rerun: candidate stale after foreign reparse', hub2.projection().candidates[0]?.status === 'stale');
	check('rerun: rerunStale fails closed (null) when the anchor is gone', rt2.rerunStale(cid2) === null);
}

async function main(): Promise<void> {
	await testSelectionRangeWriteback();
	await testStaleRerun();
	done('composer-selection-range-writeback');
}

void main();
