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

	// Fetch FTS hits for the title (ask for more than limit so we can filter)
	// Wrap title in quotes for exact phrase match in FTS5
	const ftsTerm = `"${title.replace(/"/g, '""')}"`;
	const ftsResults = docChunkRepo.searchFts(ftsTerm, limit * 3);

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
		if (alreadyLinkedPaths.has(hit.path)) continue;
		if (seen.has(hit.path)) continue;
		seen.add(hit.path);

		// bm25 from FTS5 is negative: more negative = better match; normalize to 0-1
		const bm25 = hit.bm25 ?? 0;
		// bm25 is negative for matches; clamp to [-10, 0] and invert
		const score = Math.min(1, Math.max(0, -bm25 / 10));

		results.push({
			path: hit.path,
			label: hit.title ?? fileName,
			contextSnippet: hit.content ?? '',
			score,
		});

		if (results.length >= limit) break;
	}

	return results;
}
