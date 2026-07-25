/**
 * Contract tests for the shared controlled Result Browser (CMP-RB-01).
 *
 * Source of truth: docs/superpowers/plans/2026-07-21-vault-result-browser-shared-component.md
 * (§"Shared contracts" 1–4, §A "Contract and tests"). These assert the
 * query-agnostic, projection-stable behavior of the *controlled* browser as
 * pure logic — no store, no query, no React render. A static 37-item docs
 * fixture is deliberately NOT used; ids are derived from production data
 * shapes (`SearchResultItem`, `ResultSubgraphOutput`, `buildResultTree`).
 */
import type { SearchResultItem } from '../src/core/search/searchTypes';
import type { ResultSubgraphOutput } from '../src/service/search/graph/resultSubgraph';
import {
	stableItemId,
	listItemIds,
	treeFileIds,
	graphResultIds,
	rootItemId,
	listTreeIdsMatch,
	graphIsSubsetOfList,
	graphIncludesRootAndSelected,
	applyProjectionChange,
	projectionChangeTriggersSearch,
	projectionChangeRebuildsSnapshot,
	type ResultBrowserProjectionState,
	type ResultBrowserProjectionChange,
} from '../src/ui/component/result-browser/model';

let failures = 0;
function assert(cond: boolean, msg: string): void {
	if (!cond) { console.error('FAIL:', msg); failures += 1; }
}

// ---------------------------------------------------------------------------
// Fixtures — production `SearchResultItem` shapes with realistic id layouts.
// ---------------------------------------------------------------------------

function item(partial: Partial<SearchResultItem> & { path: string }): SearchResultItem {
	return {
		id: partial.id ?? partial.path,
		type: 'markdown' as SearchResultItem['type'],
		title: partial.title ?? partial.path.split('/').pop()!,
		lastModified: 0,
		...partial,
	};
}

const results: SearchResultItem[] = [
	item({ path: 'Research/Alpha.md', docId: 'node-alpha', displayScorePercent: 100 }),
	item({ path: 'Research/Beta.md', docId: 'node-beta', displayScorePercent: 80 }),
	item({ path: 'Research/deep/Gamma.md', docId: 'node-gamma', displayScorePercent: 60 }),
	item({ path: 'Notes/Delta.md', id: 'raw-delta', displayScorePercent: 40 }), // no docId → path is stable id
	item({ path: 'Notes/Epsilon.md', docId: '', id: 'raw-epsilon' }),           // empty docId → falls through to path
];

// ---------------------------------------------------------------------------
// Contract #1 — selection normalizes to docId ?? path ?? id in every view.
// ---------------------------------------------------------------------------

assert(stableItemId(results[0]) === 'node-alpha', '#1 docId wins when present');
assert(stableItemId(results[3]) === 'Notes/Delta.md', '#1 path used when docId absent');
assert(stableItemId(results[4]) === 'Notes/Epsilon.md', '#1 empty docId skipped, path used');
assert(stableItemId({ docId: undefined, path: '', id: 'only-id' } as SearchResultItem) === 'only-id', '#1 id is last resort');

// ---------------------------------------------------------------------------
// Contract #3a — List leaf ids equal Tree file ids (same set, any order).
// ---------------------------------------------------------------------------

const list = listItemIds(results);
const tree = treeFileIds(results);
assert(list.length === 5, '#3 list projects all five items');
assert(tree.length === 5, '#3 tree projects all five files');
assert(listTreeIdsMatch(results), '#3 list and tree project the same id set');
// order differs (list = score order, tree = folder order) but sets equal
assert(JSON.stringify(list) !== JSON.stringify(tree) || list.length <= 1, '#3 list order != tree order (folder-sorted)');

// Root is the top-ranked (first) item.
assert(rootItemId(results) === 'node-alpha', '#3 root is the first/top item');
assert(rootItemId([]) === null, '#3 empty set has no root');

// ---------------------------------------------------------------------------
// Contract #3b — Graph ids are a subset of List, incl. root + selected.
// ---------------------------------------------------------------------------

function graphOf(ids: string[], opts: { overflow?: number } = {}): ResultSubgraphOutput {
	return {
		resultNodes: ids.map((id) => {
			const src = results.find((r) => stableItemId(r) === id);
			return { id, path: src?.path ?? id, title: src?.title ?? id, score: 0, communityId: null, folder: '' };
		}),
		hubAnchors: [],
		edges: [],
		isolatedDocIds: ids,
		overflowCount: opts.overflow ?? 0,
	};
}

// Full graph (all ids) — subset holds, root + selection included.
const fullGraph = graphOf(list);
assert(graphIsSubsetOfList(results, fullGraph), '#3 full graph is a subset of list');
assert(graphIncludesRootAndSelected(results, fullGraph, 'node-beta'), '#3 full graph includes root + selection');

// Capped graph that keeps root + selection but drops others — still valid.
const cappedGraph = graphOf(['node-alpha', 'node-beta'], { overflow: 3 });
assert(graphIsSubsetOfList(results, cappedGraph), '#3 capped graph stays a subset of list');
assert(graphIncludesRootAndSelected(results, cappedGraph, 'node-beta'), '#3 capped graph pins root + selection');

// Capped graph that drops the root is INVALID.
const graphMissingRoot = graphOf(['node-beta', 'node-gamma']);
assert(!graphIncludesRootAndSelected(results, graphMissingRoot, null), '#3 graph missing root violates the invariant');

// Capped graph that drops the active selection is INVALID.
assert(!graphIncludesRootAndSelected(results, graphOf(['node-alpha']), 'node-gamma'), '#3 graph missing selection violates the invariant');

// A graph node not in the list breaks the subset invariant.
const graphExtraNode = graphOf([]);
graphExtraNode.resultNodes.push({ id: 'ghost', path: 'ghost.md', title: 'ghost', score: 0, communityId: null, folder: '' });
assert(!graphIsSubsetOfList(results, graphExtraNode), '#3 graph node absent from list breaks subset');

// Null / empty graph is vacuously fine.
assert(graphResultIds(null).length === 0, '#3 null subgraph has no ids');
assert(graphIncludesRootAndSelected(results, null, null), '#3 null subgraph is vacuously valid (still computing)');

// ---------------------------------------------------------------------------
// Contract #4 — no projection change triggers search or snapshot rebuild.
// ---------------------------------------------------------------------------

const baseState: ResultBrowserProjectionState = {
	view: 'list',
	density: 'detailed',
	graphPreset: 'constellation',
	graphShowSemantic: false,
	selectedId: null,
	inspectorOpen: false,
	collapsedFolders: [],
	cursorId: null,
};

const everyChange: ResultBrowserProjectionChange[] = [
	{ kind: 'view', view: 'graph' },
	{ kind: 'view', view: 'tree' },
	{ kind: 'density', density: 'compact' },
	{ kind: 'graphPreset', preset: 'orbit' },
	{ kind: 'graphPreset', preset: 'folder' },
	{ kind: 'graphSemantic', on: true },
	{ kind: 'select', id: 'node-beta' },
	{ kind: 'cursor', id: 'Notes/Delta.md' },
	{ kind: 'inspector', open: true },
	{ kind: 'toggleCollapse', folderPath: 'Research' },
];

for (const change of everyChange) {
	assert(projectionChangeTriggersSearch(change) === false, `#4 ${change.kind} never triggers search`);
	assert(projectionChangeRebuildsSnapshot(change) === false, `#4 ${change.kind} never rebuilds snapshot`);
	const out = applyProjectionChange(baseState, change);
	assert(out.triggersSearch === false && out.rebuildSnapshot === false, `#4 apply(${change.kind}) is side-effect free`);
}

// State transitions are correct + immutable (base state untouched).
assert(applyProjectionChange(baseState, { kind: 'view', view: 'graph' }).state.view === 'graph', '#4 view change applies');
assert(baseState.view === 'list', '#4 apply does not mutate the input state');
assert(applyProjectionChange(baseState, { kind: 'graphPreset', preset: 'orbit' }).state.graphShowSemantic === true, '#4 orbit preset enables semantic (store parity)');
assert(applyProjectionChange(baseState, { kind: 'graphPreset', preset: 'folder' }).state.graphShowSemantic === false, '#4 non-orbit preset leaves semantic off');
{
	const collapsed = applyProjectionChange(baseState, { kind: 'toggleCollapse', folderPath: 'Research' }).state;
	assert(collapsed.collapsedFolders.includes('Research'), '#4 toggleCollapse adds folder');
	const reExpanded = applyProjectionChange(collapsed, { kind: 'toggleCollapse', folderPath: 'Research' }).state;
	assert(!reExpanded.collapsedFolders.includes('Research'), '#4 toggleCollapse removes folder on second toggle');
}

if (failures > 0) {
	console.error(`\n${failures} contract assertion(s) failed`);
	process.exit(1);
}
console.log('OK result-browser-contract');
