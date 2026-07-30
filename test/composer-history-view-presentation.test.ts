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
const detailSource = readFileSync('src/ui/view/composer/sidecar/HistoryDetailModal.tsx', 'utf8');
const blockHistorySource = readFileSync('src/ui/view/composer/chrome/BlockHistoryPanel.tsx', 'utf8');
const composerRootSource = readFileSync('src/ui/view/composer/ComposerRoot.tsx', 'utf8');
const sidecarStyles = readFileSync('src/styles/composer-sidecar.css', 'utf8');
assert.ok(source.includes('projectComposerHistoryActivities'), 'History projects one mixed activity timeline');
assert.ok(source.includes('HistoryFilterBar'), 'the mixed timeline can be filtered without switching tabs');
assert.equal(
	source.includes('pk-history-kind-tabs'),
	false,
	'generation and document history are not split into competing tabs',
);
assert.ok(source.includes('onRestoreGeneration'), 'not-adopted output can be reopened from History');
assert.equal(
	source.includes('disabled={!blockId}'),
	false,
	'a transaction row remains readable and previewable when its document anchor is unavailable',
);
assert.ok(source.includes('HistoryDetailModal'), 'rows open one shared wide history detail');
assert.ok(detailSource.includes('historyRollbackAction'), 'rollback remains available from the transaction detail');
assert.ok(detailSource.includes('historyOriginal'), 'detail preserves the original source');
assert.ok(detailSource.includes('historyGenerated'), 'detail shows the generated or committed result');
assert.ok(detailSource.includes('historyCurrentDocument'), 'detail resolves the current document state separately');
assert.ok(
	sidecarStyles.includes("[data-kind='insert']")
		&& sidecarStyles.includes("[data-kind='structural']"),
	'additive and structural operations use an explicit vertical comparison shape',
);
assert.ok(
	blockHistorySource.includes('projectComposerHistoryActivities')
		&& blockHistorySource.includes('activityMatchesBlock'),
	'the block History affordance is a filtered projection of the same mixed ledger',
);
assert.ok(
	blockHistorySource.includes('blockActivities.slice(0, 3)'),
	'the compact block surface is capped at three recent activities',
);
assert.ok(
	blockHistorySource.includes('onOpenActivity(activity)')
		&& composerRootSource.includes('<HistoryDetailModal'),
	'block history delegates the shared detail modal to the stable Composer document owner',
);
assert.equal(
	blockHistorySource.includes('<HistoryDetailModal'),
	false,
	'the transient block panel does not own a modal that would unmount on outside-pointer handling',
);
assert.ok(blockHistorySource.includes('historyViewAll'), 'block history links to the full mixed timeline');

console.log('composer-history-view-presentation: passed');
