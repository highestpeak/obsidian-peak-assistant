/**
 * Inspector data service: connected links, discovered connections (semantic, co-citation, unlinked mentions).
 * Uses sqliteStoreManager and search-graph-inspector helpers.
 */

import type { IndexTenant } from '@/core/storage/sqlite/types';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { getPathFromNode } from '@/service/tools/search-graph-inspector/common';
import { getIndexTenantForPath } from '@/service/search/index/indexService';
import { SemanticRelatedEdgesReadService } from '@/service/search/index/helper/semanticRelatedEdges';
import { GraphEdgeType, GraphNodeType } from '@/core/types/graph';

const LINKS_LIMIT = 300;
const SEMANTIC_LIMIT = 20;

// ─── ConnectedLinks ──────────────────────────────────────────────────────────

export interface ConnectedLink {
	path: string;
	label: string;
	/** 'out' = outgoing link, 'in' = backlink */
	direction: 'out' | 'in';
	/** Text surrounding the [[link]] mention; null if not stored in edge attributes */
	contextSnippet: string | null;
	/** Incoming-link count for this note (convergence signal) */
	convergenceCount: number;
	/** Query relevance score (0-1); null when no query provided */
	relevanceScore: number | null;
}

/**
 * Returns a flat merged list of connected notes (outgoing + incoming) with direction badges.
 */
export async function getConnectedLinks(currentPath: string): Promise<ConnectedLink[]> {
	const tenant: IndexTenant = getIndexTenantForPath(currentPath);
	const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
	const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
	const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);

	const docMeta = await indexedDocumentRepo.getByPath(currentPath);
	if (!docMeta) return [];

	const allEdges = await mobiusEdgeRepo.getAllEdgesForNode(docMeta.id, LINKS_LIMIT);

	// Only keep wiki-link edges (references / references_resource) for CONNECTED section
	const LINK_TYPES: ReadonlySet<string> = new Set([GraphEdgeType.References, GraphEdgeType.ReferencesResource]);
	const edges = allEdges.filter((e) => LINK_TYPES.has(e.type));

	// Separate with context stored in edge attributes
	const outEdges = edges.filter((e) => e.from_node_id === docMeta.id);
	const inEdges = edges.filter((e) => e.to_node_id === docMeta.id);

	const outIds = outEdges.map((e) => e.to_node_id);
	const inIds = inEdges.map((e) => e.from_node_id);
	const allIds = [...new Set([...outIds, ...inIds])];
	const nodesMap = await mobiusNodeRepo.getByIds(allIds);

	// Build context snippet lookup: nodeId -> snippet from edge attributes
	const contextByNodeId = new Map<string, string | null>();
	for (const e of [...outEdges, ...inEdges]) {
		const neighborId = e.from_node_id === docMeta.id ? e.to_node_id : e.from_node_id;
		if (contextByNodeId.has(neighborId)) continue;
		let snippet: string | null = null;
		try {
			const attrs = JSON.parse(e.attributes || '{}') as { context?: string };
			snippet = attrs.context ?? null;
		} catch {
			snippet = null;
		}
		contextByNodeId.set(neighborId, snippet);
	}

	const result: ConnectedLink[] = [];
	const outIdSet = new Set(outIds);
	const inIdSet = new Set(inIds);

	for (const node of nodesMap.values()) {
		// Only show real user documents — exclude hub_doc, tags, folders, etc.
		if (node.type !== GraphNodeType.Document || !node.label) continue;
		const path = getPathFromNode(node);
		if (!path) continue;
		const contextSnippet = contextByNodeId.get(node.id) ?? null;
		const convergenceCount = (node as { doc_incoming_cnt?: number | null }).doc_incoming_cnt ?? 0;

		if (outIdSet.has(node.id)) {
			result.push({ path, label: node.label, direction: 'out', contextSnippet, convergenceCount, relevanceScore: null });
		}
		if (inIdSet.has(node.id)) {
			result.push({ path, label: node.label, direction: 'in', contextSnippet, convergenceCount, relevanceScore: null });
		}
	}

	return result;
}

/**
 * Fast keyword-based scoring of ConnectedLink list — no DB calls.
 * If query is empty, returns links as-is with relevanceScore = null.
 * Otherwise scores each link by keyword occurrence (title 2pt, context 1pt),
 * normalizes to 0-1, and sorts descending.
 */
export function filterLinksByQuery(links: ConnectedLink[], query: string): ConnectedLink[] {
	const trimmed = query.trim();
	if (!trimmed) return links;

	const keywords = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
	if (!keywords.length) return links;

	const scored = links.map((link) => {
		let raw = 0;
		const titleLower = link.label.toLowerCase();
		const contextLower = (link.contextSnippet ?? '').toLowerCase();
		for (const kw of keywords) {
			if (titleLower.includes(kw)) raw += 2;
			if (contextLower.includes(kw)) raw += 1;
		}
		const maxPossible = keywords.length * 3;
		const relevanceScore = maxPossible > 0 ? raw / maxPossible : 0;
		return { ...link, relevanceScore };
	});

	return scored.sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));
}

// ─── Hubs ────────────────────────────────────────────────────────────────────

export interface HubForDoc {
	path: string;
	label: string;
}

/**
 * Returns hub docs that contain the given doc path as a constituent.
 * Reads from hub_constituent + resolves labels via mobius_node.
 */
export async function getHubsForDoc(currentPath: string): Promise<HubForDoc[]> {
	const tenant: IndexTenant = getIndexTenantForPath(currentPath);
	const hubConstituentRepo = sqliteStoreManager.getHubConstituentRepo();
	const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);

	const hubs = await hubConstituentRepo.findHubsForMembers([currentPath]);
	if (!hubs.length) return [];

	const nodeIds = hubs.map((h) => h.hub_node_id);
	const nodesMap = await mobiusNodeRepo.getByIds(nodeIds);

	return hubs.map((hub) => {
		const node = nodesMap.get(hub.hub_node_id);
		const label = node?.label
			|| hub.hub_path.split('/').pop()?.replace(/\.md$/, '')
			|| hub.hub_path;
		return { path: hub.hub_path, label };
	});
}

/**
 * T7 (2026-07-07 hub graph subview): return the member vault paths for a hub.
 * Used by `useOpenHubGraphSubview` to pin the Vault Search result set to a
 * specific hub's constituents. Thin wrapper over
 * `HubConstituentRepo.getMembersForHub` — kept here so hooks import the
 * inspector-service surface uniformly, matching `getHubReferencesForDoc`.
 */
export async function getHubMembers(hubNodeId: string): Promise<string[]> {
	const hubConstituentRepo = sqliteStoreManager.getHubConstituentRepo();
	const rows = await hubConstituentRepo.getMembersForHub(hubNodeId);
	const seen = new Set<string>();
	const paths: string[] = [];
	for (const row of rows) {
		if (!row.member_path || seen.has(row.member_path)) continue;
		seen.add(row.member_path);
		paths.push(row.member_path);
	}
	return paths;
}

// ─── DiscoveredConnections ───────────────────────────────────────────────────

import { getCoCitations } from './coCitationService';
import { getUnlinkedMentions } from './unlinkedMentionService';

export interface DiscoveredConnection {
	path: string;
	label: string;
	type: 'SEM' | 'CO-CITE' | 'UNLINKED';
	score: number;
	whyText: string;
}

/**
 * Returns discovered (non-explicit) connections for a note:
 * semantic similarity, co-citation, and unlinked mentions.
 * Results are merged, deduped by path (highest score wins), sorted by score DESC.
 */
export async function getDiscoveredConnections(
	currentPath: string,
	limit = 15,
): Promise<DiscoveredConnection[]> {
	const tenant: IndexTenant = getIndexTenantForPath(currentPath);
	const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo(tenant);

	const docMeta = await indexedDocumentRepo.getByPath(currentPath);

	const [semItems, coCiteItems, unlinkedItems] = await Promise.all([
		docMeta
			? SemanticRelatedEdgesReadService.loadGraphSemanticLinkItems(docMeta.id, tenant, SEMANTIC_LIMIT)
			: Promise.resolve([]),
		getCoCitations(currentPath, 10),
		getUnlinkedMentions(currentPath, 10),
	]);

	// ── Per-source raw items ──────────────────────────────────────────────
	const semRaw = semItems.map((g) => ({
		path: g.path,
		label: g.label,
		type: 'SEM' as const,
		rawScore: parseFloat(String(g.similarity ?? '0').replace(/%/, '')) / 100,
		whyText: 'Content similarity',
	}));
	const coCiteRaw = coCiteItems.map((c) => ({
		path: c.path,
		label: c.label,
		type: 'CO-CITE' as const,
		rawScore: c.score, // already normalized within source (weighted_score / max)
		whyText: `Both cited by: ${c.citingNotes.slice(0, 3).join(', ')}`,
	}));
	const unlinkedRaw = unlinkedItems.map((u) => ({
		path: u.path,
		label: u.label,
		type: 'UNLINKED' as const,
		rawScore: u.score,
		whyText: u.contextSnippet,
	}));

	// ── Min-max normalize each source to [0,1] ──────────────────────────
	function normalizeScores<T extends { rawScore: number }>(items: T[]): (T & { normScore: number })[] {
		if (!items.length) return [];
		const min = Math.min(...items.map((i) => i.rawScore));
		const max = Math.max(...items.map((i) => i.rawScore));
		const range = max - min || 1;
		return items.map((i) => ({ ...i, normScore: (i.rawScore - min) / range }));
	}

	const allNormalized = [
		...normalizeScores(semRaw),
		...normalizeScores(coCiteRaw),
		...normalizeScores(unlinkedRaw),
	];

	// ── Multi-source fusion: combine scores when same path appears in multiple sources ──
	const byPath = new Map<string, {
		label: string;
		types: Set<string>;
		totalScore: number;
		bestType: DiscoveredConnection['type'];
		bestWhyText: string;
		bestNorm: number;
	}>();

	for (const item of allNormalized) {
		if (!item.path) continue;
		if (item.path.includes('Hub-Summaries/')) continue;
		const cur = byPath.get(item.path);
		if (!cur) {
			byPath.set(item.path, {
				label: item.label,
				types: new Set([item.type]),
				totalScore: item.normScore,
				bestType: item.type,
				bestWhyText: item.whyText,
				bestNorm: item.normScore,
			});
		} else {
			cur.types.add(item.type);
			// Multi-source bonus: add 0.7× of the secondary source score
			cur.totalScore += item.normScore * 0.7;
			if (item.normScore > cur.bestNorm) {
				cur.bestNorm = item.normScore;
				cur.bestType = item.type;
				cur.bestWhyText = item.whyText;
				cur.label = item.label;
			}
		}
	}

	return [...byPath.values()]
		.map((v): DiscoveredConnection => ({
			path: [...byPath.entries()].find(([, val]) => val === v)![0],
			label: v.label,
			type: v.bestType,
			score: Math.min(1, v.totalScore),
			whyText: v.types.size > 1
				? `${v.bestWhyText} (+${[...v.types].filter((t) => t !== v.bestType).join(', ')})`
				: v.bestWhyText,
		}))
		.sort((a, b) => b.score - a.score)
		.slice(0, limit);
}
