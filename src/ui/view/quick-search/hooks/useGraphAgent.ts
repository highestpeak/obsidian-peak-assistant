import { useState, useEffect, useRef } from 'react';
import type { LensGraphData } from '@/ui/component/mine/multi-lens-graph/types';

interface SourceItem {
	path: string;
	title?: string;
	score?: number;
}

interface UseGraphAgentResult {
	graphData: LensGraphData | null;
	loading: boolean;
	error: string | null;
}

export function useGraphAgent(
	sources: SourceItem[],
	searchQuery: string,
): UseGraphAgentResult {
	const [graphData, setGraphData] = useState<LensGraphData | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const abortRef = useRef<AbortController | null>(null);
	const sourcesKeyRef = useRef<string>('');

	useEffect(() => {
		if (sources.length === 0 || !searchQuery) return;

		const key = sources.map(s => s.path).sort().join('|');
		if (key === sourcesKeyRef.current) return;
		sourcesKeyRef.current = key;

		abortRef.current?.abort();
		const controller = new AbortController();
		abortRef.current = controller;

		setLoading(true);
		setError(null);

		(async () => {
			try {
				const { GraphAgent } = await import('@/service/agents/ai-graph/GraphAgent');
				const { AppContext } = await import('@/app/context/AppContext');
				const ctx = AppContext.getInstance();

				const agent = new GraphAgent(ctx.app, ctx.pluginId, ctx.settings);
				const result = await agent.generateGraph(
					{ searchQuery, sources },
					controller.signal,
				);

				if (controller.signal.aborted) return;

				if (result) {
					const { graphOutputToLensData } = await import('@/service/agents/ai-graph/graph-output-to-lens');
					setGraphData(graphOutputToLensData(result));
				} else {
					console.warn('[useGraphAgent] agent returned null, falling back');
					await fallbackToPhysicalGraph(sources, setGraphData);
				}
			} catch (err) {
				if (!controller.signal.aborted) {
					console.error('[useGraphAgent] error, falling back', err);
					await fallbackToPhysicalGraph(sources, setGraphData);
				}
			} finally {
				if (!controller.signal.aborted) {
					setLoading(false);
				}
			}
		})();

		return () => { controller.abort(); };
	}, [sources, searchQuery]);

	return { graphData, loading, error };
}

async function fallbackToPhysicalGraph(
	sources: SourceItem[],
	setGraphData: (data: LensGraphData) => void,
) {
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
			setGraphData(data);
		}
	} catch (err) {
		console.error('[useGraphAgent] fallback also failed', err);
	}
}
