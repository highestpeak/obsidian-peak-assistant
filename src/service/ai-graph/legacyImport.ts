import type { LensGraphData } from '@/core/types/lens-graph';
import type { CreateAIGraphRequest } from './AIGraphArtifactRuntime';
import type { AIGraphSource } from './domain';

function legacyNodeId(path: string, index: number): string {
	return `legacy-node-${index}-${path.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
}

function stableHash(value: string): string {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(16).padStart(8, '0');
}

function stableId(prefix: string, value: string): string {
	const slug = value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 42) || 'item';
	return `${prefix}-${slug}-${stableHash(value)}`;
}

export function legacyLensGraphToCreateRequest(input: {
	title: string;
	query: string;
	graphData: LensGraphData;
	legacyRef: string;
	capturedAt?: number;
}): CreateAIGraphRequest {
	const capturedAt = input.capturedAt ?? Date.now();
	const ids = new Map<string, string>();
	const nodes = input.graphData.nodes.map((node, index) => {
		const nodeId = legacyNodeId(node.path || node.label, index);
		ids.set(node.path, nodeId);
		return {
			nodeId,
			kind: 'vault-document' as const,
			label: node.label,
			aliases: [],
			canonicalRef: node.path ? `vault://${node.path}` : undefined,
			properties: {},
			evidenceIds: [],
			provenance: { origin: 'imported' as const },
			reviewStatus: 'suggested' as const,
		};
	});
	const relations = input.graphData.edges.flatMap((edge, index) => {
		const sourceNodeId = ids.get(edge.source);
		const targetNodeId = ids.get(edge.target);
		if (!sourceNodeId || !targetNodeId) return [];
		return [{
			relationId: `legacy-relation-${index}`,
			sourceNodeId,
			targetNodeId,
			family: edge.kind === 'temporal' ? 'temporal' as const : 'semantic' as const,
			predicate: edge.kind === 'temporal' ? 'precedes' : 'related-to',
			label: edge.label ?? edge.kind,
			directed: edge.directionality === 'directed' || edge.directionality === 'bidirectional',
			qualifiers: [],
			evidenceIds: [],
			confidence: null,
			explanation: 'Imported from a legacy AI Analysis graph without canonical evidence.',
			provenance: { origin: 'imported' as const, extractorVersion: 'legacy-import-v1' },
			reviewStatus: 'suggested' as const,
		}];
	});
	return {
		title: input.title,
		description: input.query,
		graphType: 'free',
		createdFrom: {
			surface: 'import',
			contextRefs: [{ kind: 'import', ref: input.legacyRef, label: input.title }],
		},
		prompt: input.query,
		sources: [{
			sourceId: 'legacy-source',
			kind: 'analysis-result',
			title: input.title,
			locator: input.legacyRef,
			contentHash: null,
			capturedAt,
			freshness: 'unknown',
		}],
		nodes,
		relations,
		evidence: [],
		changeKind: 'imported',
		createdAt: capturedAt,
	};
}

export function generatedLensGraphToCreateRequest(input: {
	title: string;
	query: string;
	graphData: LensGraphData;
	selectedPaths?: readonly string[];
	webResearch?: {
		query: string;
		answer: string;
		sources: ReadonlyArray<{ id: string; url: string; title: string }>;
	} | null;
	runId?: string;
	capturedAt?: number;
	createdFrom?: CreateAIGraphRequest['createdFrom'];
}): CreateAIGraphRequest {
	const capturedAt = input.capturedAt ?? Date.now();
	const ids = new Map<string, string>();
	const nodes = input.graphData.nodes.map((node) => {
		const identity = node.path || node.label;
		const nodeId = stableId('node', identity);
		ids.set(node.path, nodeId);
		const isWeb = /^https?:\/\//i.test(node.path);
		return {
			nodeId,
			kind: isWeb
				? 'web-resource' as const
				: node.path
					? 'vault-document' as const
					: 'concept' as const,
			label: node.label,
			aliases: [],
			...(node.summary ? { description: node.summary } : {}),
			...(node.path ? { canonicalRef: isWeb ? node.path : `vault://${node.path}` } : {}),
			properties: {
				...(node.role ? { role: node.role } : {}),
				...(typeof node.score === 'number' ? { score: node.score } : {}),
			},
			evidenceIds: [],
			provenance: {
				origin: 'ai-extracted' as const,
				...(input.runId ? { runId: input.runId } : {}),
			},
			reviewStatus: 'suggested' as const,
		};
	});
	const relations = input.graphData.edges.flatMap((edge) => {
		const sourceNodeId = ids.get(edge.source);
		const targetNodeId = ids.get(edge.target);
		if (!sourceNodeId || !targetNodeId) return [];
		const predicate = edge.kind === 'temporal' ? 'precedes' : 'related-to';
		return [{
			relationId: stableId(
				'relation',
				`${sourceNodeId}|${predicate}|${targetNodeId}|${edge.label ?? ''}`,
			),
			sourceNodeId,
			targetNodeId,
			family: edge.kind === 'temporal' ? 'temporal' as const : 'semantic' as const,
			predicate,
			label: edge.label ?? edge.kind,
			directed: edge.directionality === 'directed' || edge.directionality === 'bidirectional',
			qualifiers: [],
			evidenceIds: [],
			confidence: typeof edge.weight === 'number' ? Math.max(0, Math.min(1, edge.weight)) : null,
			explanation: 'Generated relationship pending evidence review.',
			provenance: {
				origin: 'ai-inferred' as const,
				...(input.runId ? { runId: input.runId } : {}),
			},
			reviewStatus: 'suggested' as const,
		}];
	});
	const selectedPaths = [...new Set(input.selectedPaths ?? [])];
	const sourcePaths = selectedPaths.length > 0
		? selectedPaths
		: [...new Set(input.graphData.nodes.map((node) => node.path).filter(Boolean))];
	const sources: AIGraphSource[] = sourcePaths.map((path) => ({
		sourceId: stableId('source', `vault:${path}`),
		kind: 'vault-file' as const,
		title: path.slice(path.lastIndexOf('/') + 1),
		locator: path,
		contentHash: null,
		capturedAt,
		freshness: 'unknown' as const,
	}));
	for (const source of input.webResearch?.sources ?? []) {
		sources.push({
			sourceId: stableId('source', `web:${source.url}`),
			kind: 'web-page',
			title: source.title,
			locator: source.url,
			contentHash: null,
			capturedAt,
			freshness: 'unknown',
			metadata: { query: input.webResearch?.query ?? input.query },
		});
	}
	return {
		title: input.title,
		description: input.query,
		graphType: 'free',
		createdFrom: input.createdFrom ?? {
			surface: 'ai-search',
			contextRefs: [{ kind: 'search-query', ref: input.query, label: input.query }],
		},
		prompt: input.query,
		sources,
		nodes,
		relations,
		evidence: [],
		generation: input.runId ? { runId: input.runId } : {},
		createdAt: capturedAt,
	};
}
