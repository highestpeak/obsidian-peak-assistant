// T8: Ambient projection store. Pre-T8 this store imported
// `sqliteStoreManager` and wrote to `ambient_push_log` from
// `recordAction`. T8 removes that write — persistence flows through
// `AmbientPushRuntime.recordAction(...)` via the app-owned runtime.
// The store now only projects UI state.

import { create } from 'zustand';
import type { AmbientPushItem } from '@/service/ambient/types';

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
