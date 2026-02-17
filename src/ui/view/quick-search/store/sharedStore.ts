import { create } from 'zustand';

type TabType = 'vault' | 'ai';

interface SharedStore {
	activeTab: TabType;
	/** Vault Search tab input; not shared with AI until user clicks Ask AI */
	vaultSearchQuery: string;
	/** AI Analysis tab input; also set from vault query when Ask AI is clicked */
	searchQuery: string;

	setActiveTab: (tab: TabType) => void;
	setVaultSearchQuery: (query: string) => void;
	setSearchQuery: (query: string) => void;
}

export const useSharedStore = create<SharedStore>((set) => ({
	activeTab: 'vault',
	vaultSearchQuery: '',
	searchQuery: '',

	setActiveTab: (tab: TabType) => set({ activeTab: tab }),
	setVaultSearchQuery: (query: string) => set({ vaultSearchQuery: query }),
	setSearchQuery: (query: string) => set({ searchQuery: query }),
}));