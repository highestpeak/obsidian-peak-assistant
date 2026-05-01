import { create } from 'zustand';
import type { AmbientPushItem, UserAction } from '@/service/ambient/types';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';

interface AmbientPushStoreState {
	items: AmbientPushItem[];
	pushHistory: Map<string, number>;
	lastUpdateTs: number;

	setItems: (items: AmbientPushItem[]) => void;
	clearItems: () => void;
	dismissItem: (filePath: string) => void;
	recordPush: (filePath: string, timestamp: number) => void;
	recordAction: (sourceFilePath: string, pushedFilePath: string, action: UserAction) => void;
}

export const useAmbientPushStore = create<AmbientPushStoreState>((set, get) => ({
	items: [],
	pushHistory: new Map(),
	lastUpdateTs: 0,

	setItems: (items: AmbientPushItem[]) =>
		set({ items, lastUpdateTs: Date.now() }),

	clearItems: () =>
		set({ items: [], lastUpdateTs: Date.now() }),

	dismissItem: (filePath: string) =>
		set((state) => ({
			items: state.items.filter((item) => item.filePath !== filePath),
			lastUpdateTs: Date.now(),
		})),

	recordPush: (filePath: string, timestamp: number) => {
		// Mutate Map directly — Zustand does not diff Map internals
		get().pushHistory.set(filePath, timestamp);
	},

	recordAction: (sourceFilePath: string, pushedFilePath: string, action: UserAction) => {
		try {
			sqliteStoreManager
				.getAmbientPushRepo()
				.recordAction({
					sourceFilePath,
					pushedFilePath,
					action,
					actionTs: Date.now(),
				})
				.catch(() => {
					/* SQLite may not be ready — fail silently */
				});
		} catch {
			/* sqliteStoreManager not initialized — fail silently */
		}
	},
}));
