import { FakeVault, makeChecker, makeHub, openSession } from './helpers/composer-fakes';

async function main(): Promise<void> {
	const { check, done } = makeChecker();
	const vault = new FakeVault();
	const session = openSession(vault, 'note.md', 'Alpha paragraph');
	const hub = makeHub(vault, session);

	await hub.commit({
		origin: 'direct',
		label: 'Replace paragraph',
		operations: [{ kind: 'replaceRange', from: 0, to: 5, text: 'Beta' }],
		target: { kind: 'block', blockId: session.snapshot.blocks[0].blockId },
	});

	const historyItem = hub.projection().history[0];
	const preview = hub.historyPreview(historyItem.historyId);
	check('preview is available for a committed transaction', preview !== null);
	check('preview uses the inverse operation as before text', preview?.beforeText === 'Alpha');
	check('preview uses the forward operation as after text', preview?.afterText === 'Beta');
	check('preview preserves the real transaction identity', preview?.item.transactionId === historyItem.transactionId);
	done('composer-history-preview');
}

void main();
