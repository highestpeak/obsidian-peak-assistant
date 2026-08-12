import type { AppHandle } from '@/core/ports/AppHandle';
import { buildSourcesGraphWithDiscoveredEdges } from '@/service/tools/search-graph-inspector/build-sources-graph';
import type { SearchResultItem } from '@/core/search/searchTypes';
import type { LensGraphData } from '@/core/types/lens-graph';
import { enrichWithCrossDomain } from '@/service/agents/ai-graph/infer-cross-domain';
import { inferThinkingTree } from './infer-thinking-tree';
import type { IAgentPrompter } from '@/core/llm/IAgentPrompter';

/**
 * Convert SearchResultItems into LensGraphData by discovering physical + semantic edges
 * via the SourcesGraph builder, then mapping to the shared LensGraphData model.
 *
 * T11J B1: caller passes the live `app` so the helper no longer reaches
 * `AppContext.getInstance().app`.
 */
export async function buildLensGraphFromSources(sources: SearchResultItem[], app: AppHandle): Promise<LensGraphData> {
	const sg = await buildSourcesGraphWithDiscoveredEdges(sources);

	if (!sg) {
		return { nodes: [], edges: [], availableLenses: [] };
	}

	const baseNodes = sg.nodes.map((n) => ({
		label: n.label,
		path: n.attributes?.path ?? n.id,
		role: 'leaf' as const,
		group: (n.attributes?.path ?? n.id).split('/').slice(0, -1).join('/'),
		createdAt: undefined as number | undefined,
		modifiedAt: undefined as number | undefined,
	}));

	const edges = sg.edges.map((e) => ({
		source: e.from_node_id,
		target: e.to_node_id,
		kind: (e.kind === 'semantic' ? 'semantic' : 'references') as 'semantic' | 'references',
		directionality: e.directionality,
	}));

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
 *
 * T11J B1: explicit `app` + `prompter` injections.
 */
export async function enrichWithThinkingTree(
	currentData: LensGraphData,
	app: AppHandle,
	prompter: IAgentPrompter,
): Promise<LensGraphData> {
	const files = await Promise.all(
		currentData.nodes.map(async (n) => {
			const file = app.vault.getAbstractFileByPath(n.path);
			if (!file || !('extension' in file)) return { path: n.path, title: n.label, firstLines: '' };
			const content = await app.vault.cachedRead(file as any);
			return { path: n.path, title: n.label, firstLines: content.slice(0, 500) };
		}),
	);

	const tree = await inferThinkingTree({ files }, prompter);
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
		.map((n) => ({
			source: n.parentPath!,
			target: n.path,
			kind: 'derives' as const,
			directionality: 'directed' as const,
		}));

	const allEdges = [...currentData.edges, ...derivesEdges];
	const availableLenses = [
		...new Set([...currentData.availableLenses, 'thinking-tree' as const]),
	] as LensGraphData['availableLenses'];

	return { nodes: enrichedNodes, edges: allEdges, availableLenses };
}
