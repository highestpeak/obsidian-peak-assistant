import { create } from 'zustand';

type TabType = 'vault' | 'ai';

const MAX_RECENT_QUERIES = 10;

interface SharedStore {
	activeTab: TabType;
	/** Vault Search tab input; not shared with AI until user clicks Ask AI */
	vaultSearchQuery: string;
	/** AI Analysis tab input; also set from vault query when Ask AI is clicked */
	searchQuery: string;
	/** In-memory recent search queries (session-level, most recent first) */
	recentQueries: string[];

	setActiveTab: (tab: TabType) => void;
	setVaultSearchQuery: (query: string) => void;
	setSearchQuery: (query: string) => void;
	/** Record a query in recent history (deduplicates, caps at MAX_RECENT_QUERIES) */
	addRecentQuery: (query: string) => void;
	clearRecentQueries: () => void;
	reset: () => void;
}

export const useSharedStore = create<SharedStore>((set) => ({
	activeTab: 'vault',
	vaultSearchQuery: '',
	searchQuery: '',
	recentQueries: [],

	setActiveTab: (tab: TabType) => set({ activeTab: tab }),
	setVaultSearchQuery: (query: string) => set({ vaultSearchQuery: query }),
	setSearchQuery: (query: string) => set({ searchQuery: query }),
	addRecentQuery: (query: string) => set((state) => {
		const trimmed = query.trim();
		if (!trimmed) return state;
		const filtered = state.recentQueries.filter((q) => q !== trimmed);
		return { recentQueries: [trimmed, ...filtered].slice(0, MAX_RECENT_QUERIES) };
	}),
	clearRecentQueries: () => set({ recentQueries: [] }),
	reset: () => set({
		activeTab: 'vault',
		vaultSearchQuery: '',
		searchQuery: '',
	}),
}));
