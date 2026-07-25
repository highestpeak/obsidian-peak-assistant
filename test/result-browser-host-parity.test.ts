/**
 * Host-parity tests for the Quick Search ⇄ shared Result Browser adapter
 * (CMP-RB-04).
 *
 * Asserts the adapter maps the `vaultSearchStore` shape onto the browser's
 * controlled state faithfully, routes every browser projection change to a
 * presentation-only store setter (never a search / rebuild), and resolves the
 * list open/new-tab policy exactly as the pre-extraction row did. Pure logic —
 * no React render, no live store singleton.
 */
import {
	mapStoreToProjectionState,
	mapProjectionChangeToStoreEffect,
	resolveListOpenNewTab,
	type QuickSearchProjectionSource,
} from '../src/ui/view/quick-search/QuickSearchResultBrowserAdapter';
import {
	applyProjectionChange,
	type ResultBrowserProjectionChange,
	type ResultBrowserProjectionState,
} from '../src/ui/component/result-browser/model';

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

if (failures > 0) {
	console.error(`\n${failures} host-parity assertion(s) failed`);
	process.exit(1);
}
console.log('OK result-browser-host-parity');
