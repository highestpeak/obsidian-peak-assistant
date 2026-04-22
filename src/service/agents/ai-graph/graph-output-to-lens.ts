import type { GraphOutput } from './graph-output-types';
import type { LensGraphData, LensNodeData, LensType } from '@/ui/component/mine/multi-lens-graph/types';

/**
 * Build a path resolver that maps LLM-generated paths to real vault-relative paths.
 * LLMs may return bare filenames, partial paths, or paths with/without .md extension.
 */
function buildPathResolver(sourcePaths: string[]): (raw: string) => string {
	const exact = new Set(sourcePaths);
	// basename (with ext) → full path, basename (no ext) → full path
	const byBasename = new Map<string, string>();
	const byNoExt = new Map<string, string>();
	for (const p of sourcePaths) {
		const base = p.split('/').pop() ?? p;
		const noExt = base.replace(/\.md$/i, '');
		if (!byBasename.has(base)) byBasename.set(base, p);
		if (!byNoExt.has(noExt)) byNoExt.set(noExt, p);
	}

	return (raw: string): string => {
		if (exact.has(raw)) return raw;
		// Strip leading slash
		const stripped = raw.replace(/^\/+/, '');
		if (exact.has(stripped)) return stripped;
		// Try with/without .md
		if (exact.has(stripped + '.md')) return stripped + '.md';
		const noExt = stripped.replace(/\.md$/i, '');
		if (exact.has(noExt)) return noExt;
		// Basename match
		const base = stripped.split('/').pop() ?? stripped;
		if (byBasename.has(base)) return byBasename.get(base)!;
		const baseNoExt = base.replace(/\.md$/i, '');
		if (byNoExt.has(baseNoExt)) return byNoExt.get(baseNoExt)!;
		// Suffix match
		const match = sourcePaths.find(p => p.endsWith('/' + stripped) || p.endsWith('/' + stripped + '.md'));
		if (match) return match;
		return raw;
	};
}

export function graphOutputToLensData(output: GraphOutput, sourcePaths?: string[]): LensGraphData {
	const resolve = sourcePaths?.length ? buildPathResolver(sourcePaths) : (p: string) => p;

	const nodes: LensNodeData[] = output.nodes.map(n => ({
		label: n.label,
		path: resolve(n.path),
		role: n.role,
		group: n.cluster_id,
		clusterId: n.cluster_id,
		summary: n.summary,
		importance: n.importance,
		createdAt: n.created_at,
	}));

	const edges = output.edges.map(e => ({
		source: resolve(e.source),
		target: resolve(e.target),
		kind: e.kind as LensGraphData['edges'][number]['kind'],
		weight: e.weight,
		label: e.label,
	}));

	const availableLenses: LensType[] = ['topology'];
	if (output.bridges.length > 0) availableLenses.push('bridge');
	const hasTimeline = output.evolution_chains.length > 0
		|| output.nodes.some(n => n.created_at != null);
	if (hasTimeline) availableLenses.push('timeline');

	// Resolve bridge paths
	const bridges = output.bridges.map(b => ({
		...b,
		node_path: resolve(b.node_path),
		connects: b.connects.map(c => resolve(c)) as [string, string],
	}));

	// Resolve evolution chain paths
	const evolutionChains = output.evolution_chains.map(ec => ({
		...ec,
		chain: ec.chain.map(p => resolve(p)),
	}));

	return {
		nodes,
		edges,
		availableLenses,
		clusters: output.clusters,
		bridges,
		evolutionChains,
		insights: output.insights,
	};
}
