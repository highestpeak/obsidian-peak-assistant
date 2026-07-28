import assert from 'assert';
import type { ComposerHistoryItem } from '@/core/composer';
import { countTransactions, groupHistoryByDay } from '@/ui/view/composer/sidecar/HistoryView';

function item(historyId: string, timestamp: number, children?: ComposerHistoryItem[]): ComposerHistoryItem {
	return {
		historyId,
		transactionId: `txn-${historyId}`,
		origin: 'direct',
		label: historyId,
		timestamp,
		stats: { added: 1, removed: 0 },
		children,
	};
}

const now = new Date(2026, 6, 28, 16, 0);
const yesterday = new Date(2026, 6, 27, 16, 0).getTime();
const first = item('first', new Date(2026, 6, 28, 12, 0).getTime());
const second = item('second', new Date(2026, 6, 28, 13, 0).getTime(), [
	item('second-a', new Date(2026, 6, 28, 12, 30).getTime()),
	item('second-b', new Date(2026, 6, 28, 13, 0).getTime()),
]);
const older = item('older', yesterday);

const groups = groupHistoryByDay([older, first, second], { historyToday: '今天' }, now);
assert.equal(groups.length, 2, 'history groups entries by local day');
assert.equal(groups[0].label, '今天', 'the current day uses the configured Today label');
assert.deepEqual(groups[0].items.map((entry) => entry.historyId), ['second', 'first'], 'newest entries render first within a day');
assert.equal(countTransactions([older, first, second]), 4, 'batch parents count their independently locatable child transactions');

console.log('composer-history-view-presentation: passed');
