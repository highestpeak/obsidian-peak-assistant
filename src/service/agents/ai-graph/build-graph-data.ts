import { buildSourcesGraphWithDiscoveredEdges } from '@/service/tools/search-graph-inspector/build-sources-graph';
import type { SearchResultItem } from '@/service/search/types';
import type { LensGraphData } from '@/ui/component/mine/multi-lens-graph/types';
import { enrichWithCrossDomain } from '@/service/agents/ai-graph/infer-cross-domain';
import { inferThinkingTree } from './infer-thinking-tree';
import { AppContext } from '@/app/context/AppContext';

/**
 * Convert SearchResultItems into LensGraphData by discovering physical + semantic edges
 * via the SourcesGraph builder, then mapping to the multi-lens-graph format.
 */
export async function buildLensGraphFromSources(sources: SearchResultItem[]): Promise<LensGraphData> {
	const sg = await buildSourcesGraphWithDiscoveredEdges(sources);

	if (!sg) {
		return { nodes: [], edges: [], availableLenses: [] };
	}

	const baseNodes = sg.nodes.map((n) => ({
		label: n.label,
		path: n.attributes?.path ?? n.id,
		role: 'leaf' as const,
		group: (n.attributes?.path ?? n.id).split('/').slice(0, -1).join('/'),
	}));

	const edges = sg.edges.map((e) => ({
		source: e.from_node_id,
		target: e.to_node_id,
		kind: (e.kind === 'semantic' ? 'semantic' : 'link') as 'semantic' | 'link',
	}));

	const ctx = AppContext.getInstance();
	const app = ctx.app;
	const nodesWithTime = await Promise.all(baseNodes.map(async (n) => {
		const file = app.vault.getAbstractFileByPath(n.path);
		if (file && 'stat' in file) {
			const stat = (file as any).stat;
			return { ...n, createdAt: stat.ctime, modifiedAt: stat.mtime };
		}
		return n;
	}));

	const hasTimestamps = nodesWithTime.some((n) => n.createdAt !== undefined);
	const availableLenses: LensGraphData['availableLenses'] = hasTimestamps
		? ['topology', 'timeline']
		: ['topology'];

	const baseGraph: LensGraphData = { nodes: nodesWithTime, edges, availableLenses };
	return enrichWithCrossDomain(baseGraph);
}

/**
 * Enrich a LensGraphData with an AI-inferred thinking-tree layer.
 * Reads the first 500 chars of each file, sends to LLM to infer parent-child hierarchy,
 * then merges tree metadata (level, parentId, role, summary) and 'derives' edges back in.
 */
export async function enrichWithThinkingTree(currentData: LensGraphData): Promise<LensGraphData> {
	const ctx = AppContext.getInstance();
	const app = ctx.app;

	const files = await Promise.all(
		currentData.nodes.map(async (n) => {
			const file = app.vault.getAbstractFileByPath(n.path);
			if (!file || !('extension' in file)) return { path: n.path, title: n.label, firstLines: '' };
			const content = await app.vault.cachedRead(file as any);
			return { path: n.path, title: n.label, firstLines: content.slice(0, 500) };
		}),
	);

	const tree = await inferThinkingTree({ files });
	if (tree.nodes.length === 0) return currentData;

	const treeMap = new Map(tree.nodes.map((n) => [n.path, n]));
	const enrichedNodes = currentData.nodes.map((n) => {
		const t = treeMap.get(n.path);
		if (!t) return n;
		return {
			...n,
			label: t.label || n.label,
			level: t.level,
			parentId: t.parentPath ?? undefined,
			role: t.role,
			summary: t.summary,
		};
	});

	const derivesEdges = tree.nodes
		.filter((n) => n.parentPath)
		.map((n) => ({ source: n.parentPath!, target: n.path, kind: 'derives' as const }));

	const allEdges = [...currentData.edges, ...derivesEdges];
	const availableLenses = [
		...new Set([...currentData.availableLenses, 'thinking-tree' as const]),
	] as LensGraphData['availableLenses'];

	return { nodes: enrichedNodes, edges: allEdges, availableLenses };
}
