/**
 * Zustand store for the Gap Analysis panel.
 */

import { create } from 'zustand';
import type { StructuralHole, CommunityInfo, BridgeNode } from '@/service/search/index/helper/structural/types';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { runStructuralAnalysis } from '@/service/search/index/helper/structural/orchestrator';

interface GapAnalysisState {
	holes: StructuralHole[];
	bridges: Array<{
		nodeId: string;
		path: string;
		label: string;
		betweenness: number;
		constraint: number;
		communityId: string;
	}>;
	communities: CommunityInfo[];
	selectedHoleId: string | null;
	modularityQ: number;
	lastComputedAt: number | null;
	staleNodeCount: number;
	isLoading: boolean;

	loadData: () => Promise<void>;
	selectHole: (id: string | null) => void;
	triggerRecompute: () => Promise<void>;
	dismissHole: (id: string) => Promise<void>;
	markHoleAddressed: (id: string) => Promise<void>;
}

export const useGapAnalysisStore = create<GapAnalysisState>((set, get) => ({
	holes: [],
	bridges: [],
	communities: [],
	selectedHoleId: null,
	modularityQ: 0,
	lastComputedAt: null,
	staleNodeCount: 0,
	isLoading: false,

	loadData: async () => {
		try {
			set({ isLoading: true });
			const repo = sqliteStoreManager.getStructuralAnalysisRepo();

			const holes = await repo.getTopHoles(50);
			const bridges = await repo.getTopBridgeNodes(20);
			const communities = await repo.getCommunities();
			const lastComputedAt = await repo.getState('last_computed_at');

			set({
				holes,
				bridges,
				communities,
				lastComputedAt: lastComputedAt ? Number(lastComputedAt) : null,
				isLoading: false,
			});
		} catch (e) {
			console.error('[gap-analysis] Failed to load data:', e);
			set({ isLoading: false });
		}
	},

	selectHole: (id) => set({ selectedHoleId: id }),

	triggerRecompute: async () => {
		set({ isLoading: true });
		try {
			await runStructuralAnalysis({ forceFullRecompute: true });
			await get().loadData();
		} catch (e) {
			console.error('[gap-analysis] Recompute failed:', e);
			set({ isLoading: false });
		}
	},

	dismissHole: async (id) => {
		try {
			const repo = sqliteStoreManager.getStructuralAnalysisRepo();
			await repo.updateHoleStatus(id, 'dismissed');
			set(s => ({ holes: s.holes.filter(h => h.id !== id) }));
		} catch (e) {
			console.error('[gap-analysis] Dismiss failed:', e);
		}
	},

	markHoleAddressed: async (id) => {
		try {
			const repo = sqliteStoreManager.getStructuralAnalysisRepo();
			await repo.updateHoleStatus(id, 'addressed');
			set(s => ({ holes: s.holes.filter(h => h.id !== id) }));
		} catch (e) {
			console.error('[gap-analysis] Mark addressed failed:', e);
		}
	},
}));
