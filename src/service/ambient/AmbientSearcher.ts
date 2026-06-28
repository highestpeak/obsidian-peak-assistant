// T8: pure ambient-search orchestrator. The pipeline that previously
// reached `AppContext.getSearchClient()`, `getLearnedPatterns()`
// (sqlite-backed module cache), and `serendipitySearch(...)`
// (sqlite-backed graph traversal) now consumes those through an
// `AmbientSearchDeps` parameter. The runtime composition
// (`src/app/ambient/composeAmbientRuntime`) builds the deps from
// adapters; this file owns NO infrastructure.
//
// Signal-detection helpers are still exported because
// `test/ambient-push.test.ts` covers them directly.

import type { SearchQuery, SearchResultItem } from '@/core/search/searchTypes';
import type { AmbientContext, AmbientPushItem, AmbientPushSettings, AmbientSignal } from '@/core/types/ambient';
import { generateExplanation } from './RelevanceExplainer';
import { getPatternBoost, type LearnedPattern } from './PatternLearner';
import type { AmbientSearchDeps } from './ports/AmbientPorts';

const DEDUP_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

// --- Signal detection helpers (Phase 2) ---

/** Co-citation result shape (from coCitationService). */
interface CoCitationResult {
	nodeId: string;
	path: string;
	label: string;
	citingNotes: string[];
	score: number;
}

/**
 * Detect shared tags between source document and a result.
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
		return { type: 'graph_neighbor', hop: 2, via: bridge };
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

function getResultTitle(result: SearchResultItem): string {
	if (typeof result.title === 'string' && result.title.trim()) return result.title;
	const filename = result.path.replace(/^.*\//, '').replace(/\.md$/, '');
	return filename || result.path;
}

function getResultExcerpt(result: SearchResultItem, highlightText: string, title: string): string {
	if (highlightText.trim()) return highlightText;
	if (typeof result.content === 'string' && result.content.trim()) {
		return result.content.trim().slice(0, 180);
	}
	return title;
}

/**
 * Run an ambient search against the vault and return filtered, scored push items.
 *
 * @param deps    - Infrastructure surface (vault search, learned patterns, serendipity)
 * @param context - Current ambient context extracted from the editor
 * @param maxItems - Maximum number of items to return
 * @param pushHistory - Map of filePath → last push timestamp for dedup
 */
export async function ambientSearch(
	deps: AmbientSearchDeps,
	context: AmbientContext,
	maxItems: number,
	pushHistory: ReadonlyMap<string, number>,
	settings?: AmbientPushSettings,
): Promise<AmbientPushItem[]> {
	const query: SearchQuery = {
		text: context.currentParagraph,
		scopeMode: 'vault',
		scopeValue: { currentFilePath: context.filePath },
		topK: 15,
		searchMode: 'fulltext',
		excludeFolderPrefixes: ['Hub-Summaries', 'ChatFolder'],
		indexTenant: 'vault',
	};

	const response = await deps.searchVault(query);

	const now = Date.now();
	const existingOutlinksLower = new Set(
		context.existingOutlinks.map((l) => l.toLowerCase()),
	);

	// Load learned patterns for score boosting (Phase 3)
	let learnedPatterns: LearnedPattern[] = [];
	if (settings?.feedbackLearning !== false) {
		try {
			learnedPatterns = await deps.getLearnedPatterns();
		} catch {
			// Pattern learning is non-critical
		}
	}

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

		const title = getResultTitle(result);
		const excerpt = getResultExcerpt(result, highlightText, title);
		const explanation = generateExplanation(signals);

		let adjustedScore = result.finalScore ?? result.score ?? 0;

		// Pattern learning boost (Phase 3)
		if (learnedPatterns.length > 0) {
			const patternBoost = getPatternBoost(context.filePath, result.path, learnedPatterns);
			if (patternBoost > 0) {
				adjustedScore += patternBoost;
			}
		}

		items.push({
			filePath: result.path,
			title,
			excerpt,
			score: adjustedScore,
			explanation,
			explanationType: 'template',
			signals,
			timestamp: now,
		});
	}

	// --- Serendipity injection (Phase 3) ---
	// If we have fewer than maxItems results, try to fill remaining slots with serendipity
	const serendipitySlots = Math.max(0, Math.min(1, maxItems - items.length));
	if (serendipitySlots > 0) {
		try {
			const serendipityItems = await deps.searchSerendipity(
				context,
				existingOutlinksLower,
				serendipitySlots,
			);
			// Deduplicate against existing items
			const existingPaths = new Set(items.map((i) => i.filePath));
			for (const si of serendipityItems) {
				if (!existingPaths.has(si.filePath)) {
					items.push(si);
				}
			}
		} catch {
			// Serendipity search is non-critical — fail silently
		}
	}

	return items;
}
