import type { SearchQuery, SearchResultItem } from '@/service/search/types';
import type { AmbientContext, AmbientPushItem, AmbientSignal } from './types';
import { generateExplanation } from './RelevanceExplainer';
import { AppContext } from '@/app/context/AppContext';
import type { CoCitationResult } from '@/service/search/coCitationService';

const DEDUP_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Extract matched terms from FTS5 highlight markup.
 * FTS5 wraps matched terms in `<mark>` tags. Returns unique terms >= 3 chars.
 */
function extractHighlightTerms(highlight: string): string[] {
	const regex = /<mark>([^<]+)<\/mark>/g;
	const terms = new Set<string>();
	let match: RegExpExecArray | null;
	while ((match = regex.exec(highlight)) !== null) {
		const term = match[1].trim().toLowerCase();
		if (term.length >= 3) {
			terms.add(term);
		}
	}
	return [...terms];
}

/**
 * Detect shared tags between source document and a result.
 * Uses the graph's topic/keyword tags from GraphRepo.getTagsByDocIds().
 */
export function detectSharedTags(
	sourceTags: Set<string>,
	resultTags: string[],
): AmbientSignal[] {
	const signals: AmbientSignal[] = [];
	for (const tag of resultTags) {
		if (sourceTags.has(tag)) {
			signals.push({ type: 'shared_tag', tag });
		}
	}
	return signals;
}

/**
 * Detect if a result path is a graph neighbor of the source.
 * Returns the signal with hop distance and bridge note (for 2-hop).
 *
 * @param resultPath - The file path of the search result
 * @param directNeighbors - Set of 1-hop neighbor paths
 * @param twoHopBridgeMap - Map of 2-hop neighbor path → bridge note title
 */
export function detectGraphNeighborSignal(
	resultPath: string,
	directNeighbors: Set<string>,
	twoHopBridgeMap: Map<string, string>,
): AmbientSignal | null {
	if (directNeighbors.has(resultPath)) {
		return { type: 'graph_neighbor', hop: 1 };
	}
	const bridge = twoHopBridgeMap.get(resultPath);
	if (bridge !== undefined) {
		return { type: 'graph_neighbor', hop: 2, via: bridge || undefined };
	}
	return null;
}

/**
 * Detect co-citation signal for a result path.
 */
export function detectCoCitationSignal(
	resultPath: string,
	coCitations: CoCitationResult[],
): AmbientSignal | null {
	const match = coCitations.find((c) => c.path === resultPath);
	if (match && match.citingNotes.length > 0) {
		return { type: 'co_citation', citingNote: match.citingNotes[0] };
	}
	return null;
}

/**
 * Detect hub membership signal — both source and result belong to the same hub.
 *
 * @param resultPath - path of the candidate result
 * @param sharedHubNames - hub labels that contain both source and result
 */
export function detectHubMemberSignal(
	resultPath: string,
	sharedHubNames: Map<string, string>,
): AmbientSignal | null {
	const hubName = sharedHubNames.get(resultPath);
	if (hubName) {
		return { type: 'hub_member', hubName };
	}
	return null;
}

/**
 * Run an ambient search against the vault and return filtered, scored push items.
 *
 * @param context - Current ambient context extracted from the editor
 * @param maxItems - Maximum number of items to return
 * @param pushHistory - Map of filePath → last push timestamp for dedup
 */
export async function ambientSearch(
	context: AmbientContext,
	maxItems: number,
	pushHistory: Map<string, number>,
): Promise<AmbientPushItem[]> {
	const searchClient = AppContext.getSearchClient();

	const query: SearchQuery = {
		text: context.currentParagraph,
		scopeMode: 'vault',
		scopeValue: { currentFilePath: context.filePath },
		topK: 15,
		searchMode: 'fulltext',
		excludeFolderPrefixes: ['Hub-Summaries', 'ChatFolder'],
		indexTenant: 'vault',
	};

	const response = await searchClient.search(query);

	const now = Date.now();
	const existingOutlinksLower = new Set(
		context.existingOutlinks.map((l) => l.toLowerCase()),
	);

	const items: AmbientPushItem[] = [];

	for (const result of response.items) {
		if (items.length >= maxItems) break;

		// Skip self
		if (result.path === context.filePath) continue;

		// Skip already-linked notes (compare basenames)
		const basename = result.path
			.replace(/^.*\//, '')
			.replace(/\.md$/, '')
			.toLowerCase();
		if (existingOutlinksLower.has(basename)) continue;

		// Skip recently pushed (dedup window)
		const lastPushed = pushHistory.get(result.path);
		if (lastPushed && now - lastPushed < DEDUP_WINDOW_MS) continue;

		// Detect signals — Phase 1: text_overlap only
		const signals: AmbientSignal[] = [];
		const highlightText = result.highlight?.text ?? '';
		if (highlightText) {
			const terms = extractHighlightTerms(highlightText);
			if (terms.length > 0) {
				signals.push({ type: 'text_overlap', terms });
			}
		}

		const explanation = generateExplanation(signals);

		items.push({
			filePath: result.path,
			title: result.title,
			excerpt: highlightText || result.title,
			score: result.finalScore ?? result.score ?? 0,
			explanation,
			explanationType: 'template',
			signals,
			timestamp: now,
		});
	}

	return items;
}
