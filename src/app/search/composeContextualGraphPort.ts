import type { AppContext } from '@/app/context/AppContext';
import type {
	ContextualGraphPort,
	ContextualGraphEdge,
	ContextualGraphNode,
	ContextualHubRef,
	ContextualSourceRef,
	DocumentGraphContext,
} from '@/core/ports/ContextualGraphPort';
import {
	getConnectedLinks,
	getDiscoveredConnections,
	getHubsForDoc,
} from '@/service/search/inspectorService';
import { composeFileAtlasHost } from '@/app/file-atlas/composeFileAtlasHost';
import type { AtlasGraphData } from '@/ui/view/file-atlas/FileAtlasHostPort';

interface CandidateHubAccumulator {
	path: string;
	label: string;
	confidence: number;
}

export function composeContextualGraphPort(appContext: AppContext): ContextualGraphPort {
	const atlas = composeFileAtlasHost(appContext);

	return {
		async loadDocumentContext(filePath: string): Promise<DocumentGraphContext> {
			const [primary, connected, discovered, neighborhood] = await Promise.all([
				getHubsForDoc(filePath),
				getConnectedLinks(filePath),
				getDiscoveredConnections(filePath, 8),
				atlas.loadNeighborhood?.(filePath, { hops: 1, semantic: true })
					?? Promise.resolve<AtlasGraphData>({ nodes: [], hubAnchors: [], edges: [] }),
			]);

			const primaryPaths = new Set(primary.map((hub) => hub.path));
			const candidateByPath = new Map<string, CandidateHubAccumulator>();
			await Promise.all(discovered.slice(0, 6).map(async (item) => {
				const hubs = await getHubsForDoc(item.path);
				for (const hub of hubs) {
					if (primaryPaths.has(hub.path)) continue;
					const current = candidateByPath.get(hub.path);
					if (current && current.confidence >= item.score) continue;
					candidateByPath.set(hub.path, {
						path: hub.path,
						label: hub.label,
						confidence: item.score,
					});
				}
			}));

			const hubs: ContextualHubRef[] = [
				...primary.map((hub): ContextualHubRef => ({
					...hub,
					status: 'primary',
					confidence: null,
				})),
				...[...candidateByPath.values()]
					.sort((left, right) => right.confidence - left.confidence)
					.slice(0, 3)
					.map((hub): ContextualHubRef => ({
						...hub,
						status: 'candidate',
					})),
			];

			const sourceKeys = new Set<string>();
			const sources: ContextualSourceRef[] = [];
			for (const link of connected) {
				const key = `${link.direction}:${link.path}`;
				if (sourceKeys.has(key)) continue;
				sourceKeys.add(key);
				sources.push({
					path: link.path,
					label: link.label,
					direction: link.direction === 'in' ? 'source' : 'outgoing',
				});
			}

			const currentNodeId = neighborhood.nodes.find((node) => node.path === filePath)?.id ?? filePath;
			const nodes: ContextualGraphNode[] = neighborhood.nodes.map((node) => ({
				id: node.id,
				label: node.label,
				path: node.path ?? null,
				role: node.id === currentNodeId
					? 'current' as const
					: node.hop === 1
						? 'neighbor' as const
						: 'bridge' as const,
			}));
			if (!nodes.some((node) => node.id === currentNodeId)) {
				nodes.push({
					id: currentNodeId,
					label: filePath.slice(filePath.lastIndexOf('/') + 1).replace(/\.md$/i, ''),
					path: filePath,
					role: 'current',
				});
			}
			const primaryHubNodeIds = new Map<string, string>();
			for (const hub of hubs.filter((item) => item.status === 'primary')) {
				const existing = nodes.find((node) => node.path === hub.path);
				if (existing) {
					existing.role = 'hub';
					primaryHubNodeIds.set(hub.path, existing.id);
					continue;
				}
				const hubNodeId = `hub:${hub.path}`;
				nodes.push({
					id: hubNodeId,
					label: hub.label,
					path: hub.path,
					role: 'hub',
				});
				primaryHubNodeIds.set(hub.path, hubNodeId);
			}

			const edges: ContextualGraphEdge[] = neighborhood.edges.map((edge) => ({
				source: edge.from,
				target: edge.to,
				kind: edge.kind === 'hub_constituent' ? 'hub' : edge.kind,
				directionality: edge.directionality ?? 'directed',
			}));
			for (const hub of hubs.filter((item) => item.status === 'primary')) {
				const hubNodeId = primaryHubNodeIds.get(hub.path);
				if (!hubNodeId || hubNodeId === currentNodeId) continue;
				edges.push({
					source: hubNodeId,
					target: currentNodeId,
					kind: 'hub',
					directionality: 'directed',
				});
			}

			const orphanStatus = connected.length > 0
				? 'connected'
				: discovered.length > 0 || hubs.length > 0
					? 'soft-orphan'
					: 'orphan';

			return {
				filePath,
				hubs,
				sources: sources.slice(0, 8),
				nodes,
				edges,
				orphanStatus,
			};
		},
	};
}
