import { create } from 'zustand';

export type CuratorPushReason =
	| 'context-near-limit'
	| 'high-spend'
	| 'low-mpg'
	| 'model-recommendation';

export interface CuratorPushPayload {
	reason: CuratorPushReason;
	title: string;
	body: string;
	/** When provided, applying the recommendation runs this callback. */
	apply?: () => void | Promise<void>;
	/** Persistent across "Don't show this session" dismissal. */
	dismissKey?: string;
}

interface CuratorPushState {
	current: CuratorPushPayload | null;
	/** Session-scoped suppression set — cleared when service restarts. */
	dismissedKeys: Set<string>;
	pushedThisSession: boolean;

	show(p: CuratorPushPayload): void;
	dismiss(persistForSession?: boolean): void;
}

/**
 * Zustand store for the single Curator runtime push modal. The service writes
 * via `show()`; the React root reads via `current`.
 *
 * Session scoping: `pushedThisSession` flips true on the first call to `show()`
 * and the service uses it to throttle (max 1 push per session). The store is
 * also reset on service `destroy()` so a fresh load (e.g. plugin reload) gets
 * a clean slate.
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
