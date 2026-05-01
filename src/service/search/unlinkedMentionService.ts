/**
 * Unlinked mention service: finds notes that mention the current note's title
 * in their body text but do not have an explicit wiki-link to it.
 */

import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { getIndexTenantForPath } from '@/service/search/index/indexService';
import { GraphEdgeType } from '@/core/po/graph.po';

export interface UnlinkedMention {
	path: string;
	label: string;
	contextSnippet: string;
	score: number;
}

/**
 * Get notes that mention the current note's title as plain text (no wiki link).
 */
export async function getUnlinkedMentions(
	currentPath: string,
	limit = 10,
): Promise<UnlinkedMention[]> {
	// Derive title from path (strip folder prefix + .md extension)
	const fileName = currentPath.split('/').pop() ?? currentPath;
	const title = fileName.replace(/\.md$/i, '');

	if (title.length < 3) return [];

	const tenant = getIndexTenantForPath(currentPath);
	const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
	const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
	const docChunkRepo = sqliteStoreManager.getDocChunkRepo(tenant);

	const docMeta = await indexedDocumentRepo.getByPath(currentPath);

	// Split title into words; use OR for broader matching, but require at least
	// half the words to match (via multiple queries: exact phrase first, then OR).
	const words = title.split(/[\s\-_]+/).filter((w) => w.length >= 2);
	// Try exact phrase first, then fall back to OR of individual words
	const exactTerm = `"${title.replace(/"/g, '""')}"`;
	const orTerm = words.length >= 2
		? words.map((w) => `"${w.replace(/"/g, '""')}"`).join(' OR ')
		: exactTerm;

	let ftsResults = docChunkRepo.searchFts(exactTerm, limit * 3);
	// If exact phrase yields too few results, supplement with OR query
	if (ftsResults.length < limit && orTerm !== exactTerm) {
		const orResults = docChunkRepo.searchFts(orTerm, limit * 3);
		const seenPaths = new Set(ftsResults.map((r) => r.path));
		for (const r of orResults) {
			if (!seenPaths.has(r.path)) {
				ftsResults.push(r);
				seenPaths.add(r.path);
			}
		}
	}

	if (!ftsResults.length) return [];

	// Build set of paths already linked to this document (if docMeta exists)
	const alreadyLinkedPaths = new Set<string>();
	if (docMeta) {
		// Get all edges incoming to this doc (from_node_id -> docMeta.id) of type 'references'
		const incomingEdges = await mobiusEdgeRepo.getByToNodesAndTypes(
			[docMeta.id],
			[GraphEdgeType.References],
		);
		// Resolve from_node_ids to paths
		const fromNodeIds = incomingEdges.map((e) => e.from_node_id);
		if (fromNodeIds.length) {
			const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
			const nodesMap = await mobiusNodeRepo.getByIds(fromNodeIds);
			for (const node of nodesMap.values()) {
				if (node.path) alreadyLinkedPaths.add(node.path);
			}
		}
	}

	const seen = new Set<string>();
	const results: UnlinkedMention[] = [];

	for (const hit of ftsResults) {
		if (!hit.path || hit.path === currentPath) continue;
		// Skip hub docs (system-generated, not user content)
		if (hit.path.includes('Hub-Summaries/')) continue;
		if (alreadyLinkedPaths.has(hit.path)) continue;
		if (seen.has(hit.path)) continue;
		seen.add(hit.path);

		// bm25 from FTS5 is negative: more negative = better match; normalize to 0-1
		const bm25 = hit.bm25 ?? 0;
		// bm25 is negative for matches; clamp to [-10, 0] and invert
		const score = Math.min(1, Math.max(0, -bm25 / 10));

		// Derive display label from the matched note's path (not the source note)
		const matchedFileName = hit.path.split('/').pop()?.replace(/\.md$/i, '') ?? hit.path;
		results.push({
			path: hit.path,
			label: hit.title ?? matchedFileName,
			contextSnippet: hit.content ?? '',
			score,
		});

		if (results.length >= limit) break;
	}

	return results;
}
