/**
 * Quick Search ⇄ shared Result Browser adapter contract (CMP-RB-04).
 *
 * The Quick Search host binds the controlled Result Browser through several
 * thin React wrappers (`ResultPanePinnedHubChip`, `VaultSearchResult`,
 * `ResultTreeView`, `ResultGraphView`). This module is the *pure* core of that
 * binding: it maps the `vaultSearchStore` shape onto the browser's neutral
 * `ResultBrowserProjectionState`, maps each browser projection change back to
 * the store mutation it should perform, and resolves the list open/new-tab
 * policy. Keeping these as pure functions lets `result-browser-host-parity`
 * assert behavioral equivalence without a React render, and documents that the
 * host owns query/telemetry/open while the browser owns presentation.
 */
import type {
	ResultBrowserProjectionChange,
	ResultBrowserProjectionState,
} from '@/ui/component/result-browser/model';

/** The subset of `vaultSearchStore` the Result Browser projects. */
export interface QuickSearchProjectionSource {
	resultView: ResultBrowserProjectionState['view'];
	resultDensity: ResultBrowserProjectionState['density'];
	graphPreset: ResultBrowserProjectionState['graphPreset'];
	graphShowSemantic: boolean;
	inspectorOpen: boolean;
	treeCollapsedFolders: readonly string[];
	treeCursor: string | null;
}

/**
 * Project the store shape onto the browser's controlled state. `selectedId`
 * is the host's List selection resolved to a stable id (the store tracks it as
 * an index in `tab-VaultSearch`, so it is passed explicitly).
 */
export function mapStoreToProjectionState(
	source: QuickSearchProjectionSource,
	selectedId: string | null,
): ResultBrowserProjectionState {
	return {
		view: source.resultView,
		density: source.resultDensity,
		graphPreset: source.graphPreset,
		graphShowSemantic: source.graphShowSemantic,
		selectedId,
		inspectorOpen: source.inspectorOpen,
		collapsedFolders: source.treeCollapsedFolders,
		cursorId: source.treeCursor,
	};
}

/** The store setter a projection change maps to. */
export type QuickSearchStoreEffect =
	| { action: 'setResultView'; view: ResultBrowserProjectionState['view'] }
	| { action: 'setResultDensity'; density: ResultBrowserProjectionState['density'] }
	| { action: 'setGraphPreset'; preset: ResultBrowserProjectionState['graphPreset'] }
	| { action: 'setGraphShowSemantic'; on: boolean }
	| { action: 'setSelectedId'; id: string | null }
	| { action: 'setTreeCursor'; id: string | null }
	| { action: 'setInspectorOpen'; open: boolean }
	| { action: 'toggleTreeFolderCollapsed'; folderPath: string };

/**
 * Map a browser projection change to the store mutation the adapter performs.
 * Crucially there is no `search` / `rebuild` effect: every projection change
 * routes to a presentation setter only (contract #4).
 */
export function mapProjectionChangeToStoreEffect(
	change: ResultBrowserProjectionChange,
): QuickSearchStoreEffect {
	switch (change.kind) {
		case 'view': return { action: 'setResultView', view: change.view };
		case 'density': return { action: 'setResultDensity', density: change.density };
		case 'graphPreset': return { action: 'setGraphPreset', preset: change.preset };
		case 'graphSemantic': return { action: 'setGraphShowSemantic', on: change.on };
		case 'select': return { action: 'setSelectedId', id: change.id };
		case 'cursor': return { action: 'setTreeCursor', id: change.id };
		case 'inspector': return { action: 'setInspectorOpen', open: change.open };
		case 'toggleCollapse': return { action: 'toggleTreeFolderCollapsed', folderPath: change.folderPath };
	}
}

/**
 * Resolve whether a list-row open should use a new tab, preserving the
 * pre-extraction rule:
 *  - the dedicated top-right new-tab button always opens a new tab;
 *  - otherwise a `modeNewTab` default (Quick Search: `mode !== 'heading'`)
 *    wins over the body-click modifier when defined, else the modifier decides.
 */
export function resolveListOpenNewTab(
	gesture: { newTab: boolean; viaNewTabButton?: boolean },
	modeNewTab: boolean | undefined,
): boolean {
	if (gesture.viaNewTabButton) return true;
	return modeNewTab ?? gesture.newTab;
}
