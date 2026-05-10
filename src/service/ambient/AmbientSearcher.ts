import type { SearchQuery, SearchResultItem } from '@/service/search/types';
import type { AmbientContext, AmbientPushItem, AmbientPushSettings, AmbientSignal } from './types';
import { generateExplanation } from './RelevanceExplainer';
import { AppContext } from '@/app/context/AppContext';
import { serendipitySearch } from './SerendipitySearcher';
import { getLearnedPatterns, getPatternBoost, type LearnedPattern } from './PatternLearner';

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
	settings?: AmbientPushSettings,
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

	// Load learned patterns for score boosting (Phase 3)
	let learnedPatterns: LearnedPattern[] = [];
	if (settings?.feedbackLearning !== false) {
		try {
			learnedPatterns = await getLearnedPatterns();
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
			title: result.title,
			excerpt: highlightText || result.title,
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
			const serendipityItems = await serendipitySearch(
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
