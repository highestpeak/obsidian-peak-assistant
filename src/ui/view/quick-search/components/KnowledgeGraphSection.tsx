import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TrendingUp, Copy } from 'lucide-react';
import { GraphVisualization, GraphVisualizationHandle, GraphSnapshot } from '../../../component/mine/GraphVisualization';
import type { GraphPreview } from '@/core/storage/graph/types';
import { useSubscribeUIEvent } from '@/ui/store/uiEventStore';
import { useGraphAnimationStore } from '@/ui/view/quick-search/store';
import type { GraphToolEventPayload, GraphVisualEffectType } from '@/ui/view/quick-search/store/graphAnimationStore';
import { toolOutputToGraphPatch } from '@/ui/view/quick-search/store/graphPatches';

/**
 * Knowledge graph section component
 */
export const KnowledgeGraphSection: React.FC<{ graph?: GraphPreview | null; analysisCompleted?: boolean }> = ({ graph, analysisCompleted }) => {
	const graphRef = useRef<GraphVisualizationHandle>(null);
	const processingRef = useRef(false);
	const [snapshot, setSnapshot] = useState<GraphSnapshot | null>(null);

	const {
		queue,
		mode,
		overlayText,
		effect,
		enqueue,
		shift,
		setCurrent,
		setMode,
		setOverlayText,
		setEffect,
		clear: clearStore,
	} = useGraphAnimationStore();

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

	const humanizeToolCall = (toolName: string) => {
		switch (toolName) {
			case 'graph_traversal':
				return 'Scanning neighborhood…';
			case 'find_path':
				return 'Searching for a connecting path…';
			case 'find_key_nodes':
				return 'Identifying key nodes…';
			case 'find_orphans':
				return 'Looking for orphan notes…';
			case 'inspect_note_context':
				return 'Inspecting note context…';
			case 'local_search_whole_vault':
				return 'Searching vault…';
			default:
				return `Running ${toolName}…`;
		}
	};

	const effectForToolCall = (toolName: string, input: unknown): GraphVisualEffectType => {
		if (toolName === 'find_path') return 'path';
		if (toolName === 'graph_traversal') {
			const i: any = input ?? {};
			if (i?.semantic_filter || i?.include_semantic_paths) return 'filter';
			return 'scan';
		}
		if (toolName === 'inspect_note_context') return 'scan';
		if (toolName === 'find_key_nodes') return 'scan';
		return 'scan';
	};

	const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

	// Pump the queue sequentially (tool-call -> scanning; tool-result -> patch + animation).
	useEffect(() => {
		if (processingRef.current) return;
		if (!queue.length) return;

		processingRef.current = true;

		(async () => {
			while (true) {
				const item = shift();
				if (!item) break;
				setCurrent(item);

				if (item.kind === 'tool-call') {
					setMode('scanning');
					setOverlayText(humanizeToolCall(item.payload.toolName));
					setEffect({
						type: effectForToolCall(item.payload.toolName, item.payload.input),
						intensity: 1,
					});
					await sleep(120);
					continue;
				}

				// tool-result
				const patch = toolOutputToGraphPatch(item.payload.toolName, item.payload.output);
				if (patch) {
					setMode('rendering');
					setOverlayText(patch.meta?.label ?? 'Applying results…');
					if (graphRef.current) {
						await graphRef.current.applyPatch(patch);
					}
					// If patch contains semantic edges, keep a semantic pulse briefly.
					const hasSemantic = (patch.upsertEdges ?? []).some(e => e.kind === 'semantic');
					setEffect({
						type: hasSemantic ? 'semantic' : 'none',
						intensity: hasSemantic ? 0.9 : 0,
						focusNodeIds: patch.focus?.nodeIds,
					});
					setMode('cooldown');
					await sleep(120);
					setMode('idle');
					setEffect({ type: 'none', intensity: 0 });
					continue;
				}

				// No patch to apply, still give a tiny cooldown to make the pipeline feel alive.
				setMode('cooldown');
				await sleep(80);
				setMode('idle');
			}
		})().finally(() => {
			processingRef.current = false;
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [queue.length]);

	// When analysis resets graph to null, clear pending queue and visualization.
	useEffect(() => {
		if (graph !== null && graph !== undefined) return;
		clearStore();
		graphRef.current?.clear();
		setSnapshot(null);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [graph]);

	// When analysis completes, stop scanning overlays and clear any pending queue.
	useEffect(() => {
		if (!analysisCompleted) return;
		clearStore();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [analysisCompleted]);

	const concepts = useMemo(() => {
		const labels = (snapshot?.nodes ?? [])
			.filter(n => n.type === 'concept')
			.map(n => n.label)
			.filter(Boolean);
		return Array.from(new Set(labels)).sort((a, b) => a.localeCompare(b));
	}, [snapshot]);

	const tags = useMemo(() => {
		const labels = (snapshot?.nodes ?? [])
			.filter(n => n.type === 'tag')
			.map(n => n.label)
			.filter(Boolean);
		return Array.from(new Set(labels)).sort((a, b) => a.localeCompare(b));
	}, [snapshot]);

	const copyText = async (text: string) => {
		try {
			await navigator.clipboard.writeText(text);
		} catch (e) {
			console.warn('[KnowledgeGraphSection] Failed to copy:', e);
		}
	};

	return (
		<div className="pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border pktw-border-[#e5e7eb] pktw-flex pktw-flex-col pktw-items-center">
			<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-3 pktw-w-full">
				<TrendingUp className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
				<span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338]">
					Knowledge Graph
				</span>
				<div className="pktw-flex-1" />
				<span className="pktw-text-xs pktw-text-[#9ca3af]">
					{mode !== 'idle' ? mode : ''}
				</span>
			</div>

			<div className="pktw-w-full pktw-relative">
				<GraphVisualization
					ref={graphRef}
					graph={graph}
					effect={effect}
					onSnapshotChange={setSnapshot}
				/>

				{/* Process overlay (narration layer) */}
				{overlayText ? (
					<div className="pktw-absolute pktw-bottom-2 pktw-left-2 pktw-z-20 pktw-pointer-events-none">
						<div className="pktw-bg-white/80 pktw-backdrop-blur-sm pktw-border pktw-border-[#e5e7eb] pktw-rounded-md pktw-px-2 pktw-py-1 pktw-text-[11px] pktw-text-[#374151] pktw-shadow-sm">
							{overlayText}
						</div>
					</div>
				) : null}

				{/* Queue indicator */}
				<div className="pktw-absolute pktw-bottom-2 pktw-right-2 pktw-z-20 pktw-pointer-events-none">
					<div className="pktw-bg-white/70 pktw-backdrop-blur-sm pktw-border pktw-border-[#e5e7eb] pktw-rounded-md pktw-px-2 pktw-py-1 pktw-text-[11px] pktw-text-[#6b7280] pktw-shadow-sm">
						Queue: {queue.length}
					</div>
				</div>
			</div>

			{concepts.length > 0 || tags.length > 0 ? (
				<div className="pktw-w-full pktw-mt-3 pktw-space-y-3">
					{concepts.length > 0 ? (
						<div className="pktw-bg-white pktw-border pktw-border-[#e5e7eb] pktw-rounded-md pktw-p-3">
							<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-2">
								<span className="pktw-text-xs pktw-font-semibold pktw-text-[#2e3338]">Concepts</span>
								<span className="pktw-text-[11px] pktw-text-[#9ca3af]">({concepts.length})</span>
								<div className="pktw-flex-1" />
								<button
									type="button"
									className="pktw-inline-flex pktw-items-center pktw-gap-1 pktw-text-[11px] pktw-text-[#6b7280] hover:pktw-text-[#2e3338]"
									onClick={() => copyText(concepts.join('\\n'))}
									title="Copy all concepts"
								>
									<Copy className="pktw-w-3 pktw-h-3" />
									Copy
								</button>
							</div>
							<div className="pktw-flex pktw-flex-wrap pktw-gap-1.5">
								{concepts.slice(0, 120).map((c) => (
									<button
										key={c}
										type="button"
										className="pktw-text-[11px] pktw-px-2 pktw-py-1 pktw-rounded-full pktw-bg-sky-50 pktw-text-sky-700 pktw-border pktw-border-sky-200 hover:pktw-bg-sky-100"
										onClick={() => copyText(c)}
										title="Click to copy"
									>
										{c}
									</button>
								))}
							</div>
						</div>
					) : null}

					{tags.length > 0 ? (
						<div className="pktw-bg-white pktw-border pktw-border-[#e5e7eb] pktw-rounded-md pktw-p-3">
							<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-2">
								<span className="pktw-text-xs pktw-font-semibold pktw-text-[#2e3338]">Tags</span>
								<span className="pktw-text-[11px] pktw-text-[#9ca3af]">({tags.length})</span>
								<div className="pktw-flex-1" />
								<button
									type="button"
									className="pktw-inline-flex pktw-items-center pktw-gap-1 pktw-text-[11px] pktw-text-[#6b7280] hover:pktw-text-[#2e3338]"
									onClick={() => copyText(tags.join('\\n'))}
									title="Copy all tags"
								>
									<Copy className="pktw-w-3 pktw-h-3" />
									Copy
								</button>
							</div>
							<div className="pktw-flex pktw-flex-wrap pktw-gap-1.5">
								{tags.slice(0, 120).map((t) => (
									<button
										key={t}
										type="button"
										className="pktw-text-[11px] pktw-px-2 pktw-py-1 pktw-rounded-full pktw-bg-violet-50 pktw-text-violet-700 pktw-border pktw-border-violet-200 hover:pktw-bg-violet-100"
										onClick={() => copyText(t)}
										title="Click to copy"
									>
										{t}
									</button>
								))}
							</div>
						</div>
					) : null}
				</div>
			) : null}

			<div className="pktw-text-xs pktw-text-[#999999] pktw-mt-2 pktw-text-center pktw-w-full">
				2-3 hop relationships
			</div>
		</div>
	);
};