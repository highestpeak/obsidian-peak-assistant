import type { LensType } from '@/core/types/lens-graph';
import type { AtlasGraphPreset } from '@/ui/component/graph/AtlasGraphCanvas';
import type { ResultBrowserView } from '@/ui/component/result-browser/model/types';
import type { GraphWorkspaceScope } from './GraphWorkspaceManifest';

export interface GraphWorkspaceState {
	view: ResultBrowserView;
	scope: GraphWorkspaceScope;
	physicalProjection: AtlasGraphPreset;
	aiLens: LensType;
	projectionKind: 'physical' | 'ai';
	viewLabelsCompact: boolean;
	scopeControlsVisible: boolean;
}

export type GraphWorkspaceEvent =
	| { type: 'view'; view: ResultBrowserView }
	| { type: 'scope'; scope: GraphWorkspaceScope }
	| { type: 'physical-projection'; projection: AtlasGraphPreset }
	| { type: 'ai-lens'; lens: LensType };

export function createGraphWorkspaceState(
	input: Partial<Pick<GraphWorkspaceState, 'view' | 'scope' | 'physicalProjection' | 'aiLens'>> = {},
): GraphWorkspaceState {
	const view = input.view ?? 'graph';
	const scope = input.scope ?? 'one-hop';
	return {
		view,
		scope,
		physicalProjection: input.physicalProjection ?? 'constellation',
		aiLens: input.aiLens ?? 'topology',
		projectionKind: scope === 'ai' ? 'ai' : 'physical',
		viewLabelsCompact: view === 'graph',
		scopeControlsVisible: view === 'graph',
	};
}

export function graphWorkspaceTransition(
	state: GraphWorkspaceState,
	event: GraphWorkspaceEvent,
): GraphWorkspaceState {
	if (event.type === 'view') {
		return {
			...state,
			view: event.view,
			viewLabelsCompact: event.view === 'graph',
			scopeControlsVisible: event.view === 'graph',
		};
	}
	if (event.type === 'scope') {
		return {
			...state,
			scope: event.scope,
			projectionKind: event.scope === 'ai' ? 'ai' : 'physical',
		};
	}
	if (event.type === 'physical-projection') {
		return { ...state, physicalProjection: event.projection };
	}
	return { ...state, aiLens: event.lens };
}
