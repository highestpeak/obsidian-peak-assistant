import { useCallback, useEffect, useMemo, useRef } from 'react';
import { create } from 'zustand';
import { useAIAnalysisResultStore } from '@/ui/view/quick-search/store/aiAnalysisStore';
import type { AISearchGraph, AISearchNode, AISearchEdge } from '@/service/agents/AISearchAgent';
import { useSubscribeUIEvent } from '@/ui/store/uiEventStore';
import type { GraphPatch } from '@/core/providers/ui-events/graph';
import { UISignalChannel } from '@/core/providers/types';

/** Queue item driven by ui-signal(channel='graph'). */
export type GraphSignalKind = 'stage' | 'patch' | 'effect';

export interface GraphSignalQueuePayload {
	stage?: 'start' | 'finish';
	patch?: GraphPatch;
	overlayText?: string | null;
	effect?: { type?: string; intensity?: number; focusNodeIds?: string[] };
}

export type GraphAnimationMode = 'idle' | 'scanning' | 'rendering' | 'cooldown';

export type GraphVisualEffectType =
	| 'none'
	| 'scan'
	| 'path'
	| 'filter'
	| 'semantic';

/**
 * Map from effect type to link kinds to highlight for that effect. 
 * config layer is "select edges by edge kind", but not "only edges have effect";
 * it's "use edge kind to decide which edges (and derived nodes) to participate", then decide whether to draw on edges, nodes, or both.
 * e.g. { filter: ['semantic', 'physical'] } means when effect type is 'filter', highlight semantic and physical edges.
 * */
export type EffectKindMap = Partial<Record<GraphVisualEffectType, string[]>>;

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
	kind: GraphSignalKind;
	ts: number;
	payload: GraphSignalQueuePayload;
}

/** Optional ref for direct patch apply (avoids props graph → clear re-apply during streaming). */
export type GraphApplyPatchRef = { applyPatch: (patch: import('@/core/providers/ui-events/graph').GraphPatch) => void | Promise<void> };

interface GraphAnimationStore {
	mode: GraphAnimationMode;
	queue: GraphQueueItem[];
	current: GraphQueueItem | null;
	/** Set by KnowledgeGraphSection; queue pump calls applyPatch when processing patch items. */
	graphApplyPatchRef: GraphApplyPatchRef | null;
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
	setGraphApplyPatchRef: (ref: GraphApplyPatchRef | null) => void;
	clear: () => void;
	reset: () => void;
}

const MAX_QUEUE_SIZE = 200;

export const useGraphAnimationStore = create<GraphAnimationStore>((set, get) => ({
	mode: 'idle',
	queue: [],
	current: null,
	graphApplyPatchRef: null,
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
	setGraphApplyPatchRef: (ref) => set({ graphApplyPatchRef: ref }),
	clear: () => set({
		mode: 'idle',
		queue: [],
		current: null,
		overlayText: null,
		effect: { type: 'none', intensity: 0, startedAtMs: Date.now() },
	}),
	reset: () => set({
		mode: 'idle',
		queue: [],
		current: null,
		graphApplyPatchRef: null,
		overlayText: null,
		effect: { type: 'none', intensity: 0, startedAtMs: Date.now() },
	}),
}));

/** Persist graph patch to store. Patch is incremental (only new/changed nodes/edges); setGraph merges via mergeAISearchGraphs. */
export function persistPatchToStore(patch: any): void {
	try {
		const nodes: AISearchNode[] = (patch?.upsertNodes ?? []).map((n: any) => {
			const id = String(n.id);
			const title = String(n.label ?? id);
			// Prefer explicit path, then attributes.path, then derive from file: id (for opening files and display)
			let path: string | undefined;
			if (typeof n.path === 'string' && n.path.trim()) path = n.path.trim().replace(/^\/+/, '');
			else if (n.attributes && typeof n.attributes === 'object' && typeof n.attributes.path === 'string' && n.attributes.path.trim()) path = String(n.attributes.path).trim().replace(/^\/+/, '');
			else if (id.startsWith('file:')) path = id.slice('file:'.length).replace(/^\/+/, '');
			return {
				id,
				type: String(n.type ?? 'document'),
				title,
				...(path ? { path } : {}),
				attributes: (n.attributes && typeof n.attributes === 'object') ? n.attributes : {},
			};
		});
		const edges: AISearchEdge[] = (patch?.upsertEdges ?? []).map((e: any) => {
			const source = String(e.from_node_id);
			const target = String(e.to_node_id);
			const type = String(e.kind ?? 'unknown');
			const attrs = (e.attributes && typeof e.attributes === 'object') ? e.attributes as Record<string, unknown> : {};
			const weightAttrs = typeof e.weight === 'number' ? { weight: e.weight } : {};
			return {
				id: `e:${source}|${type}|${target}`,
				source,
				type,
				target,
				attributes: { ...attrs, ...weightAttrs },
			};
		});
		const g: AISearchGraph = { nodes, edges };
		useAIAnalysisResultStore.getState().setGraph(g);
	} catch (e) {
		console.warn('[graphAnimationStore] persistPatchToStore failed:', e);
	}
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Hook to pump the graph animation queue sequentially.
 * Subscribes to ui-signal (channel='graph'); drives mode/effect/overlayText and persists patch to aiAnalysisStore.
 */
export function useGraphQueuePump(): void {
	const enqueue = useGraphAnimationStore((s) => s.enqueue);
	const queueLength = useGraphAnimationStore((s) => s.queue.length);
	const processingRef = useRef(false);

	useSubscribeUIEvent('ui-signal', (eventType, raw) => {
		const ev = raw as { channel?: string; kind?: string; entityId?: string; id?: string; payload?: GraphSignalQueuePayload };
		if (ev?.channel !== UISignalChannel.GRAPH) return;
		const kind = (ev.kind ?? 'stage') as GraphSignalKind;
		enqueue({
			id: ev.id ?? `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			kind,
			ts: Date.now(),
			payload: ev.payload ?? {},
		});
	});

	const queuePumpCallback = useCallback(async (item: GraphQueueItem) => {
		useGraphAnimationStore.getState().setCurrent(item);
		const p = item.payload;

		if (item.kind === 'stage') {
			if (p.stage === 'start') {
				useGraphAnimationStore.getState().setMode('scanning');
				useGraphAnimationStore.getState().setOverlayText(p.overlayText ?? 'Updating graph…');
				const eff = p.effect;
				useGraphAnimationStore.getState().setEffect({
					type: (eff?.type as GraphVisualEffectType) ?? 'scan',
					intensity: eff?.intensity ?? 1,
					focusNodeIds: eff?.focusNodeIds,
				});
				await sleep(260);
				return;
			}
			if (p.stage === 'finish') {
				useGraphAnimationStore.getState().setMode('idle');
				useGraphAnimationStore.getState().setOverlayText(null);
				useGraphAnimationStore.getState().setEffect({ type: 'none', intensity: 0 });
				return;
			}
			return;
		}

		if (item.kind === 'effect') {
			const eff = p.effect;
			if (eff) {
				useGraphAnimationStore.getState().setEffect({
					type: (eff.type as GraphVisualEffectType) ?? 'none',
					intensity: eff.intensity ?? 0,
					focusNodeIds: eff.focusNodeIds,
				});
			}
			await sleep(120);
			return;
		}

		if (item.kind === 'patch' && p.patch) {
			const applyRef = useGraphAnimationStore.getState().graphApplyPatchRef;
			if (applyRef?.applyPatch) {
				await Promise.resolve(applyRef.applyPatch(p.patch));
			}
			persistPatchToStore(p.patch);
			useGraphAnimationStore.getState().setMode('rendering');
			useGraphAnimationStore.getState().setOverlayText(p.overlayText ?? p.patch.meta?.label ?? 'Applying results…');
			await sleep(180);
			const eff = p.effect;
			useGraphAnimationStore.getState().setEffect({
				type: (eff?.type as GraphVisualEffectType) ?? (p.patch.focus?.nodeIds?.length ? 'filter' : 'none'),
				intensity: eff?.intensity ?? 0.9,
				focusNodeIds: eff?.focusNodeIds ?? p.patch.focus?.nodeIds,
			});
			useGraphAnimationStore.getState().setMode('cooldown');
			await sleep(220);
			useGraphAnimationStore.getState().setMode('idle');
			useGraphAnimationStore.getState().setEffect({ type: 'none', intensity: 0 });
			return;
		}

		useGraphAnimationStore.getState().setMode('idle');
	}, []);

	useEffect(() => {
		if (processingRef.current) return;
		if (!queueLength) return;
		processingRef.current = true;

		(async () => {
			while (true) {
				const item = useGraphAnimationStore.getState().shift();
				if (!item) break;
				await queuePumpCallback(item);
			}
		})().finally(() => {
			processingRef.current = false;
		});
	}, [queueLength, queuePumpCallback]);
}

