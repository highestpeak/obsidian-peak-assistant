import { create } from 'zustand';
import type { QuickSearchGraphCreateOrigin } from '@/core/ports/QuickSearchLauncherPort';

export type TabType = 'vault' | 'ai';
export type AIWorkspaceMode = 'search' | 'graph' | 'vault-intelligence';

const MAX_RECENT_QUERIES = 10;

interface SharedStore {
	activeTab: TabType;
	aiWorkspaceMode: AIWorkspaceMode;
	aiGraphDeepLinkId: string | null;
	aiGraphCreateOrigin: QuickSearchGraphCreateOrigin | null;
	/** Vault Search tab input; not shared with AI until user clicks Ask AI */
	vaultSearchQuery: string;
	/** AI Analysis tab input; also set from vault query when Ask AI is clicked */
	searchQuery: string;
	/** In-memory recent search queries (session-level, most recent first) */
	recentQueries: string[];

	setActiveTab: (tab: TabType) => void;
	setAIWorkspaceMode: (mode: AIWorkspaceMode) => void;
	beginOrdinaryOpen: () => void;
	beginIntentOpen: (
		mode: AIWorkspaceMode,
		graphId?: string,
		origin?: QuickSearchGraphCreateOrigin,
	) => void;
	consumeAIGraphDeepLink: () => void;
	setVaultSearchQuery: (query: string) => void;
	setSearchQuery: (query: string) => void;
	/** Record a query in recent history (deduplicates, caps at MAX_RECENT_QUERIES) */
	addRecentQuery: (query: string) => void;
	clearRecentQueries: () => void;
	reset: () => void;
}

export const useSharedStore = create<SharedStore>((set) => ({
	activeTab: 'ai',
	aiWorkspaceMode: 'search',
	aiGraphDeepLinkId: null,
	aiGraphCreateOrigin: null,
	vaultSearchQuery: '',
	searchQuery: '',
	recentQueries: [],

	setActiveTab: (tab: TabType) => set({ activeTab: tab }),
	setAIWorkspaceMode: (mode: AIWorkspaceMode) => set((state) => ({
		activeTab: 'ai',
		aiWorkspaceMode: mode,
		...(mode === 'graph' && state.activeTab === 'vault' && state.vaultSearchQuery.trim()
			? {
				aiGraphCreateOrigin: {
					surface: 'vault-search' as const,
					contextRef: {
						kind: 'search-query' as const,
						ref: state.vaultSearchQuery.trim(),
						label: state.vaultSearchQuery.trim(),
					},
				},
			}
			: {}),
	})),
	beginOrdinaryOpen: () => set({
		activeTab: 'ai',
		aiWorkspaceMode: 'search',
		aiGraphDeepLinkId: null,
		aiGraphCreateOrigin: null,
	}),
	beginIntentOpen: (mode, graphId, origin) => set({
		activeTab: 'ai',
		aiWorkspaceMode: mode,
		aiGraphDeepLinkId: graphId ?? null,
		aiGraphCreateOrigin: origin ?? null,
	}),
	consumeAIGraphDeepLink: () => set({ aiGraphDeepLinkId: null }),
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
		activeTab: 'ai',
		aiWorkspaceMode: 'search',
		aiGraphDeepLinkId: null,
		aiGraphCreateOrigin: null,
		vaultSearchQuery: '',
		searchQuery: '',
	}),
}));
