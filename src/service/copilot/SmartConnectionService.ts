// T11Y-4b: owns the algorithm side of `smart-connections`.
//
// Before T11Y-4b the equivalent code lived inside
// `SqliteCopilotActionSemanticGraphAdapter.runSmartConnectionsLookup`,
// which mixed sqlite reads with shared-theme computation, similarity
// parsing, and top-N truncation. The split is:
//
//   - {@link SemanticLinkReadPort} owns the raw sqlite reads
//     (embedding neighbors + topic-tag lookup + indexed-doc id mapping).
//   - This service owns:
//       * resolving existing-link paths -> indexed-doc id exclusion set,
//       * shared-theme intersection (top 5),
//       * title fallback + descending-by-similarity sort,
//       * top-N truncation.
//
// The class implements
// {@link CopilotActionSemanticGraphPort.findSmartConnections} directly so
// action wiring stays untouched.

import type {
	CopilotActionSemanticGraphPort,
	SmartConnection,
} from './actions/CopilotActionPorts';
import type { SemanticLinkReadPort } from '@/core/ports/SemanticLinkReadPort';

const SMART_CONNECTION_TOP_N = 15;
const SMART_CONNECTION_NEIGHBOR_FANOUT = 20;
const SMART_CONNECTION_SHARED_THEMES_MAX = 5;

export class SmartConnectionService implements Pick<CopilotActionSemanticGraphPort, 'findSmartConnections'> {
	constructor(private readonly reads: SemanticLinkReadPort) {}

	async findSmartConnections(
		filePath: string,
		existingLinkPaths: Set<string>,
	): Promise<{ connections: SmartConnection[]; indexed: boolean }> {
		try {
			// Resolve existing-link paths to indexed-doc ids so the embedding
			// search can exclude them server-side.
			const existingPathList = [...existingLinkPaths];
			const existingDocIdMap = existingPathList.length > 0
				? await this.reads.getIndexedDocumentIdsByPaths(existingPathList)
				: new Map<string, string>();
			const excludeDocIds = new Set<string>(existingDocIdMap.values());

			const hop = await this.reads.getEmbeddingNeighbors(filePath, {
				limit: SMART_CONNECTION_NEIGHBOR_FANOUT,
				excludeDocIds,
			});
			if (!hop) return { connections: [], indexed: false };
			if (hop.neighbors.length === 0) return { connections: [], indexed: true };

			// Self tags + neighbor tags via batched topic-tag lookup.
			const selfIdMap = await this.reads.getIndexedDocumentIdsByPaths([filePath]);
			const selfId = selfIdMap.get(filePath);
			if (!selfId) return { connections: [], indexed: false };

			const neighborDocIds = hop.neighbors.map(n => n.docId);
			const tagMap = await this.reads.getTopicTagsByDocIds([selfId, ...neighborDocIds]);
			const myTags = tagMap.get(selfId) ?? new Set<string>();

			const connections: SmartConnection[] = [];
			for (const n of hop.neighbors) {
				if (!n.path) continue;
				if (n.path === filePath) continue;
				if (existingLinkPaths.has(n.path)) continue;
				const neighborTags = tagMap.get(n.docId) ?? new Set<string>();
				const sharedThemes = [...neighborTags].filter(t => myTags.has(t));
				const title = pickTitle(n.label, n.path);
				connections.push({
					path: n.path,
					title,
					similarityScore: n.similarity,
					sharedThemes: sharedThemes.slice(0, SMART_CONNECTION_SHARED_THEMES_MAX),
					suggestedLinkText: title,
				});
			}

			connections.sort((a, b) => b.similarityScore - a.similarityScore);
			return { connections: connections.slice(0, SMART_CONNECTION_TOP_N), indexed: true };
		} catch (e) {
			console.warn('[SmartConnectionService] smart connections lookup failed; reporting not-indexed:', e);
			return { connections: [], indexed: false };
		}
	}
}

function pickTitle(label: string, path: string): string {
	if (label) return label;
	const last = path.replace(/\.md$/, '').split('/').pop();
	return last || path;
}

/** Re-export so downstream callers needn't depend on action ports. */
export type { SmartConnection };
