import { create } from 'zustand';

export type GraphToolEventKind = 'tool-call' | 'tool-result';

/**
 * Normalized tool event payload emitted from UI event bus.
 * Used to drive graph animation pipeline.
 */
export interface GraphToolEventPayload {
	triggerName: string;
	toolName: string;
	toolCallId?: string;
	/**
	 * Tool call input (when kind = tool-call).
	 */
	input?: unknown;
	/**
	 * Tool output (when kind = tool-result).
	 */
	output?: unknown;
}

export type GraphAnimationMode = 'idle' | 'scanning' | 'rendering' | 'cooldown';

export type GraphVisualEffectType =
	| 'none'
	| 'scan'
	| 'path'
	| 'filter'
	| 'semantic';

export interface GraphVisualEffect {
	type: GraphVisualEffectType;
	/**
	 * Optional focus ids to guide rendering (e.g. filter spotlight, path emphasis).
	 */
	focusNodeIds?: string[];
	/**
	 * 0-1 intensity hint.
	 */
	intensity?: number;
	/**
	 * Timestamp used to reset animation phase.
	 */
	startedAtMs?: number;
}

export interface GraphQueueItem {
	id: string;
	kind: GraphToolEventKind;
	ts: number;
	payload: GraphToolEventPayload;
}

interface GraphAnimationStore {
	mode: GraphAnimationMode;
	queue: GraphQueueItem[];
	current: GraphQueueItem | null;
	/**
	 * Human-readable overlay text displayed on top of the graph.
	 */
	overlayText: string | null;
	/**
	 * Visual effect state consumed by the graph renderer.
	 */
	effect: GraphVisualEffect;

	/**
	 * Enqueue an item. The queue is bounded to avoid memory growth.
	 */
	enqueue: (item: GraphQueueItem) => void;
	/**
	 * Pop the next item from the queue.
	 */
	shift: () => GraphQueueItem | null;
	setCurrent: (item: GraphQueueItem | null) => void;
	setMode: (mode: GraphAnimationMode) => void;
	setOverlayText: (text: string | null) => void;
	setEffect: (effect: GraphVisualEffect) => void;
	clear: () => void;
}

const MAX_QUEUE_SIZE = 200;

export const useGraphAnimationStore = create<GraphAnimationStore>((set, get) => ({
	mode: 'idle',
	queue: [],
	current: null,
	overlayText: null,
	effect: { type: 'none', intensity: 0, startedAtMs: Date.now() },

	enqueue: (item) => {
		set((state) => {
			const next = [...state.queue, item];
			// Drop old items to keep a fixed memory bound.
			const bounded = next.length > MAX_QUEUE_SIZE
				? next.slice(next.length - MAX_QUEUE_SIZE)
				: next;
			return { queue: bounded };
		});
	},
	shift: () => {
		const q = get().queue;
		if (!q.length) return null;
		const next = q[0];
		set({ queue: q.slice(1) });
		return next;
	},
	setCurrent: (item) => set({ current: item }),
	setMode: (mode) => set({ mode }),
	setOverlayText: (text) => set({ overlayText: text }),
	setEffect: (effect) => set({
		effect: {
			...effect,
			startedAtMs: effect.startedAtMs ?? Date.now(),
		}
	}),
	clear: () => set({
		mode: 'idle',
		queue: [],
		current: null,
		overlayText: null,
		effect: { type: 'none', intensity: 0, startedAtMs: Date.now() },
	}),
}));

