import { create } from 'zustand';
import type { CuratorPushPayload, CuratorPushReason } from '@/service/usage/curator/types';

// Re-export so existing UI imports (e.g. CuratorPushModal) keep working.
export type { CuratorPushPayload, CuratorPushReason };

interface CuratorPushState {
	current: CuratorPushPayload | null;
	/** Session-scoped suppression set — cleared when runtime restarts. */
	dismissedKeys: Set<string>;
	pushedThisSession: boolean;

	show(p: CuratorPushPayload): void;
	dismiss(persistForSession?: boolean): void;
}

/**
 * Zustand store for the single Curator runtime push modal. The
 * CuratorPushRuntime writes via the projection adapter that wraps
 * `show()`; the React root reads via `current`.
 *
 * Session scoping: `pushedThisSession` flips true on the first call to
 * `show()` and the runtime checks it through the projection port to
 * throttle (max 1 push per session). The store is reset on runtime
 * `dispose()` so a fresh load (e.g. plugin reload) gets a clean slate.
 */
export const useCuratorPushStore = create<CuratorPushState>((set) => ({
	current: null,
	dismissedKeys: new Set(),
	pushedThisSession: false,

	show(p) {
		set((state) => ({
			current: p,
			pushedThisSession: true,
			dismissedKeys: state.dismissedKeys,
		}));
	},
	dismiss(persistForSession?: boolean) {
		set((state) => {
			if (!persistForSession || !state.current?.dismissKey) {
				return { current: null };
			}
			const next = new Set(state.dismissedKeys);
			next.add(state.current.dismissKey);
			return { current: null, dismissedKeys: next };
		});
	},
}));
