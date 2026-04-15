import type { LensGraphData } from '@/ui/component/mine/multi-lens-graph/types';

export function enrichWithCrossDomain(data: LensGraphData): LensGraphData {
	const getTopFolder = (path: string): string => {
		const parts = path.split('/');
		return parts.length > 1 ? parts[0] : '/';
	};

	const nodeGroups = new Map<string, string>();
	const enrichedNodes = data.nodes.map((n) => {
		const group = getTopFolder(n.path);
		nodeGroups.set(n.path, group);
		return { ...n, group };
	});

	const enrichedEdges = data.edges.map((e) => {
		const srcGroup = nodeGroups.get(e.source);
		const tgtGroup = nodeGroups.get(e.target);
		if (srcGroup && tgtGroup && srcGroup !== tgtGroup) {
			return { ...e, kind: 'cross-domain' as const };
		}
		return e;
	});

	const nodeGroupConnections = new Map<string, Set<string>>();
	for (const e of enrichedEdges) {
		const srcGroup = nodeGroups.get(e.source);
		const tgtGroup = nodeGroups.get(e.target);
		if (!nodeGroupConnections.has(e.source)) nodeGroupConnections.set(e.source, new Set());
		if (!nodeGroupConnections.has(e.target)) nodeGroupConnections.set(e.target, new Set());
		if (srcGroup) nodeGroupConnections.get(e.source)!.add(srcGroup);
		if (tgtGroup) nodeGroupConnections.get(e.source)!.add(tgtGroup);
		if (srcGroup) nodeGroupConnections.get(e.target)!.add(srcGroup);
		if (tgtGroup) nodeGroupConnections.get(e.target)!.add(tgtGroup);
	}

	const finalNodes = enrichedNodes.map((n) => {
		const groups = nodeGroupConnections.get(n.path);
		if (groups && groups.size >= 2 && n.role !== 'root' && n.role !== 'hub') {
			return { ...n, role: 'bridge' as const };
		}
		return n;
	});

	const availableLenses = [...new Set([...data.availableLenses, 'bridge' as const])] as LensGraphData['availableLenses'];

	return { nodes: finalNodes, edges: enrichedEdges, availableLenses };
}
