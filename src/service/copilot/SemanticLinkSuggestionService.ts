// T11Y-4b: owns the algorithm side of `suggest-semantic-links`.
//
// Before T11Y-4b the equivalent code lived inside
// `SqliteCopilotActionSemanticGraphAdapter.runSemanticLinkLookup`, which
// mixed sqlite reads with merging, filtering, sorting, and snippet
// rendering. The split is:
//
//   - {@link SemanticLinkReadPort} owns the raw sqlite reads.
//   - This service owns:
//       * merging incoming + outgoing 1-hop semantic edges,
//       * the 0.5 fallback weight for incoming-only neighbors (carried
//         over from the previous adapter),
//       * filtering by existing-link path + self,
//       * title fallback (label -> path basename),
//       * snippet rendering ("Similarity: NN%"),
//       * descending-by-score sort and top-N truncation.
//
// The class implements the action-facing
// {@link CopilotActionSemanticGraphPort.findSemanticLinkNeighbors} method
// directly so action wiring stays untouched.

import type {
	CopilotActionSemanticGraphPort,
	SemanticLinkNeighbor,
	SmartConnection,
} from './actions/CopilotActionPorts';
import type { SemanticLinkReadPort } from '@/core/ports/SemanticLinkReadPort';
import type { SmartConnectionService } from './SmartConnectionService';

const SEMANTIC_LINK_TOP_N = 20;

export class SemanticLinkSuggestionService implements Pick<CopilotActionSemanticGraphPort, 'findSemanticLinkNeighbors'> {
	constructor(private readonly reads: SemanticLinkReadPort) {}

	async findSemanticLinkNeighbors(
		filePath: string,
		existingLinkPaths: Set<string>,
	): Promise<{ suggestions: SemanticLinkNeighbor[]; totalNeighbors: number; indexed: boolean }> {
		try {
			const hop = await this.reads.getOneHopSemanticNeighbors(filePath);
			if (!hop) return { suggestions: [], totalNeighbors: 0, indexed: false };
			if (hop.neighbors.length === 0) {
				return { suggestions: [], totalNeighbors: 0, indexed: true };
			}

			const meta = await this.reads.getGraphNodeMetaByIds(hop.neighbors.map(n => n.nodeId));

			const suggestions: SemanticLinkNeighbor[] = [];
			for (const nb of hop.neighbors) {
				const m = meta.get(nb.nodeId);
				if (!m || !m.path) continue;
				if (m.path === filePath) continue;
				if (existingLinkPaths.has(m.path)) continue;
				suggestions.push({
					path: m.path,
					title: pickTitle(m.label, m.path),
					score: nb.weight,
					direction: nb.direction,
					snippet: `Similarity: ${(nb.weight * 100).toFixed(0)}%`,
				});
			}

			suggestions.sort((a, b) => b.score - a.score);
			return {
				suggestions: suggestions.slice(0, SEMANTIC_LINK_TOP_N),
				totalNeighbors: hop.neighbors.length,
				indexed: true,
			};
		} catch (e) {
			console.warn('[SemanticLinkSuggestionService] semantic link lookup failed; reporting not-indexed:', e);
			return { suggestions: [], totalNeighbors: 0, indexed: false };
		}
	}

	/**
	 * Convenience: bundle this service with a {@link SmartConnectionService}
	 * to satisfy the full {@link CopilotActionSemanticGraphPort} surface.
	 */
	static bundle(
		links: SemanticLinkSuggestionService,
		smart: SmartConnectionService,
	): CopilotActionSemanticGraphPort {
		return {
			findSemanticLinkNeighbors: (filePath: string, existing: Set<string>) =>
				links.findSemanticLinkNeighbors(filePath, existing),
			findSmartConnections: (filePath: string, existing: Set<string>) =>
				smart.findSmartConnections(filePath, existing),
		};
	}
}

function pickTitle(label: string, path: string): string {
	if (label) return label;
	const last = path.replace(/\.md$/, '').split('/').pop();
	return last || path;
}

/** Re-exported for downstream tests / callers that only need the result shape. */
export type { SemanticLinkNeighbor, SmartConnection };
