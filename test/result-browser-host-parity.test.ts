/**
 * Host-parity tests for the shared Result Browser host adapters (CMP-RB-03 /
 * CMP-RB-04). Covers BOTH hosts:
 *   - Quick Search: maps the `vaultSearchStore` shape onto the browser state,
 *     routes every projection change to a presentation-only setter, resolves the
 *     list open/new-tab policy exactly as the pre-extraction row did;
 *   - Composer (WP9): maps a FROZEN related-material snapshot onto the browser
 *     state, routes every projection change to a presentation-only reducer branch
 *     (never search / rebuild), filters the frozen snapshot locally, and resolves
 *     selection-after-revision + the keep-browser open disposition.
 * Pure logic — no React render, no live store singleton.
 */
import {
	mapStoreToProjectionState,
	mapProjectionChangeToStoreEffect,
	resolveListOpenNewTab,
	type QuickSearchProjectionSource,
} from '../src/ui/view/quick-search/QuickSearchResultBrowserAdapter';
import {
	applyComposerProjectionChange,
	initialComposerBrowserState,
	mapComposerStateToProjectionState,
	mapRelatedSnapshotToBrowserSnapshot,
	localFilterItems,
	resolveSelectionAfterRevision,
	resolveComposerOpenDisposition,
} from '../src/ui/view/composer/sidecar/ComposerResultBrowserAdapter';
import {
	applyProjectionChange,
	type ResultBrowserProjectionChange,
	type ResultBrowserProjectionState,
} from '../src/ui/component/result-browser/model';
import type { SearchResultItem } from '../src/core/search/searchTypes';
import type { ComposerRelatedMaterialSnapshot } from '../src/service/composer';
import type { ResultSubgraphOutput } from '../src/service/search/graph/resultSubgraph';

let failures = 0;
function assert(cond: boolean, msg: string): void {
	if (!cond) { console.error('FAIL:', msg); failures += 1; }
}

// ---------------------------------------------------------------------------
// store → projection state is a faithful, complete projection.
// ---------------------------------------------------------------------------

const storeShape: QuickSearchProjectionSource = {
	resultView: 'tree',
	resultDensity: 'compact',
	graphPreset: 'orbit',
	graphShowSemantic: true,
	inspectorOpen: true,
	treeCollapsedFolders: ['Research', 'Notes/sub'],
	treeCursor: 'Research/Alpha.md',
};

const projected = mapStoreToProjectionState(storeShape, 'node-alpha');
assert(projected.view === 'tree', 'store.resultView → view');
assert(projected.density === 'compact', 'store.resultDensity → density');
assert(projected.graphPreset === 'orbit', 'store.graphPreset → graphPreset');
assert(projected.graphShowSemantic === true, 'store.graphShowSemantic → graphShowSemantic');
assert(projected.inspectorOpen === true, 'store.inspectorOpen → inspectorOpen');
assert(projected.selectedId === 'node-alpha', 'explicit selectedId is projected');
assert(projected.cursorId === 'Research/Alpha.md', 'store.treeCursor → cursorId');
assert(projected.collapsedFolders.length === 2 && projected.collapsedFolders[0] === 'Research', 'store.treeCollapsedFolders → collapsedFolders');

// ---------------------------------------------------------------------------
// Every projection change maps to a presentation-only store setter.
// ---------------------------------------------------------------------------

const changes: ResultBrowserProjectionChange[] = [
	{ kind: 'view', view: 'graph' },
	{ kind: 'density', density: 'detailed' },
	{ kind: 'graphPreset', preset: 'folder' },
	{ kind: 'graphSemantic', on: false },
	{ kind: 'select', id: 'node-beta' },
	{ kind: 'cursor', id: 'Notes/Delta.md' },
	{ kind: 'inspector', open: false },
	{ kind: 'toggleCollapse', folderPath: 'Research' },
];

const PRESENTATION_ACTIONS = new Set([
	'setResultView', 'setResultDensity', 'setGraphPreset', 'setGraphShowSemantic',
	'setSelectedId', 'setTreeCursor', 'setInspectorOpen', 'toggleTreeFolderCollapsed',
]);

for (const change of changes) {
	const effect = mapProjectionChangeToStoreEffect(change);
	assert(PRESENTATION_ACTIONS.has(effect.action), `${change.kind} → presentation setter (${effect.action}), never a search`);
	// The model reducer confirms the same change is side-effect free.
	const out = applyProjectionChange(baseState(), change);
	assert(out.triggersSearch === false && out.rebuildSnapshot === false, `${change.kind} is search/rebuild free`);
}

// Spot-check the argument is threaded through.
{
	const eff = mapProjectionChangeToStoreEffect({ kind: 'view', view: 'graph' });
	assert(eff.action === 'setResultView' && 'view' in eff && eff.view === 'graph', 'view change carries its view arg');
	const eff2 = mapProjectionChangeToStoreEffect({ kind: 'toggleCollapse', folderPath: 'Docs' });
	assert(eff2.action === 'toggleTreeFolderCollapsed' && 'folderPath' in eff2 && eff2.folderPath === 'Docs', 'collapse change carries its folder arg');
}

// ---------------------------------------------------------------------------
// List open policy parity (pre-extraction rule table).
// ---------------------------------------------------------------------------

// Dedicated new-tab button always opens a new tab regardless of mode/modifier.
assert(resolveListOpenNewTab({ newTab: false, viaNewTabButton: true }, false) === true, 'new-tab button forces new tab (heading)');
assert(resolveListOpenNewTab({ newTab: false, viaNewTabButton: true }, true) === true, 'new-tab button forces new tab (all)');

// Non-heading mode (modeNewTab=true): body click always opens a new tab.
assert(resolveListOpenNewTab({ newTab: false }, true) === true, 'all-mode body click → new tab even without modifier');
assert(resolveListOpenNewTab({ newTab: true }, true) === true, 'all-mode body click with modifier → new tab');

// Heading mode (modeNewTab=false): body click opens in place (ignores modifier),
// mirroring the original `newTab ?? modifier` with a defined false default.
assert(resolveListOpenNewTab({ newTab: true }, false) === false, 'heading-mode body click → in place (mode default wins)');

// No mode default (undefined): fall back to the body-click modifier.
assert(resolveListOpenNewTab({ newTab: true }, undefined) === true, 'no mode default → modifier decides (true)');
assert(resolveListOpenNewTab({ newTab: false }, undefined) === false, 'no mode default → modifier decides (false)');

function baseState(): ResultBrowserProjectionState {
	return {
		view: 'list', density: 'detailed', graphPreset: 'constellation', graphShowSemantic: false,
		selectedId: null, inspectorOpen: false, collapsedFolders: [], cursorId: null,
	};
}

// ---------------------------------------------------------------------------
// Composer host (WP9): projection-only over a FROZEN snapshot (CMP-RB-03).
// ---------------------------------------------------------------------------

function item(id: string, title: string, path: string, score: number): SearchResultItem {
	return { id, type: 'note' as SearchResultItem['type'], title, path, lastModified: 0, finalScore: score };
}
const emptyGraph: ResultSubgraphOutput = {
	resultNodes: [], hubAnchors: [], edges: [], isolatedDocIds: [], overflowCount: 0,
};
const relatedSnapshot: ComposerRelatedMaterialSnapshot = {
	revision: 'rev-1',
	focus: { anchorId: 'block-7', rootNodeId: 'doc-root' },
	items: [item('a', 'Alpha Notes', 'Research/Alpha.md', 0.9), item('b', 'Beta Log', 'Notes/Beta.md', 0.5)],
	graph: emptyGraph,
	sourceIdByNodeId: { na: 'a', nb: 'b' },
	reasonBySourceId: { a: 'shared concept', b: 'linked' },
	weakNodeIds: [],
	weakEdgeKeys: [],
};

// The browser snapshot is derived ONCE from the frozen related snapshot.
{
	const bs = mapRelatedSnapshotToBrowserSnapshot(relatedSnapshot);
	assert(bs.items === relatedSnapshot.items, 'composer browser items are the frozen items (no copy)');
	assert(bs.subgraph === relatedSnapshot.graph, 'composer browser graph is the frozen graph');
}

// Every projection change is presentation-only — never search / rebuild.
{
	const composerChanges: ResultBrowserProjectionChange[] = [
		{ kind: 'view', view: 'graph' },
		{ kind: 'density', density: 'compact' },
		{ kind: 'graphPreset', preset: 'orbit' },
		{ kind: 'graphSemantic', on: true },
		{ kind: 'select', id: 'a' },
		{ kind: 'cursor', id: 'Research/Alpha.md' },
		{ kind: 'inspector', open: true },
		{ kind: 'toggleCollapse', folderPath: 'Research' },
	];
	for (const change of composerChanges) {
		const out = applyComposerProjectionChange(initialComposerBrowserState(), change);
		assert(out.triggersSearch === false && out.rebuildSnapshot === false, `composer ${change.kind} is search/rebuild free`);
	}
	// orbit implies semantic on (mirrors the shared reducer).
	const orbit = applyComposerProjectionChange(initialComposerBrowserState(), { kind: 'graphPreset', preset: 'orbit' });
	assert(orbit.state.graphShowSemantic === true, 'composer orbit turns semantic on');
	// projection mapping is faithful.
	const projected = mapComposerStateToProjectionState({ ...initialComposerBrowserState(), view: 'tree', selectedId: 'b' });
	assert(projected.view === 'tree' && projected.selectedId === 'b', 'composer state → projection state faithful');
}

// Local filter operates ONLY over the frozen snapshot (never a re-query).
{
	assert(localFilterItems(relatedSnapshot.items, '').length === 2, 'empty filter returns complete frozen set');
	assert(localFilterItems(relatedSnapshot.items, 'beta').length === 1, 'filter matches title case-insensitively');
	assert(localFilterItems(relatedSnapshot.items, 'notes/').length === 1, 'filter matches path');
	const bodyItem = { ...relatedSnapshot.items[0], content: 'Unique body phrase' };
	assert(localFilterItems([bodyItem], 'body phrase').length === 1, 'filter matches frozen body content');
	assert(localFilterItems(relatedSnapshot.items, 'zzz').length === 0, 'no match → empty (no fallback query)');
}

// Selection-after-revision: keep if present, else highest ranked, else null.
{
	assert(resolveSelectionAfterRevision(relatedSnapshot, 'b') === 'b', 'keeps selection still present in new snapshot');
	assert(resolveSelectionAfterRevision(relatedSnapshot, 'gone') === 'a', 'falls back to highest-ranked item');
	const empty: ComposerRelatedMaterialSnapshot = { ...relatedSnapshot, items: [] };
	assert(resolveSelectionAfterRevision(empty, 'x') === null, 'empty snapshot → null selection');
}

// Composer open disposition: keep-browser by default (never navigates away).
{
	assert(resolveComposerOpenDisposition({ newTab: false }) === 'keep-browser', 'default open keeps the browser');
	assert(resolveComposerOpenDisposition({ newTab: true }) === 'tab', 'modifier requests a Vault tab');
}

if (failures > 0) {
	console.error(`\n${failures} host-parity assertion(s) failed`);
	process.exit(1);
}
console.log('OK result-browser-host-parity');
