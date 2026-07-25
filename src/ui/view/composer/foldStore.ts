/**
 * Peak Composer — per-view fold store (WP1).
 *
 * Fold / section-fold is pure VIEW state — it never writes Markdown (handoff
 * §6.3). Each ComposerRoot instance owns its own vanilla zustand store so two
 * open composers keep independent fold state and nothing leaks to a module
 * singleton.
 */

import { createStore } from 'zustand/vanilla';

export interface ComposerFoldState {
	/** Ids of blocks (or headings, whose whole section collapses) that are folded. */
	folded: ReadonlySet<string>;
	toggle: (blockId: string) => void;
	isFolded: (blockId: string) => boolean;
}

export function createComposerFoldStore() {
	return createStore<ComposerFoldState>((set, get) => ({
		folded: new Set<string>(),
		toggle: (blockId) =>
			set((state) => {
				const next = new Set(state.folded);
				if (next.has(blockId)) next.delete(blockId);
				else next.add(blockId);
				return { folded: next };
			}),
		isFolded: (blockId) => get().folded.has(blockId),
	}));
}

export type ComposerFoldStore = ReturnType<typeof createComposerFoldStore>;
