import { create } from 'zustand';

interface AIAnalysisStore {
	// State
	triggerAnalysis: number;
	webEnabled: boolean;

	// Actions
	incrementTriggerAnalysis: () => void;
	setWebEnabled: (enabled: boolean) => void;
	toggleWeb: (currentQuery: string) => string;
	updateWebFromQuery: (query: string) => void;
}

export const useAIAnalysisStore = create<AIAnalysisStore>((set) => ({
	// Initial state
	triggerAnalysis: 0,
	webEnabled: false,

	// Actions
	incrementTriggerAnalysis: () => set((state) => ({ triggerAnalysis: state.triggerAnalysis + 1 })),
	setWebEnabled: (enabled: boolean) => set({ webEnabled: enabled }),
	toggleWeb: (currentQuery: string) => {
		if (currentQuery.includes('@web@')) {
			set({ webEnabled: false });
			return currentQuery.replace(/@web@\s*/g, '').trim();
		} else {
			set({ webEnabled: true });
			return currentQuery + (currentQuery.trim() ? ' @web@' : '@web@');
		}
	},
	updateWebFromQuery: (query: string) => {
		const trimmed = query.trim();
		const hasWebTrigger = trimmed.includes('@web@');
		set({ webEnabled: hasWebTrigger });
	},
}));

// Get clean query without @web@ for actual search
export const getCleanQuery = (query: string): string => {
	return query.replace(/@web@\s*/g, '').trim();
};