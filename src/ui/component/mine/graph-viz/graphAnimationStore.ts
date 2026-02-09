import { useCallback, useEffect, useMemo, useRef } from 'react';
import { create } from 'zustand';
import { toolOutputToGraphPatch } from '@/ui/component/mine/graph-viz/utils/graphPatches';
import { useAIAnalysisStore } from '@/ui/view/quick-search/store/aiAnalysisStore';
import type { AISearchGraph, AISearchNode, AISearchEdge } from '@/service/agents/AISearchAgent';
import { useSubscribeUIEvent } from '@/ui/store/uiEventStore';

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

/** Human-readable overlay text for tool names. */
function humanizeToolCall(toolName: string): string {
	switch (toolName) {
		case 'graph_traversal': return 'Scanning neighborhood…';
		case 'find_path': return 'Searching for a connecting path…';
		case 'find_key_nodes': return 'Identifying key nodes…';
		case 'find_orphans': return 'Looking for orphan notes…';
		case 'inspect_note_context': return 'Inspecting note context…';
		case 'local_search_whole_vault': return 'Searching vault…';
		default: return `Running ${toolName}…`;
	}
}

/** Visual effect type from tool name and input. */
function effectForToolCall(toolName: string, input: unknown): GraphVisualEffectType {
	if (toolName === 'find_path') return 'path';
	if (toolName === 'graph_traversal') {
		const i: any = input ?? {};
		if (i?.semantic_filter || i?.include_semantic_paths) return 'filter';
		return 'scan';
	}
	if (toolName === 'inspect_note_context') return 'scan';
	if (toolName === 'find_key_nodes') return 'scan';
	return 'scan';
}

/** Persist graph patch to analysis store so completed view keeps enriched nodes/edges. */
function persistPatchToStore(patch: any): void {
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
			return {
				id: `e:${source}|${type}|${target}`,
				source,
				type,
				target,
				attributes: typeof e.weight === 'number' ? { weight: e.weight } : {},
			};
		});
		const g: AISearchGraph = { nodes, edges };
		useAIAnalysisStore.getState().setGraph(g);
	} catch (e) {
		console.warn('[graphAnimationStore] persistPatchToStore failed:', e);
	}
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Hook to pump the graph animation queue sequentially.
 * Consumes tool-call/tool-result, updates store state, persists to aiAnalysisStore.
 * Graph updates flow via props (parent re-renders with new graph from store).
 */
export function useGraphQueuePump(): void {
	const { queue, enqueue } = useGraphAnimationStore();

	const processingRef = useRef(false);

	const subscribedEventTypes = useMemo(() => new Set<string>([
		'ui:tool-call',
		'ui:tool-result',
	]), []);

	// Only graph-related tools should drive the animation pipeline.
	// This prevents "tool-call without a patch" from leaving the graph stuck in scanning mode.
	const graphToolNames = useMemo(() => new Set<string>([
		'graph_traversal',
		'find_path',
		'find_key_nodes',
		'inspect_note_context',
	]), []);

	// Collect normalized tool events into the pending queue.
	useSubscribeUIEvent(subscribedEventTypes, (eventType, payload) => {
		if (eventType === 'ui:tool-call') {
			const p = payload as GraphToolEventPayload;
			if (!graphToolNames.has(p.toolName)) return;
			console.debug('[KnowledgeGraphSection] enqueue tool-call', p.toolName, p.toolCallId);
			enqueue({
				id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
				kind: 'tool-call',
				ts: Date.now(),
				payload: p,
			});
			return;
		}
		if (eventType === 'ui:tool-result') {
			const p = payload as GraphToolEventPayload;
			if (!graphToolNames.has(p.toolName)) return;
			console.debug('[KnowledgeGraphSection] enqueue tool-result', p.toolName, p.toolCallId);
			enqueue({
				id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
				kind: 'tool-result',
				ts: Date.now(),
				payload: p,
			});
			return;
		}
	});

	const queuePumpCallback = useCallback(async (item: GraphQueueItem) => {
		useGraphAnimationStore.getState().setCurrent(item);

		if (item.kind === 'tool-call') {
			useGraphAnimationStore.getState().setMode('scanning');
			useGraphAnimationStore.getState().setOverlayText(humanizeToolCall(item.payload.toolName));
			useGraphAnimationStore.getState().setEffect({
				type: effectForToolCall(item.payload.toolName, item.payload.input),
				intensity: 1,
			});
			await sleep(260);
			return;
		}

		const patch = toolOutputToGraphPatch(item.payload.toolName, item.payload.output);
		const outAny: any = item.payload.output as any;
		const core = outAny?.result ?? outAny?.data ?? outAny;
		const errMsg = core?.error ? String(core.error) : null;
		if (!patch && errMsg) {
			useGraphAnimationStore.getState().setMode('cooldown');
			useGraphAnimationStore.getState().setOverlayText(`Tool failed: ${errMsg.slice(0, 120)}`);
			useGraphAnimationStore.getState().setEffect({ type: 'none', intensity: 0 });
			await sleep(520);
			useGraphAnimationStore.getState().setMode('idle');
			useGraphAnimationStore.getState().setOverlayText('');
			return;
		}
		if (patch) {
			persistPatchToStore(patch);
			useGraphAnimationStore.getState().setMode('rendering');
			useGraphAnimationStore.getState().setOverlayText(patch.meta?.label ?? 'Applying results…');
			// Graph updates flow via aiAnalysisStore -> parent re-render -> graph prop -> GraphVisualization useEffect.
			await sleep(180);
			const hasSemantic = (patch.upsertEdges ?? []).some((e: any) => e.kind === 'semantic');
			useGraphAnimationStore.getState().setEffect({
				type: hasSemantic ? 'semantic' : 'none',
				intensity: hasSemantic ? 0.9 : 0,
				focusNodeIds: patch.focus?.nodeIds,
			});
			useGraphAnimationStore.getState().setMode('cooldown');
			await sleep(220);
			useGraphAnimationStore.getState().setMode('idle');
			useGraphAnimationStore.getState().setEffect({ type: 'none', intensity: 0 });
			return;
		}
		useGraphAnimationStore.getState().setMode('cooldown');
		await sleep(120);
		useGraphAnimationStore.getState().setMode('idle');
	}, []);

	useEffect(() => {
		if (processingRef.current) return;
		if (!queue.length) return;
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
	}, [queue.length, queuePumpCallback]);
}

