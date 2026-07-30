import assert from 'assert';
import { readFileSync } from 'fs';
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

const source = readFileSync('src/ui/view/composer/sidecar/HistoryView.tsx', 'utf8');
const blockHistorySource = readFileSync('src/ui/view/composer/chrome/BlockHistoryPanel.tsx', 'utf8');
assert.ok(source.includes('generationHistoryTitle'), 'History defaults to a durable generation timeline');
assert.ok(source.includes('documentHistoryTitle'), 'Document transactions remain available as a separate view');
assert.ok(source.includes('groupComposerGenerationRuns'), 'generation attempts are grouped without losing variants');
assert.ok(source.includes('onRestoreGeneration'), 'not-adopted output can be reopened from History');
assert.equal(
	source.includes('disabled={!blockId}'),
	false,
	'a transaction row remains readable and previewable when its document anchor is unavailable',
);
assert.ok(source.includes('pk-history-detail'), 'History exposes an explicit transaction preview');
assert.ok(source.includes('historyRollbackAction'), 'rollback remains available from the transaction detail');
assert.ok(
	blockHistorySource.includes('groupComposerGenerationRuns'),
	'the block History affordance reads generation attempts rather than accepted writes only',
);
assert.ok(
	blockHistorySource.includes('restoreGenerationReview'),
	'a not-adopted block generation can return to the review canvas',
);

console.log('composer-history-view-presentation: passed');
