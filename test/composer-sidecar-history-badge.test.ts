import assert from 'assert';
import { countHistoryTransactions } from '@/ui/view/composer/sidecar/IntelligenceSidecar';
import type { ComposerHistoryItem } from '@/core/composer';

let checks = 0;

function check(name: string, run: () => void): void {
	checks += 1;
	try {
		run();
	} catch (error) {
		console.error(`  XX ${name}`);
		throw error;
	}
}

function item(historyId: string, children?: ComposerHistoryItem[]): ComposerHistoryItem {
	return {
		historyId,
		transactionId: `txn-${historyId}`,
		origin: 'direct',
		label: historyId,
		timestamp: 0,
		stats: { added: 0, removed: 0 },
		children,
	};
}

check('History badge counts nested grouped transactions, not only top-level rows', () => {
	const grouped = item('group', [item('child-a'), item('child-b', [item('grandchild')])]);
	assert.equal(countHistoryTransactions([grouped, item('standalone')]), 5);
});

check('History badge handles an empty projection', () => {
	assert.equal(countHistoryTransactions([]), 0);
});

console.log(`composer-sidecar-history-badge: ${checks}/${checks} checks passed`);
