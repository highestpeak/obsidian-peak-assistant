import { create } from 'zustand';
import type { LensGraphData, LensType } from '@/ui/component/mine/multi-lens-graph/types';
import type { AIGraphSource } from '@/service/ai-graph';

export interface AIGraphArtifactReference {
	graphId: string;
	versionId: string;
}

interface AIGraphState {
	graphData: LensGraphData | null;
	artifactRef: AIGraphArtifactReference | null;
	activeLens: LensType;
	loading: boolean;
	error: string | null;
	query: string;
	selectedPaths: string[];
	initialSources: AIGraphSource[];

	setGraphData: (data: LensGraphData | null) => void;
	setArtifactRef: (reference: AIGraphArtifactReference | null) => void;
	setActiveLens: (lens: LensType) => void;
	setLoading: (v: boolean) => void;
	setError: (e: string | null) => void;
	setQuery: (q: string) => void;
	setSelectedPaths: (paths: string[]) => void;
	addInitialSource: (source: AIGraphSource) => void;
	removeInitialSource: (sourceId: string) => void;
	clearInitialSources: () => void;
	reset: () => void;
}

export function exportGraphJson(): string | null {
	const { graphData, activeLens } = useAIGraphStore.getState();
	if (!graphData) return null;
	// Compact single-line JSON — multi-line would break callout round-trip
	return JSON.stringify({
		lenses: { [activeLens]: graphData },
		generatedAt: new Date().toISOString(),
	});
}

/**
 * Analysis snapshots and run records may reference the canonical immutable
 * artifact, but must never embed another copy of its graph body.
 */
export function exportAIGraphReferenceJson(): string | null {
	const { artifactRef } = useAIGraphStore.getState();
	if (!artifactRef) return null;
	return JSON.stringify({
		artifactRef: {
			kind: 'ai-graph',
			graphId: artifactRef.graphId,
			versionId: artifactRef.versionId,
		},
		generatedAt: new Date().toISOString(),
	});
}

export const useAIGraphStore = create<AIGraphState>((set) => ({
	graphData: null,
	artifactRef: null,
	activeLens: 'topology',
	loading: false,
	error: null,
	query: '',
	selectedPaths: [],
	initialSources: [],

	setGraphData: (data) => set({ graphData: data, artifactRef: null }),
	setArtifactRef: (reference) => set({ artifactRef: reference }),
	setActiveLens: (lens) => set({ activeLens: lens }),
	setLoading: (v) => set({ loading: v }),
	setError: (e) => set({ error: e }),
	setQuery: (q) => set({ query: q }),
	setSelectedPaths: (paths) => set({ selectedPaths: paths }),
	addInitialSource: (source) => set((state) => ({
		initialSources: [
			...state.initialSources.filter((candidate) => candidate.sourceId !== source.sourceId),
			source,
		],
	})),
	removeInitialSource: (sourceId) => set((state) => ({
		initialSources: state.initialSources.filter((source) => source.sourceId !== sourceId),
	})),
	clearInitialSources: () => set({ initialSources: [] }),
	reset: () =>
		set({
			graphData: null,
			artifactRef: null,
			activeLens: 'topology',
			loading: false,
			error: null,
			query: '',
				selectedPaths: [],
				initialSources: [],
			}),
}));
