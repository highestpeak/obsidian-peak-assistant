/**
 * Composer ⇄ shared Result Browser adapter (CMP-RB-03 Composer half, CMP-RB-04).
 *
 * The Composer-owned wide modal hosts the SAME controlled Result Browser as
 * Quick Search, but binds a completely different set of host concerns
 * (handoff §12.5): a FROZEN related-material snapshot, the session that opened
 * it, the focused document context and focus-restore on close. It never
 * navigates to Quick Search and never re-queries — a search box, if shown, only
 * filters the frozen snapshot locally (spec §Related-material browser).
 *
 * This module is the PURE core of that binding — the mirror of
 * `QuickSearchResultBrowserAdapter.ts`. Keeping it pure lets
 * `result-browser-host-parity` assert the Composer host is also projection-only
 * (never triggers search / rebuild), and documents that the browser owns
 * presentation while the Composer host owns snapshot/session/context/focus.
 */

import type {
	ResultBrowserProjectionChange,
	ResultBrowserProjectionState,
	ResultBrowserSnapshot,
} from '@/ui/component/result-browser/model';
import type { SearchResultItem } from '@/core/search/searchTypes';
import type { ComposerRelatedMaterialSnapshot } from '@/service/composer';

/**
 * The Composer host's controlled browser state. Distinct from the store-bound
 * Quick Search source: it is owned by the modal, seeded from the frozen snapshot,
 * and restored when the modal reopens over the same session.
 */
export interface ComposerBrowserState {
	view: ResultBrowserProjectionState['view'];
	density: ResultBrowserProjectionState['density'];
	graphPreset: ResultBrowserProjectionState['graphPreset'];
	graphShowSemantic: boolean;
	inspectorOpen: boolean;
	collapsedFolders: readonly string[];
	cursorId: string | null;
	/** The single cross-view selection (docId ?? path ?? id). */
	selectedId: string | null;
	/** Local filter over the frozen snapshot — NEVER a re-query. */
	filterText: string;
}

/** The Composer default browser state when the wide modal first opens. */
export function initialComposerBrowserState(): ComposerBrowserState {
	return {
		view: 'list',
		density: 'detailed',
		graphPreset: 'constellation',
		graphShowSemantic: false,
		inspectorOpen: false,
		collapsedFolders: [],
		cursorId: null,
		selectedId: null,
		filterText: '',
	};
}

/**
 * Build the browser's immutable {@link ResultBrowserSnapshot} from the frozen
 * related-material snapshot. The COMPLETE `items` feed List/Tree; the capped
 * `graph` feeds Graph. Opening or switching a view never rebuilds this — it is
 * derived once from the frozen snapshot (contract #2/#4).
 */
export function mapRelatedSnapshotToBrowserSnapshot(
	snapshot: ComposerRelatedMaterialSnapshot,
): ResultBrowserSnapshot {
	return { items: snapshot.items, subgraph: snapshot.graph };
}

/** Project the Composer host state onto the browser's neutral controlled state. */
export function mapComposerStateToProjectionState(
	state: ComposerBrowserState,
): ResultBrowserProjectionState {
	return {
		view: state.view,
		density: state.density,
		graphPreset: state.graphPreset,
		graphShowSemantic: state.graphShowSemantic,
		selectedId: state.selectedId,
		inspectorOpen: state.inspectorOpen,
		collapsedFolders: state.collapsedFolders,
		cursorId: state.cursorId,
	};
}

/**
 * Apply a browser projection change to the Composer host state. This is the
 * Composer host's whole reducer: every change is presentation-only, so there is
 * NO search / rebuild branch. Returns the next state plus the invariant flags the
 * parity test asserts.
 */
export function applyComposerProjectionChange(
	state: ComposerBrowserState,
	change: ResultBrowserProjectionChange,
): { state: ComposerBrowserState; triggersSearch: false; rebuildSnapshot: false } {
	return { state: reduce(state, change), triggersSearch: false, rebuildSnapshot: false };
}

function reduce(state: ComposerBrowserState, change: ResultBrowserProjectionChange): ComposerBrowserState {
	switch (change.kind) {
		case 'view':
			return { ...state, view: change.view };
		case 'density':
			return { ...state, density: change.density };
		case 'graphPreset':
			// Mirror the shared reducer: orbit implies Semantic on.
			return {
				...state,
				graphPreset: change.preset,
				graphShowSemantic: change.preset === 'orbit' ? true : state.graphShowSemantic,
			};
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

/**
 * Local filter over the FROZEN snapshot (spec §Related-material browser: a
 * search box may only filter the snapshot, never issue a new search). Matches
 * title/path/body case-insensitively; empty query returns the complete set.
 */
export function localFilterItems(
	items: readonly SearchResultItem[],
	filterText: string,
): readonly SearchResultItem[] {
	const q = filterText.trim().toLowerCase();
	if (!q) return items;
	return items.filter((it) => [
		it.title,
		it.path,
		it.content,
		it.contentRaw,
		it.highlight?.text,
	].some((value) => value?.toLowerCase().includes(q)));
}

/**
 * Resolve the selection after a snapshot revision change (spec Interaction State
 * Contract): if the new snapshot still contains the previously selected source,
 * keep it; otherwise fall back to the highest-ranked item; empty → null. Never
 * re-queries.
 */
export function resolveSelectionAfterRevision(
	snapshot: ComposerRelatedMaterialSnapshot,
	previousSelectedId: string | null,
): string | null {
	if (previousSelectedId && snapshot.items.some((it) => it.id === previousSelectedId)) {
		return previousSelectedId;
	}
	return snapshot.items.length > 0 ? snapshot.items[0].id : null;
}

/**
 * Composer open disposition. The Composer host defaults to `keep-browser`: a row
 * open reveals/locates the source without navigating away from the current
 * document (§12.4 "不把用户带离当前文档"). A modifier requests a Vault tab.
 */
export function resolveComposerOpenDisposition(gesture: { newTab: boolean }): 'tab' | 'keep-browser' {
	return gesture.newTab ? 'tab' : 'keep-browser';
}
