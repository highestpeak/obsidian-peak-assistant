import { create } from 'zustand';
import type { LensGraphData, LensType } from '@/ui/component/mine/multi-lens-graph/types';

interface AIGraphState {
	graphData: LensGraphData | null;
	activeLens: LensType;
	loading: boolean;
	error: string | null;
	query: string;
	selectedPaths: string[];

	setGraphData: (data: LensGraphData | null) => void;
	setActiveLens: (lens: LensType) => void;
	setLoading: (v: boolean) => void;
	setError: (e: string | null) => void;
	setQuery: (q: string) => void;
	setSelectedPaths: (paths: string[]) => void;
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

export const useAIGraphStore = create<AIGraphState>((set) => ({
	graphData: null,
	activeLens: 'topology',
	loading: false,
	error: null,
	query: '',
	selectedPaths: [],

	setGraphData: (data) => set({ graphData: data }),
	setActiveLens: (lens) => set({ activeLens: lens }),
	setLoading: (v) => set({ loading: v }),
	setError: (e) => set({ error: e }),
	setQuery: (q) => set({ query: q }),
	setSelectedPaths: (paths) => set({ selectedPaths: paths }),
	reset: () =>
		set({
			graphData: null,
			activeLens: 'topology',
			loading: false,
			error: null,
			query: '',
			selectedPaths: [],
		}),
}));
