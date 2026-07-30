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
const sidecarConfig = readFileSync('src/ui/view/composer/sidecar/sidecarConfig.ts', 'utf8');
assert.ok(source.includes('projectComposerHistoryActivities'), 'History projects one mixed activity timeline');
assert.ok(source.includes('HistoryFilterBar'), 'the mixed timeline can be filtered without switching tabs');
assert.ok(
	source.includes('pk-history-filter-primary')
		&& source.includes('HistoryFacetGroup')
		&& source.includes('HistoryAppliedFilters'),
	'the history filter uses visible source shortcuts, one advanced facet surface, and removable chips',
);
assert.equal(
	source.includes('<select'),
	false,
	'the advanced history filter does not delegate its information architecture to nested native selects',
);
assert.ok(
	sidecarConfig.includes("historyFilterSource: '记录类型'")
		&& sidecarConfig.includes("historyFilterAction: '改动方式'")
		&& sidecarConfig.includes("historyFilterStatus: '结果状态'")
		&& sidecarConfig.includes("historyFilterTarget: '作用范围'"),
	'filter groups explain the user-facing meaning instead of exposing storage dimensions',
);
assert.equal(
	source.includes('pk-history-kind-tabs'),
	false,
	'generation and document history are not split into competing tabs',
);
assert.equal(
	source.includes('disabled={!blockId}'),
	false,
	'a transaction row remains readable and previewable when its document anchor is unavailable',
);
assert.ok(source.includes('HistoryDetailModal'), 'rows open one shared wide history detail');
const rowSource = source.slice(
	source.indexOf('function HistoryActivityRow'),
	source.indexOf('function HistoryFilterBar'),
);
assert.equal(
	rowSource.includes('activitySourceLabel('),
	false,
	'the row icon already conveys source, so a repeated right-side source label cannot cover its summary',
);
assert.ok(
	rowSource.includes('pk-history-time') && rowSource.includes('pk-history-chevron'),
	'the row reserves a compact trailing column for time and disclosure only',
);
assert.equal(
	detailSource.includes('strings.generationHistoryRestore')
		|| detailSource.includes('strings.historyRollbackAction'),
	false,
	'history detail is a read-only audit surface and exposes no stale restore or rollback action',
);
assert.ok(detailSource.includes('diffWords'), 'rewrite history renders the saved word-level diff');
assert.ok(detailSource.includes('data-side="diff"'), 'rewrite history uses one focused diff surface');
assert.ok(detailSource.includes('historyOriginal'), 'detail preserves the original source');
assert.ok(detailSource.includes('historyGenerated'), 'detail shows the generated or committed result');
assert.equal(
	detailSource.includes('strings.historyCurrentDocument'),
	false,
	'current mutable document text does not displace the saved historical diff',
);
assert.ok(
	composerRootSource.includes('pk-history-locate-flash')
		&& composerRootSource.includes('locateAndFlashComposerBlock'),
	'locating a historical target scrolls to it and retriggers a visible flash',
);
assert.ok(
	detailSource.includes('if (onLocate(current.blockId!) !== false) onClose()'),
	'the modal closes only after the current target was actually located',
);
assert.ok(
	sidecarStyles.includes("[data-kind='insert']")
		&& sidecarStyles.includes("[data-kind='structural']"),
	'additive and structural operations use an explicit vertical comparison shape',
);
assert.ok(
	sidecarStyles.includes('grid-template-columns: 27px minmax(0, 1fr) auto 12px')
		&& sidecarStyles.includes('.pk-history-filter-option[data-selected]'),
	'the production CSS protects row text width and visibly marks selected advanced facets',
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
