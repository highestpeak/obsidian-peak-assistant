import { create } from 'zustand';
import type { LensGraphData } from '@/ui/component/mine/multi-lens-graph/types';

export interface GraphAgentStep {
	id: string;
	label: string;
	status: 'pending' | 'running' | 'done';
	detail?: string;
}

interface GraphAgentState {
	/** Keyed by sorted source paths */
	cacheKey: string;
	graphData: LensGraphData | null;
	loading: boolean;
	steps: GraphAgentStep[];
	error: string | null;

	setLoading: (v: boolean) => void;
	setGraphData: (data: LensGraphData | null) => void;
	setCacheKey: (key: string) => void;
	setError: (e: string | null) => void;
	addStep: (step: GraphAgentStep) => void;
	updateStep: (id: string, update: Partial<GraphAgentStep>) => void;
	clearSteps: () => void;
	reset: () => void;
}

export const useGraphAgentStore = create<GraphAgentState>((set) => ({
	cacheKey: '',
	graphData: null,
	loading: false,
	steps: [],
	error: null,

	setLoading: (v) => set({ loading: v }),
	setGraphData: (data) => set({ graphData: data }),
	setCacheKey: (key) => set({ cacheKey: key }),
	setError: (e) => set({ error: e }),
	addStep: (step) => set((s) => ({ steps: [...s.steps, step] })),
	updateStep: (id, update) =>
		set((s) => ({
			steps: s.steps.map((st) => (st.id === id ? { ...st, ...update } : st)),
		})),
	clearSteps: () => set({ steps: [] }),
	reset: () => set({ cacheKey: '', graphData: null, loading: false, steps: [], error: null }),
}));
