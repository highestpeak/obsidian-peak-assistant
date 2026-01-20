import { create } from 'zustand';

type TabType = 'vault' | 'ai';

interface SharedStore {
	// State
	activeTab: TabType;
	searchQuery: string;

	// Actions
	setActiveTab: (tab: TabType) => void;
	setSearchQuery: (query: string) => void;
}

export const useSharedStore = create<SharedStore>((set) => ({
	// Initial state
	activeTab: 'vault',
	searchQuery: '',

	// Actions
	setActiveTab: (tab: TabType) => set({ activeTab: tab }),
	setSearchQuery: (query: string) => set({ searchQuery: query }),
}));