import { create } from 'zustand';
import type { AmbientPushItem, UserAction } from '@/service/ambient/types';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';

interface AmbientPushStoreState {
	items: AmbientPushItem[];
	sourceFilePath: string;
	pushHistory: Map<string, number>;
	lastUpdateTs: number;
	serendipityItem: AmbientPushItem | null;

	setItems: (items: AmbientPushItem[], sourceFilePath: string) => void;
	clearItems: () => void;
	dismissItem: (filePath: string) => void;
	recordPush: (filePath: string, timestamp: number) => void;
	recordAction: (sourceFilePath: string, pushedFilePath: string, action: UserAction) => void;
	updateLlmExplanation: (filePath: string, explanation: string) => void;
}

export const useAmbientPushStore = create<AmbientPushStoreState>((set, get) => ({
	items: [],
	sourceFilePath: '',
	pushHistory: new Map(),
	lastUpdateTs: 0,
	serendipityItem: null,

	setItems: (items: AmbientPushItem[], sourceFilePath: string) => {
		// Pick the most serendipitous item for gutter tooltip
		// (first item with 2-hop graph_neighbor signal)
		const serendipityItem = items.find((item) =>
			item.signals.some((s) => s.type === 'graph_neighbor' && s.hop === 2),
		) ?? null;
		set({ items, sourceFilePath, lastUpdateTs: Date.now(), serendipityItem });
	},

	clearItems: () =>
		set({ items: [], lastUpdateTs: Date.now(), serendipityItem: null }),

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

	updateLlmExplanation: (filePath: string, explanation: string) =>
		set((state) => ({
			items: state.items.map((item) =>
				item.filePath === filePath
					? { ...item, explanation, explanationType: 'llm' as const }
					: item,
			),
			lastUpdateTs: Date.now(),
		})),
}));
