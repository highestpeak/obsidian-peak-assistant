/**
 * Controlled projection state + change classification for the shared Result
 * Browser. This encodes plan contract #4 ("View, density, collapse, preset,
 * Semantic, selection and inspector changes never trigger search or snapshot
 * rebuild") as pure, testable logic that both hosts and the contract tests
 * exercise.
 *
 * The browser is a controlled component: the host owns the snapshot and the
 * projection state, passes them in, and receives change *intents* out. The
 * host decides side effects (query, telemetry, open). None of the changes
 * modeled here are permitted to imply a re-query or a snapshot rebuild.
 */
import type {
	ResultBrowserDensity,
	ResultBrowserGraphPreset,
	ResultBrowserView,
	ResultItemId,
} from './types';

/** The controlled projection state a host passes into the browser. */
export interface ResultBrowserProjectionState {
	view: ResultBrowserView;
	density: ResultBrowserDensity;
	graphPreset: ResultBrowserGraphPreset;
	graphShowSemantic: boolean;
	selectedId: ResultItemId | null;
	inspectorOpen: boolean;
	collapsedFolders: readonly string[];
	cursorId: ResultItemId | null;
}

/**
 * Every projection change the browser can emit. Deliberately closed: there is
 * no `query` variant here, because the browser never triggers a search. A host
 * that wants to re-query does so through its own store, outside the browser.
 */
export type ResultBrowserProjectionChange =
	| { kind: 'view'; view: ResultBrowserView }
	| { kind: 'density'; density: ResultBrowserDensity }
	| { kind: 'graphPreset'; preset: ResultBrowserGraphPreset }
	| { kind: 'graphSemantic'; on: boolean }
	| { kind: 'select'; id: ResultItemId | null }
	| { kind: 'cursor'; id: ResultItemId | null }
	| { kind: 'inspector'; open: boolean }
	| { kind: 'toggleCollapse'; folderPath: string };

/**
 * Contract #4: no projection change ever triggers a search or snapshot
 * rebuild. This is the machine-checkable form of that guarantee — the
 * contract test asserts it holds for *every* change variant.
 */
export function projectionChangeTriggersSearch(_change: ResultBrowserProjectionChange): boolean {
	return false;
}
export function projectionChangeRebuildsSnapshot(_change: ResultBrowserProjectionChange): boolean {
	return false;
}

/**
 * Apply a projection change to the controlled state, returning the next state
 * plus whether the snapshot must be rebuilt (always `false`). The snapshot is
 * intentionally *not* an input here: a pure state transition can't touch it,
 * which is the structural proof that projection changes leave results and the
 * graph untouched.
 */
export function applyProjectionChange(
	state: ResultBrowserProjectionState,
	change: ResultBrowserProjectionChange,
): { state: ResultBrowserProjectionState; rebuildSnapshot: false; triggersSearch: false } {
	const next = reduce(state, change);
	return { state: next, rebuildSnapshot: false, triggersSearch: false };
}

function reduce(
	state: ResultBrowserProjectionState,
	change: ResultBrowserProjectionChange,
): ResultBrowserProjectionState {
	switch (change.kind) {
		case 'view':
			return { ...state, view: change.view };
		case 'density':
			return { ...state, density: change.density };
		case 'graphPreset':
			// Orbit turns semantic on by default (its whole point is showing hubs
			// as gravitational centers); every other preset leaves the flag as-is
			// unless the host overrides. Mirrors the store's `setGraphPreset`.
			return { ...state, graphPreset: change.preset, graphShowSemantic: change.preset === 'orbit' ? true : state.graphShowSemantic };
		case 'graphSemantic':
			return { ...state, graphShowSemantic: change.on };
		case 'select':
			return { ...state, selectedId: change.id };
		case 'cursor':
			return { ...state, cursorId: change.id };
		case 'inspector':
			return { ...state, inspectorOpen: change.open };
		case 'toggleCollapse': {
			const has = state.collapsedFolders.includes(change.folderPath);
			return {
				...state,
				collapsedFolders: has
					? state.collapsedFolders.filter((p) => p !== change.folderPath)
					: [...state.collapsedFolders, change.folderPath],
			};
		}
	}
}
