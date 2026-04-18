import { useCallback, useRef } from 'react';
import type { LensGraphData } from '@/ui/component/mine/multi-lens-graph/types';
import { useGraphAgentStore, type GraphAgentStep } from '../store/graphAgentStore';

interface SourceItem {
	path: string;
	title?: string;
	score?: number;
}

export interface UseGraphAgentResult {
	graphData: LensGraphData | null;
	loading: boolean;
	steps: GraphAgentStep[];
	error: string | null;
	start: () => void;
}

export function useGraphAgent(
	sources: SourceItem[],
	searchQuery: string,
): UseGraphAgentResult {
	const store = useGraphAgentStore();
	const abortRef = useRef<AbortController | null>(null);

	// Check if we already have cached data for these sources
	const key = sources.map(s => s.path).sort().join('|');
	const isCached = store.cacheKey === key && store.graphData != null;

	const start = useCallback(() => {
		if (sources.length === 0 || !searchQuery || store.loading) return;

		abortRef.current?.abort();
		const controller = new AbortController();
		abortRef.current = controller;

		const st = useGraphAgentStore.getState();
		st.setCacheKey(key);
		st.setLoading(true);
		st.setError(null);
		st.clearSteps();
		st.addStep({ id: 'init', label: '正在初始化 Graph Agent...', status: 'running' });

		(async () => {
			try {
				const { GraphAgent } = await import('@/service/agents/ai-graph/GraphAgent');
				const { AppContext } = await import('@/app/context/AppContext');
				const ctx = AppContext.getInstance();

				useGraphAgentStore.getState().updateStep('init', { status: 'done', label: 'Graph Agent 已就绪' });

				const agent = new GraphAgent(ctx.app, ctx.plugin.manifest.id, ctx.settings);

				const result = await agent.generateGraph(
					{ searchQuery, sources },
					controller.signal,
					(event) => {
						const s = useGraphAgentStore.getState();
						if (event.type === 'step-start') {
							// Check if step already exists
							const existing = s.steps.find(st => st.id === event.id);
							if (existing) {
								s.updateStep(event.id, { label: event.label, status: 'running', detail: event.detail });
							} else {
								s.addStep({ id: event.id, label: event.label, status: 'running', detail: event.detail });
							}
						} else if (event.type === 'step-done') {
							s.updateStep(event.id, { status: 'done', label: event.label });
						} else if (event.type === 'thinking') {
							const existing = s.steps.find(st => st.id === event.id);
							if (existing) {
								s.updateStep(event.id, { detail: event.detail });
							} else {
								s.addStep({ id: event.id, label: event.label, status: 'running', detail: event.detail });
							}
						}
					},
				);

				if (controller.signal.aborted) return;

				if (result) {
					useGraphAgentStore.getState().addStep({ id: 'done', label: '图谱生成完成', status: 'done' });
					const { graphOutputToLensData } = await import('@/service/agents/ai-graph/graph-output-to-lens');
					useGraphAgentStore.getState().setGraphData(graphOutputToLensData(result));
				} else {
					console.warn('[useGraphAgent] agent returned null, falling back');
					useGraphAgentStore.getState().addStep({ id: 'fallback', label: 'AI 分析未返回结果，使用物理链接...', status: 'running' });
					await fallbackToPhysicalGraph(sources);
					useGraphAgentStore.getState().updateStep('fallback', { status: 'done' });
				}
			} catch (err) {
				if (!controller.signal.aborted) {
					console.error('[useGraphAgent] error, falling back', err);
					useGraphAgentStore.getState().addStep({ id: 'fallback', label: '出错，使用物理链接数据...', status: 'running' });
					await fallbackToPhysicalGraph(sources);
					useGraphAgentStore.getState().updateStep('fallback', { status: 'done' });
				}
			} finally {
				if (!controller.signal.aborted) {
					useGraphAgentStore.getState().setLoading(false);
				}
			}
		})();
	}, [sources, searchQuery, key]);

	return {
		graphData: isCached ? store.graphData : store.cacheKey === key ? store.graphData : null,
		loading: store.loading,
		steps: store.steps,
		error: store.error,
		start,
	};
}

async function fallbackToPhysicalGraph(sources: SourceItem[]) {
	try {
		const { buildSourcesGraphWithDiscoveredEdges } = await import(
			'@/service/tools/search-graph-inspector/build-sources-graph'
		);
		const { enrichWithCrossDomain } = await import(
			'@/service/agents/ai-graph/infer-cross-domain'
		);
		const searchItems = sources.map(s => ({ path: s.path, title: s.title ?? '', score: s.score ?? 0 }));
		const sg = await buildSourcesGraphWithDiscoveredEdges(searchItems as any);
		if (sg) {
			const nodes = sg.nodes.map((n: any) => ({
				label: n.label ?? n.attributes?.path?.split('/').pop() ?? n.id,
				path: n.attributes?.path ?? n.id,
				role: n.type === 'hub' ? 'hub' as const : n.type === 'bridge' ? 'bridge' as const : 'leaf' as const,
			}));
			const edges = sg.edges.map((e: any) => ({
				source: e.from_node_id,
				target: e.to_node_id,
				kind: (e.kind === 'semantic' ? 'semantic' : 'link') as const,
				weight: e.weight ?? 0.5,
			}));
			let data: LensGraphData = { nodes, edges, availableLenses: ['topology'] };
			data = enrichWithCrossDomain(data);
			useGraphAgentStore.getState().setGraphData(data);
		}
	} catch (err) {
		console.error('[useGraphAgent] fallback also failed', err);
	}
}
