import { intensityTier } from '../src/ui/view/quick-search/components/result-tree/intensityTier';
import type { SearchResultItem } from '../src/core/search/searchTypes';

function assert(condition: boolean, msg: string): void {
	if (!condition) { console.error('FAIL:', msg); process.exit(1); }
}

function makeItem(pct: number | null | undefined): SearchResultItem {
	return {
		id: 'x', type: 'markdown' as SearchResultItem['type'], title: 'x', path: 'x', lastModified: 0,
		displayScorePercent: pct,
	};
}

// Thresholds: high >= 0.66, mid >= 0.33
assert(intensityTier(makeItem(100)) === 'high', '100% → high');
assert(intensityTier(makeItem(70)) === 'high', '70% → high');
assert(intensityTier(makeItem(66)) === 'high', '66% (boundary) → high');
assert(intensityTier(makeItem(65)) === 'mid', '65% → mid');
assert(intensityTier(makeItem(50)) === 'mid', '50% → mid');
assert(intensityTier(makeItem(33)) === 'mid', '33% (boundary) → mid');
assert(intensityTier(makeItem(32)) === 'low', '32% → low');
assert(intensityTier(makeItem(1)) === 'low', '1% → low');
assert(intensityTier(makeItem(0)) === 'low', '0% → low');
assert(intensityTier(makeItem(null)) === 'low', 'null → low');
assert(intensityTier(makeItem(undefined)) === 'low', 'undefined → low');

// All-same-score set (e.g. after normalize with three 100s): every row is high.
{
	const items = [makeItem(100), makeItem(100), makeItem(100)];
	for (const it of items) assert(intensityTier(it) === 'high', 'all-100 → all high');
}

console.log('OK result-tree-intensity');
