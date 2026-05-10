import { create } from 'zustand';
import type { BriefingItem, BriefingCategory } from '@/service/ambient/types';

interface MorningBriefingStoreState {
	items: BriefingItem[];
	isVisible: boolean;
	dismissedCategories: Set<BriefingCategory>;
	lastShownTs: number;

	setItems: (items: BriefingItem[]) => void;
	show: () => void;
	dismiss: () => void;
	dismissCategory: (category: BriefingCategory) => void;
	removeItem: (filePath: string) => void;
}

export const useMorningBriefingStore = create<MorningBriefingStoreState>((set, get) => ({
	items: [],
	isVisible: false,
	dismissedCategories: new Set(),
	lastShownTs: 0,

	setItems: (items: BriefingItem[]) => set({ items }),

	show: () => set({ isVisible: true, lastShownTs: Date.now() }),

	dismiss: () => set({ isVisible: false }),

	dismissCategory: (category: BriefingCategory) => {
		const dismissed = new Set(get().dismissedCategories);
		dismissed.add(category);
		set({
			dismissedCategories: dismissed,
			items: get().items.filter((i) => i.category !== category),
		});
	},

	removeItem: (filePath: string) =>
		set((state) => ({
			items: state.items.filter((i) => i.filePath !== filePath),
		})),
}));
