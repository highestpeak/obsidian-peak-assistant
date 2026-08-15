import { ComposerConflictError } from '@/core/composer';
import { FakeVault, makeChecker, makeHub, openSession } from './helpers/composer-fakes';

const { check, done } = makeChecker();

async function acceptsOneRevisionAsOneTransaction(): Promise<void> {
	const vault = new FakeVault();
	const source = 'Alpha.\n\nBeta.\n\nGamma.\n';
	const session = openSession(vault, 'group.md', source);
	const hub = makeHub(vault, session);
	const candidates = session.snapshot.blocks.map((block, index) => hub.createCandidate({
		target: { kind: 'block', blockId: block.blockId },
		proposedChange: {
			operations: [{
				kind: 'replaceRange' as const,
				from: block.source.from,
				to: block.source.to,
				text: `Edited ${index}.`,
			}],
		},
	}));
	let projections = 0;
	const off = hub.subscribe(() => { projections += 1; });
	const txn = await hub.acceptCandidateGroup(
		candidates.map((candidate) => candidate.candidateId),
		{ label: 'Apply document suggestions' },
	);
	off();
	check('group writes source once', vault.writeCount === 1, String(vault.writeCount));
	check('group publishes one post-subscribe projection', projections === 2, String(projections));
	check('group records one History item', hub.projection().history.length === 1);
	check('group creates one Undo unit', hub.projection().undo.undoDepth === 1);
	check('transaction contains all operations', txn.operations.length === 3);
	check(
		'all group candidates are accepted',
		candidates.every((candidate) =>
			hub.projection().candidates.find((item) => item.candidateId === candidate.candidateId)?.status === 'accepted'),
	);
	await hub.undo();
	check('one Undo restores exact source', vault.read('group.md') === source);
}

async function rejectsOverlapWithoutMutation(): Promise<void> {
	const vault = new FakeVault();
	const source = 'Overlapping source.\n';
	const session = openSession(vault, 'overlap.md', source);
	const hub = makeHub(vault, session);
	const block = session.snapshot.blocks[0];
	const first = hub.createCandidate({
		target: { kind: 'block', blockId: block.blockId },
		proposedChange: { operations: [{ kind: 'replaceRange', from: 0, to: 10, text: 'First' }] },
	});
	const second = hub.createCandidate({
		target: { kind: 'block', blockId: block.blockId },
		proposedChange: { operations: [{ kind: 'replaceRange', from: 5, to: 15, text: 'Second' }] },
	});
	let conflict: ComposerConflictError | null = null;
	try {
		await hub.acceptCandidateGroup([first.candidateId, second.candidateId], { label: 'Unsafe' });
	} catch (error) {
		conflict = error as ComposerConflictError;
	}
	check('overlap has typed group conflict', conflict?.reason === 'candidate-group-conflict');
	check('overlap performs no write', vault.writeCount === 0);
	check('overlap records no History', hub.projection().history.length === 0);
	check(
		'overlap leaves candidates ready',
		[first, second].every((candidate) =>
			hub.projection().candidates.find((item) => item.candidateId === candidate.candidateId)?.status === 'ready'),
	);
}

async function acceptsFiveHundredCandidatesWithoutFiveHundredCommits(): Promise<void> {
	const vault = new FakeVault();
	const source = Array.from({ length: 500 }, (_, index) => `Block ${index}.`).join('\n\n') + '\n';
	const session = openSession(vault, 'bulk.md', source);
	const hub = makeHub(vault, session);
	const candidates = session.snapshot.blocks.map((block, index) => hub.createCandidate({
		target: { kind: 'block', blockId: block.blockId },
		proposedChange: {
			operations: [{
				kind: 'replaceRange' as const,
				from: block.source.from,
				to: block.source.to,
				text: `Revised ${index}.`,
			}],
		},
	}));
	await hub.acceptCandidateGroup(
		candidates.map((candidate) => candidate.candidateId),
		{ label: 'Apply bulk suggestions' },
	);
	check('500 candidates still perform one write', vault.writeCount === 1, String(vault.writeCount));
	check('500 candidates still produce one History item', hub.projection().history.length === 1);
	check('500 candidates still produce one Undo unit', hub.projection().undo.undoDepth === 1);
}

async function main(): Promise<void> {
	await acceptsOneRevisionAsOneTransaction();
	await rejectsOverlapWithoutMutation();
	await acceptsFiveHundredCandidatesWithoutFiveHundredCommits();
	done('composer-candidate-group-atomicity');
}

void main().catch((error) => {
	console.error(error);
	process.exit(1);
});
