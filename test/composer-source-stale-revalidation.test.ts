/**
 * Peak Composer — source stale revalidation (WP2, CMP-TXN-03 / CMP-REV).
 *
 * Asserts the guards that stop the Composer from writing over a moved target:
 *   - external modification is detected via the revision service;
 *   - a commit against a session whose file changed out-of-band is rejected;
 *   - a pending candidate whose base revision has moved goes `stale` and can no
 *     longer be accepted (it must be re-run / rebased, never silently applied);
 *   - the inter-block separator gap is protected: a patch that would absorb the
 *     gap (extending past a block's `to`) is refused, nothing persisted.
 */

import { ComposerConflictError } from '@/core/composer';
import { ComposerSourceRevisionService, parseComposerDocument } from '@/service/composer';
import { FakeVault, openSession, makeHub, makeChecker } from './helpers/composer-fakes';

const { check, done } = makeChecker();

function testExternalDetection(): void {
	const svc = new ComposerSourceRevisionService();
	const snap = parseComposerDocument('hello\n', { filePath: 'x.md' });
	check('external: unchanged text is not modified', !svc.isExternallyModified(snap, 'hello\n'));
	check('external: changed text is modified', svc.isExternallyModified(snap, 'hello!\n'));

	// anchor revalidation: valid vs drifted vs missing.
	const block = snap.blocks[0];
	check('anchor: valid when bytes match', svc.revalidateAnchor(snap, block.blockId, 'hello\n') === 'valid');
	check('anchor: drifted when region changed', svc.revalidateAnchor(snap, block.blockId, 'HELLO\n') === 'drifted');
	check('anchor: missing when file shrank', svc.revalidateAnchor(snap, block.blockId, 'hi') === 'missing');
}

async function testCommitRejectedAfterExternalEdit(): Promise<void> {
	const vault = new FakeVault();
	const src = 'para one\n';
	const session = openSession(vault, 's.md', src);
	const hub = makeHub(vault, session);
	const block = session.snapshot.blocks[0];

	vault.external('s.md', 'para one changed elsewhere\n');
	let threw: ComposerConflictError | null = null;
	try {
		await hub.commit({
			origin: 'direct',
			label: 'late edit',
			operations: [{ kind: 'replaceRange', from: block.source.from, to: block.source.to, text: 'x' }],
			target: { kind: 'block', blockId: block.blockId },
		});
	} catch (e) {
		threw = e as ComposerConflictError;
	}
	check('stale-commit: rejected with revision-mismatch', threw?.reason === 'revision-mismatch', threw?.reason);
	check('stale-commit: nothing written', vault.writeCount === 0);
}

async function testCandidateGoesStale(): Promise<void> {
	const vault = new FakeVault();
	const src = '# H\n\nalpha\n\nbeta\n';
	const session = openSession(vault, 'd.md', src);
	const hub = makeHub(vault, session);
	const [, alpha, beta] = session.snapshot.blocks; // heading, alpha, beta

	// Pending candidate on `beta`.
	const candidate = hub.createCandidate({
		target: { kind: 'block', blockId: beta.blockId },
		proposedChange: {
			operations: [{ kind: 'replaceRange', from: beta.source.from, to: beta.source.to, text: 'BETA' }],
			summary: 'shout beta',
		},
	});
	check('candidate: starts ready', hub.projection().candidates[0]?.status === 'ready');

	// A committed edit on `alpha` bumps the document revision.
	await hub.commit({
		origin: 'direct',
		label: 'edit alpha',
		operations: [{ kind: 'replaceRange', from: alpha.source.from, to: alpha.source.to, text: 'ALPHA' }],
		target: { kind: 'block', blockId: alpha.blockId },
	});

	const after = hub.projection().candidates.find((c) => c.candidateId === candidate.candidateId);
	check('candidate: revision move marks it stale', after?.status === 'stale', after?.status);

	// Accepting a stale candidate is refused, and nothing is written for it.
	const writesBefore = vault.writeCount;
	let threw: ComposerConflictError | null = null;
	try {
		await hub.acceptCandidate(candidate.candidateId);
	} catch (e) {
		threw = e as ComposerConflictError;
	}
	check('candidate: stale accept refused', threw?.reason === 'stale-candidate', threw?.reason);
	check('candidate: stale accept wrote nothing', vault.writeCount === writesBefore);
}

async function testSeparatorGapProtection(): Promise<void> {
	const vault = new FakeVault();
	const src = 'top paragraph\n\nbottom paragraph\n';
	const session = openSession(vault, 'g.md', src);
	const hub = makeHub(vault, session);
	const top = session.snapshot.blocks[0];
	const bottom = session.snapshot.blocks[1];

	// Patch reaches from `top` into the gap + `bottom`, eating the blank line.
	let threw: ComposerConflictError | null = null;
	try {
		await hub.commit({
			origin: 'ai',
			label: 'greedy patch',
			operations: [{ kind: 'replaceRange', from: top.source.from, to: bottom.source.to, text: 'merged paragraph' }],
			target: { kind: 'block', blockId: top.blockId },
		});
	} catch (e) {
		threw = e as ComposerConflictError;
	}
	check('gap: greedy patch refused', threw instanceof ComposerConflictError);
	check('gap: reason target-missing-after-reparse', threw?.reason === 'target-missing-after-reparse', threw?.reason);
	check('gap: separator preserved (nothing written)', vault.read('g.md') === src && vault.writeCount === 0);
}

async function main(): Promise<void> {
	testExternalDetection();
	await testCommitRejectedAfterExternalEdit();
	await testCandidateGoesStale();
	await testSeparatorGapProtection();
	done('composer-source-stale-revalidation');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
