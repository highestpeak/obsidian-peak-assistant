/**
 * Builds the bounded weighted graph consumed by Louvain and structural metrics.
 *
 * Physical references dominate. Explicit tags and TextRank terms contribute
 * IDF-weighted affinities; common signals are suppressed. Semantic edge
 * weights are similarities, so larger values remain stronger (never `1 - s`).
 */

import type { AnalysisGraph, AnalysisNode, CommunitySignal } from './types';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { decodeIndexedTagsBlob } from '@/core/document/helper/TagService';
import { GraphEdgeType, GraphNodeType } from '@/core/types/graph';
import {
	DEFAULT_RESULT_GRAPH_COMMUNITY_CONFIG,
	type ResultGraphCommunityConfig,
} from './ResultGraphCommunityDefaults';
import {
	inverseDocumentFrequency,
	isEligibleCommunitySignal,
	resolveCommunityAnalysisMode,
	semanticSimilarityWeight,
} from './communityEvidence';

const INCLUDED_NODE_TYPES = [GraphNodeType.Document, GraphNodeType.HubDoc] as const;
const INCLUDED_EDGE_TYPES = [
	GraphEdgeType.References,
	GraphEdgeType.ReferencesResource,
	GraphEdgeType.SemanticRelated,
] as const;

interface SignalCandidate {
	key: string;
	label: string;
	kind: 'tag' | 'term';
}

interface PairWeight {
	from: string;
	to: string;
	weight: number;
}

export async function buildAnalysisGraph(
	config: ResultGraphCommunityConfig = DEFAULT_RESULT_GRAPH_COMMUNITY_CONFIG,
): Promise<AnalysisGraph> {
	const kdb = sqliteStoreManager.getIndexContext('vault');
	const totalRow = await kdb
		.selectFrom('mobius_node')
		.select(({ fn }) => fn.countAll<number>().as('cnt'))
		.where('type', 'in', [...INCLUDED_NODE_TYPES])
		.executeTakeFirst();
	const totalNodeCount = Number(totalRow?.cnt ?? 0);
	const bounded = totalNodeCount > config.bounds.communityNodeLimit;
	let nodeQuery = kdb
		.selectFrom('mobius_node')
		.select(['node_id', 'path', 'tags_json', 'pagerank'])
		.where('type', 'in', [...INCLUDED_NODE_TYPES])
		.orderBy('pagerank', 'desc')
		.orderBy('node_id', 'asc');
	if (bounded) nodeQuery = nodeQuery.limit(config.bounds.communityNodeLimit);
	const nodeRows = await nodeQuery.execute();

	const nodes: AnalysisNode[] = nodeRows.map((row) => ({
		id: row.node_id,
		path: row.path ?? row.node_id,
	}));
	const nodeIdSet = new Set(nodes.map((node) => node.id));
	const pairWeights = new Map<string, PairWeight>();
	const referenceEdges: Array<{ from: string; to: string }> = [];

	let afterEdgeId: string | null = null;
	for (;;) {
		let edgeQuery = kdb
			.selectFrom('mobius_edge')
			.select(['id', 'from_node_id', 'to_node_id', 'type', 'weight'])
			.where('type', 'in', [...INCLUDED_EDGE_TYPES]);
		if (afterEdgeId != null) edgeQuery = edgeQuery.where('id', '>', afterEdgeId);
		const edgeRows = await edgeQuery.orderBy('id', 'asc').limit(2_000).execute();
		if (edgeRows.length === 0) break;
		for (const edge of edgeRows) {
			if (!nodeIdSet.has(edge.from_node_id) || !nodeIdSet.has(edge.to_node_id)) continue;
			if (edge.from_node_id === edge.to_node_id) continue;
			if (edge.type === GraphEdgeType.SemanticRelated) {
				const similarity = Number(edge.weight) || 0;
				addPairWeight(
					pairWeights,
					edge.from_node_id,
					edge.to_node_id,
					semanticSimilarityWeight(similarity, config.weights.semanticSimilarity),
					config.weights.maxPairWeight,
				);
				continue;
			}
			referenceEdges.push({ from: edge.from_node_id, to: edge.to_node_id });
			addPairWeight(
				pairWeights,
				edge.from_node_id,
				edge.to_node_id,
				config.weights.reference,
				config.weights.maxPairWeight,
			);
		}
		afterEdgeId = edgeRows[edgeRows.length - 1]!.id;
	}

	const candidatesByNode = new Map<string, SignalCandidate[]>();
	const nodesBySignal = new Map<string, Set<string>>();
	const signalByKey = new Map<string, SignalCandidate>();
	for (const row of nodeRows) {
		const candidates = extractSignalCandidates(row.tags_json)
			.slice(0, config.bounds.maxSignalsPerDocument);
		candidatesByNode.set(row.node_id, candidates);
		for (const signal of candidates) {
			signalByKey.set(signal.key, signal);
			const docs = nodesBySignal.get(signal.key) ?? new Set<string>();
			docs.add(row.node_id);
			nodesBySignal.set(signal.key, docs);
		}
	}

	const signalsByNode = new Map<string, CommunitySignal[]>();
	for (const node of nodes) signalsByNode.set(node.id, []);
	for (const [key, docsSet] of nodesBySignal) {
		const docs = [...docsSet].sort();
		const support = docs.length;
		if (!isEligibleCommunitySignal({
			totalDocuments: nodes.length,
			support,
			minimumSupport: config.bounds.minimumSignalSupport,
			maximumDocuments: config.bounds.maxDocumentsPerSignal,
			maximumDocumentRatio: config.bounds.maximumSignalDocumentRatio,
		})) continue;
		const candidate = signalByKey.get(key);
		if (!candidate) continue;
		const idf = inverseDocumentFrequency(nodes.length, support);
		const signal: CommunitySignal = { ...candidate, idf };
		for (const nodeId of docs) signalsByNode.get(nodeId)?.push(signal);

		const baseWeight = candidate.kind === 'tag'
			? config.weights.explicitTagIdf
			: config.weights.textRankTermIdf;
		let pairs = 0;
		outer: for (let i = 0; i < docs.length; i++) {
			for (let j = i + 1; j < docs.length; j++) {
				addPairWeight(
					pairWeights,
					docs[i]!,
					docs[j]!,
					baseWeight * idf,
					config.weights.maxPairWeight,
				);
				pairs += 1;
				if (pairs >= config.bounds.maxPairsPerSignal) break outer;
			}
		}
	}

	const adjacency = buildBoundedAdjacency(
		nodes,
		pairWeights,
		config.bounds.maxNeighborsPerNode,
	);
	let edgeCount = 0;
	for (const [from, neighbors] of adjacency) {
		for (const to of neighbors.keys()) if (from < to) edgeCount += 1;
	}

	return {
		nodes,
		adjacency,
		nodeCount: nodes.length,
		edgeCount,
		totalNodeCount,
		analysisMode: resolveCommunityAnalysisMode(totalNodeCount, config),
		signalsByNode,
		referenceEdges,
	};
}

function extractSignalCandidates(rawTags: string | null): SignalCandidate[] {
	const tags = decodeIndexedTagsBlob(rawTags);
	const explicit = [
		...tags.topicTags,
		...tags.functionalTagEntries.map((entry) => entry.id),
		...(tags.userKeywordTags ?? tags.keywordTags),
	];
	const result: SignalCandidate[] = [];
	const seen = new Set<string>();
	for (const label of explicit) pushSignal(result, seen, label, 'tag');
	for (const label of tags.textrankKeywordTerms ?? []) pushSignal(result, seen, label, 'term');
	return result;
}

function pushSignal(
	result: SignalCandidate[],
	seen: Set<string>,
	rawLabel: string,
	kind: 'tag' | 'term',
): void {
	const label = rawLabel.trim().replace(/^#/, '');
	if (!label) return;
	const key = `${kind}:${label.toLocaleLowerCase()}`;
	if (seen.has(key)) return;
	seen.add(key);
	result.push({ key, label, kind });
}

function addPairWeight(
	pairs: Map<string, PairWeight>,
	a: string,
	b: string,
	delta: number,
	cap: number,
): void {
	if (!(delta > 0) || a === b) return;
	const [from, to] = a < b ? [a, b] : [b, a];
	const key = `${from}\u0000${to}`;
	const current = pairs.get(key);
	const weight = Math.min(cap, (current?.weight ?? 0) + delta);
	pairs.set(key, { from, to, weight });
}

function buildBoundedAdjacency(
	nodes: AnalysisNode[],
	pairs: Map<string, PairWeight>,
	maxNeighbors: number,
): Map<string, Map<string, number>> {
	const candidates = new Map<string, PairWeight[]>();
	for (const node of nodes) candidates.set(node.id, []);
	for (const pair of pairs.values()) {
		candidates.get(pair.from)?.push(pair);
		candidates.get(pair.to)?.push(pair);
	}
	const allowed = new Set<string>();
	for (const [nodeId, edges] of candidates) {
		edges.sort((a, b) => b.weight - a.weight || pairKey(a).localeCompare(pairKey(b)));
		for (const edge of edges.slice(0, maxNeighbors)) allowed.add(pairKey(edge));
		if (!candidates.has(nodeId)) candidates.set(nodeId, []);
	}
	const adjacency = new Map<string, Map<string, number>>();
	for (const node of nodes) adjacency.set(node.id, new Map());
	for (const pair of pairs.values()) {
		if (!allowed.has(pairKey(pair))) continue;
		adjacency.get(pair.from)?.set(pair.to, pair.weight);
		adjacency.get(pair.to)?.set(pair.from, pair.weight);
	}
	return adjacency;
}

function pairKey(pair: PairWeight): string {
	return `${pair.from}\u0000${pair.to}`;
}
