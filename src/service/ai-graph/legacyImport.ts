import type { LensGraphData } from '@/core/types/lens-graph';
import type { CreateAIGraphRequest } from './AIGraphArtifactRuntime';
import type {
	AIGraphEvidenceRef,
	AIGraphNode,
	AIGraphSource,
} from './domain';
import { resolveLensRelationDefaults } from './AIGraphDefaults';

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

export function stableAIGraphId(prefix: string, value: string): string {
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
			active: true,
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
	resolvedSources?: readonly AIGraphSource[];
	webResearch?: {
		query: string;
		answer: string;
		sources: ReadonlyArray<{ id: string; url: string; title: string }>;
	} | null;
	runId?: string;
	capturedAt?: number;
	createdFrom?: CreateAIGraphRequest['createdFrom'];
	graphType?: CreateAIGraphRequest['graphType'];
}): CreateAIGraphRequest {
	const capturedAt = input.capturedAt ?? Date.now();
	const selectedPaths = [...new Set(input.selectedPaths ?? [])]
		.filter((path) => !/^https?:\/\//i.test(path));
	const inferredVaultPaths = input.graphData.nodes
		.filter((node) =>
			node.artifactKind === 'vault-document'
			|| (!node.artifactKind && /\.md$/i.test(node.path)))
		.map((node) => node.path)
		.filter(Boolean);
	const sourcePaths = selectedPaths.length > 0
		? selectedPaths
		: [...new Set(inferredVaultPaths)];
	const sources: AIGraphSource[] = [
		...(input.resolvedSources ?? []).map((source) => ({ ...source })),
		...sourcePaths.map((path) => ({
		sourceId: stableAIGraphId('source', `vault:${path}`),
		kind: 'vault-file' as const,
		title: path.slice(path.lastIndexOf('/') + 1),
		locator: path,
		contentHash: null,
		capturedAt,
		freshness: 'unknown' as const,
		active: true,
		})),
	];
	const webEvidenceByUrl = new Map<string, { sourceId: string; evidenceId: string }>();
	for (const source of sources) {
		if (source.kind !== 'web-page') continue;
		webEvidenceByUrl.set(source.locator, {
			sourceId: source.sourceId,
			evidenceId: stableAIGraphId('evidence', `web:${source.locator}`),
		});
	}
	for (const source of input.webResearch?.sources ?? []) {
		const sourceId = stableAIGraphId('source', `web:${source.url}`);
		const evidenceId = stableAIGraphId('evidence', `web:${source.url}`);
		sources.push({
			sourceId,
			kind: 'web-page',
			title: source.title,
			locator: source.url,
			contentHash: null,
			capturedAt,
			freshness: 'current',
			active: true,
			metadata: {
				query: input.webResearch?.query ?? input.query,
				canonicalUrl: source.url,
				fetchedAt: capturedAt,
				captureStatus: 'provider-cited',
			},
		});
		webEvidenceByUrl.set(source.url, { sourceId, evidenceId });
	}
	for (const node of input.graphData.nodes) {
		if (!/^https?:\/\//i.test(node.path) || webEvidenceByUrl.has(node.path)) continue;
		const sourceId = stableAIGraphId('source', `web:${node.path}`);
		const evidenceId = stableAIGraphId('evidence', `web:${node.path}`);
		sources.push({
			sourceId,
			kind: 'web-page',
			title: node.label || node.path,
			locator: node.path,
			contentHash: null,
			capturedAt,
			freshness: 'unknown',
			active: true,
			metadata: {
				canonicalUrl: node.path,
				fetchedAt: capturedAt,
				captureStatus: 'graph-output-url-unverified',
			},
		});
		webEvidenceByUrl.set(node.path, { sourceId, evidenceId });
	}
	const sourceByLocator = new Map(sources.map((source) => [source.locator, source]));
	const evidenceById = new Map<string, AIGraphEvidenceRef>();
	for (const [url, item] of webEvidenceByUrl) {
		evidenceById.set(item.evidenceId, {
			evidenceId: item.evidenceId,
			sourceId: item.sourceId,
			selector: { kind: 'url-fragment', value: url },
			sourceContentHash: null,
			capturedAt,
		});
	}
	const captureEvidence = (
		sourcePath: string,
		quote: string,
		identity: string,
	): string | null => {
		const source = sourceByLocator.get(sourcePath);
		const exact = quote.trim();
		if (!source || !exact) return null;
		const evidenceId = stableAIGraphId(
			'evidence',
			`${identity}|${source.sourceId}|${exact}`,
		);
		evidenceById.set(evidenceId, {
			evidenceId,
			sourceId: source.sourceId,
			selector: /^https?:\/\//i.test(source.locator)
				? { kind: 'url-fragment', value: source.locator }
				: { kind: 'text-quote', exact },
			quote: exact,
			sourceContentHash: source.contentHash,
			capturedAt,
		});
		return evidenceId;
	};

	const ids = new Map<string, string>();
	let nodes: AIGraphNode[] = input.graphData.nodes.map((node) => {
		const identity = node.canonicalRef || node.path || node.label;
		const nodeId = stableAIGraphId('node', identity);
		ids.set(node.path, nodeId);
		ids.set(node.label, nodeId);
		const isWeb = /^https?:\/\//i.test(node.path);
		const webEvidence = isWeb ? webEvidenceByUrl.get(node.path) : undefined;
		const capturedEvidence = (node.evidenceQuotes ?? []).flatMap((item, index) => {
			const evidenceId = captureEvidence(
				item.sourcePath,
				item.quote,
				`node:${nodeId}:${index}`,
			);
			return evidenceId ? [evidenceId] : [];
		});
		return {
			nodeId,
			kind: node.artifactKind ?? (isWeb
				? 'web-resource' as const
				: sourceByLocator.has(node.path)
					? 'vault-document' as const
					: 'concept' as const),
			label: node.label,
			aliases: [...new Set(node.aliases ?? [])],
			...(node.summary ? { description: node.summary } : {}),
			...(node.canonicalRef
				? { canonicalRef: node.canonicalRef }
				: node.path
					? {
							canonicalRef: isWeb
								? node.path
								: sourceByLocator.has(node.path)
									? `vault://${node.path}`
									: node.path,
						}
					: {}),
			properties: {
				...(node.role ? { role: node.role } : {}),
				...(typeof node.score === 'number' ? { score: node.score } : {}),
			},
			evidenceIds: [...new Set([
				...(webEvidence ? [webEvidence.evidenceId] : []),
				...capturedEvidence,
			])],
			provenance: {
				origin: 'ai-extracted' as const,
				...(input.runId ? { runId: input.runId } : {}),
			},
			reviewStatus: 'suggested' as const,
		};
	});
	for (const source of sources.filter((candidate) => candidate.kind === 'web-page')) {
		if (ids.has(source.locator)) continue;
		const nodeId = stableAIGraphId('node', source.locator);
		const webEvidence = webEvidenceByUrl.get(source.locator);
		ids.set(source.locator, nodeId);
		ids.set(source.title, nodeId);
		nodes.push({
			nodeId,
			kind: 'web-resource',
			label: source.title,
			aliases: [],
			canonicalRef: source.locator,
			properties: {},
			evidenceIds: webEvidence ? [webEvidence.evidenceId] : [],
			provenance: {
				origin: 'ai-extracted',
				...(input.runId ? { runId: input.runId } : {}),
			},
			reviewStatus: 'suggested',
		});
	}
	for (const source of sources.filter((candidate) => candidate.kind === 'ai-graph-version')) {
		if (ids.has(source.locator)) continue;
		const nodeId = stableAIGraphId('node', source.locator);
		ids.set(source.locator, nodeId);
		ids.set(source.title, nodeId);
		nodes.push({
			nodeId,
			kind: 'custom',
			label: source.title,
			aliases: [],
			canonicalRef: source.locator,
			customType: 'ai-graph-version',
			properties: {
				graphId: String(source.metadata?.graphId ?? ''),
				versionId: String(source.metadata?.versionId ?? ''),
			},
			evidenceIds: [],
			provenance: { origin: 'deterministic' },
			reviewStatus: 'suggested',
		});
	}
	const resolvedNodes = new Map<string, AIGraphNode>();
	for (const node of nodes) {
		const previous = resolvedNodes.get(node.nodeId);
		if (!previous) {
			resolvedNodes.set(node.nodeId, node);
			continue;
		}
		resolvedNodes.set(node.nodeId, {
			...previous,
			aliases: [...new Set([
				...previous.aliases,
				...node.aliases,
				...(previous.label !== node.label ? [node.label] : []),
			])],
			description: previous.description ?? node.description,
			evidenceIds: [...new Set([...previous.evidenceIds, ...node.evidenceIds])],
			reviewStatus: 'suggested',
		});
	}
	nodes = [...resolvedNodes.values()];
	const relations = input.graphData.edges.flatMap((edge) => {
		const sourceNodeId = ids.get(edge.source);
		const targetNodeId = ids.get(edge.target);
		if (!sourceNodeId || !targetNodeId) return [];
		const semantics = resolveLensRelationDefaults(edge);
		const predicate = semantics.predicate;
		const capturedEvidence = (edge.evidenceQuotes ?? []).flatMap((item, index) => {
			const evidenceId = captureEvidence(
				item.sourcePath,
				item.quote,
				`relation:${sourceNodeId}:${predicate}:${targetNodeId}:${index}`,
			);
			return evidenceId ? [evidenceId] : [];
		});
		const relationEvidenceIds = [...new Set([
			...(nodes.find((node) => node.nodeId === sourceNodeId)?.evidenceIds ?? []),
			...(nodes.find((node) => node.nodeId === targetNodeId)?.evidenceIds ?? []),
			...capturedEvidence,
		])];
		return [{
			relationId: stableAIGraphId(
				'relation',
				`${sourceNodeId}|${predicate}|${targetNodeId}|${edge.label ?? ''}`,
			),
			sourceNodeId,
			targetNodeId,
			family: semantics.family,
			predicate,
			label: edge.label ?? edge.kind,
			directed: semantics.directed,
			qualifiers: edge.qualifiers ?? [],
			evidenceIds: relationEvidenceIds,
			confidence: typeof edge.weight === 'number' ? Math.max(0, Math.min(1, edge.weight)) : null,
			explanation: 'Generated relationship pending evidence review.',
			provenance: {
				origin: 'ai-inferred' as const,
				...(input.runId ? { runId: input.runId } : {}),
			},
			reviewStatus: 'suggested' as const,
		}];
	});
	return {
		title: input.title,
		description: input.query,
		graphType: input.graphType ?? 'free',
		createdFrom: input.createdFrom ?? {
			surface: 'ai-search',
			contextRefs: [{ kind: 'search-query', ref: input.query, label: input.query }],
		},
		prompt: input.query,
		sources: [...new Map(sources.map((source) => [source.sourceId, source])).values()],
		nodes,
		relations,
		evidence: [...evidenceById.values()],
		generation: input.runId ? { runId: input.runId } : {},
		createdAt: capturedAt,
	};
}
