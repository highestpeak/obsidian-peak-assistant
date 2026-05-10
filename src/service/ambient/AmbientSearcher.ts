import type { SearchQuery, SearchResultItem } from '@/service/search/types';
import type { AmbientContext, AmbientPushItem, AmbientSignal } from './types';
import { generateExplanation } from './RelevanceExplainer';
import { AppContext } from '@/app/context/AppContext';
import type { CoCitationResult } from '@/service/search/coCitationService';
import { getCoCitations } from '@/service/search/coCitationService';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { GraphNodeType } from '@/core/po/graph.po';

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

// ─── Graph context types ───────────────────────────────────────────────

/** Pre-computed graph data for signal detection (built once per search cycle). */
interface GraphSearchContext {
	/** 1-hop neighbor paths from the source document */
	directNeighbors: Set<string>;
	/** 2-hop neighbor path → bridge note label (the 1-hop intermediary) */
	twoHopBridgeMap: Map<string, string>;
	/** All graph-reachable paths (1-hop + 2-hop), for Stage 2 expansion */
	allGraphPaths: Set<string>;
	/** Source document's topic + keyword tags (from graph) */
	sourceGraphTags: Set<string>;
	/** Co-citation results for the source document */
	coCitations: CoCitationResult[];
	/** Hub membership: result path → hub name (shared with source) */
	sharedHubNames: Map<string, string>;
}

/** Pre-loaded feedback data for score adjustments. */
interface FeedbackContext {
	/** Pairs dismissed within 7 days — skip entirely */
	dismissedPairs: Set<string>;
	/** Pairs with positive actions — boost score */
	positivePairs: Map<string, number>;
	/** Pairs ignored (no action) — slight penalty */
	ignoredPairs: Map<string, number>;
}

// ─── Graph context builders ────────────────────────────────────────────

/**
 * Build graph context for the source document.
 * Makes SQLite queries in parallel: graph neighbors, tags, co-citations.
 * Total budget: ~50ms.
 */
async function buildGraphContext(
	sourceFilePath: string,
	maxHops: number,
): Promise<GraphSearchContext | null> {
	try {
		const graphRepo = sqliteStoreManager.getGraphRepo();
		const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
		const edgeRepo = sqliteStoreManager.getMobiusEdgeRepo();

		// 1. Get the source node
		const sourceNode = await mobiusNodeRepo.getByPath(sourceFilePath);
		if (!sourceNode) return null;
		const sourceNodeId = sourceNode.node_id;

		// 2. Parallel: graph neighbors + co-citations + source tags
		const [allGraphPaths, coCitations, sourceTagResult] = await Promise.all([
			graphRepo.getRelatedFilePaths({ currentFilePath: sourceFilePath, maxHops }),
			getCoCitations(sourceFilePath, 10),
			graphRepo.getTagsByDocIds([sourceNodeId]),
		]);

		// 3. Build 1-hop vs 2-hop distinction
		const oneHopPaths = await graphRepo.getRelatedFilePaths({
			currentFilePath: sourceFilePath,
			maxHops: 1,
		});
		const directNeighbors = oneHopPaths;

		// 4. Build 2-hop bridge map: for each 2-hop path, find the bridge node
		const twoHopBridgeMap = new Map<string, string>();
		for (const path of allGraphPaths) {
			if (!directNeighbors.has(path)) {
				// This is a 2-hop neighbor — mark as 2-hop without bridge for now
				twoHopBridgeMap.set(path, '');
			}
		}

		// 5. Source tags
		const sourceGraphTags = new Set<string>();
		const sourceTagEntry = sourceTagResult.idMapToTags.get(sourceNodeId);
		if (sourceTagEntry) {
			for (const t of sourceTagEntry.topicTags) sourceGraphTags.add(t);
			for (const t of sourceTagEntry.keywordTags) sourceGraphTags.add(t);
		}

		// 6. Hub membership detection — find hub_doc nodes that reference both source
		//    and candidate results. Hub docs reference their constituents via 'references' edges.
		const sourceNeighborMap = await edgeRepo.getNeighborIdsMap([sourceNodeId]);
		const sourceNeighborIds = sourceNeighborMap.get(sourceNodeId) ?? [];
		const neighborNodes = await mobiusNodeRepo.getByIds(sourceNeighborIds);
		const hubNodes = new Map<string, string>(); // hubNodeId → hubLabel
		for (const [nodeId, node] of neighborNodes) {
			if (node.type === GraphNodeType.HubDoc) {
				hubNodes.set(nodeId, node.label);
			}
		}

		// For each hub, get its outgoing references to find which results share this hub
		const sharedHubNames = new Map<string, string>();
		if (hubNodes.size > 0) {
			const hubEdges = await edgeRepo.getByFromNodesAndTypes(
				Array.from(hubNodes.keys()),
				['references'],
			);
			// Resolve constituent node paths
			const constituentIds = hubEdges.map((e) => e.to_node_id);
			const constituentNodes = await mobiusNodeRepo.getByIds(constituentIds);
			for (const edge of hubEdges) {
				const constituentNode = constituentNodes.get(edge.to_node_id);
				if (constituentNode?.attributes) {
					let nodePath: string | null = null;
					try {
						const attrs = JSON.parse(constituentNode.attributes) as { path?: string };
						nodePath = attrs.path ?? null;
					} catch {
						// ignore
					}
					if (nodePath && nodePath !== sourceFilePath) {
						const hubLabel = hubNodes.get(edge.from_node_id);
						if (hubLabel) {
							sharedHubNames.set(nodePath, hubLabel);
						}
					}
				}
			}
		}

		return {
			directNeighbors,
			twoHopBridgeMap,
			allGraphPaths,
			sourceGraphTags,
			coCitations,
			sharedHubNames,
		};
	} catch {
		// Graph data unavailable (SQLite not ready, no index yet) — fall back to FTS5-only
		return null;
	}
}

/**
 * Load feedback context from AmbientPushRepo.
 * Returns null if repo is unavailable (fail-safe).
 */
async function loadFeedbackContext(): Promise<FeedbackContext | null> {
	try {
		const repo = sqliteStoreManager.getAmbientPushRepo();
		const [dismissedPairs, positivePairs, ignoredPairs] = await Promise.all([
			repo.getDismissedPairs(7),
			repo.getPositivePairs(30),
			repo.getIgnoredPenalties(14),
		]);
		return { dismissedPairs, positivePairs, ignoredPairs };
	} catch {
		return null;
	}
}

// ─── Main search function ──────────────────────────────────────────────

/**
 * Run an ambient search against the vault and return filtered, scored push items.
 *
 * @param context - Current ambient context extracted from the editor
 * @param maxItems - Maximum number of items to return
 * @param pushHistory - Map of filePath → last push timestamp for dedup
 * @param settings - Phase 2 settings for graph expansion and feedback learning
 */
export async function ambientSearch(
	context: AmbientContext,
	maxItems: number,
	pushHistory: Map<string, number>,
	settings?: { graphExpansionHops?: number; feedbackLearning?: boolean },
): Promise<AmbientPushItem[]> {
	const searchClient = AppContext.getSearchClient();

	// --- Stage 1: FTS5 search (Phase 1) ---
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

	// --- Stage 2: Graph expansion (Phase 2) ---
	const graphHops = settings?.graphExpansionHops ?? 0;
	const [graphCtx, feedbackCtx] = await Promise.all([
		graphHops > 0 ? buildGraphContext(context.filePath, graphHops) : null,
		settings?.feedbackLearning ? loadFeedbackContext() : null,
	]);

	// If graph context available, fetch graph neighbors not in Stage 1 results
	let graphOnlyPaths: string[] = [];
	if (graphCtx) {
		const ftsPathSet = new Set(response.items.map((r) => r.path));
		graphOnlyPaths = Array.from(graphCtx.allGraphPaths).filter(
			(p) => !ftsPathSet.has(p) && p !== context.filePath,
		);
	}

	// Fetch tags for all candidate result paths (for shared_tag detection)
	let resultPathToTags = new Map<string, string[]>();
	if (graphCtx && graphCtx.sourceGraphTags.size > 0) {
		const allCandidatePaths = [
			...response.items.map((r) => r.path),
			...graphOnlyPaths,
		];
		try {
			const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
			const nodeRows = await Promise.all(
				allCandidatePaths.slice(0, 30).map((p) => mobiusNodeRepo.getByPath(p)),
			);
			const validNodeIds = nodeRows
				.filter((n): n is NonNullable<typeof n> => n !== null)
				.map((n) => ({ id: n.node_id, path: n.path }));
			if (validNodeIds.length > 0) {
				const graphRepo = sqliteStoreManager.getGraphRepo();
				const tagResult = await graphRepo.getTagsByDocIds(validNodeIds.map((n) => n.id));
				for (const { id, path } of validNodeIds) {
					if (!path) continue;
					const entry = tagResult.idMapToTags.get(id);
					if (entry) {
						resultPathToTags.set(path, [...entry.topicTags, ...entry.keywordTags]);
					}
				}
			}
		} catch {
			// Tag lookup failed — continue without shared_tag signals
		}
	}

	// Unified candidate list: FTS5 results + graph-only neighbors
	const candidates: Array<{
		path: string;
		title: string;
		excerpt: string;
		score: number;
		highlightText: string;
		fromGraph: boolean;
	}> = [];

	for (const result of response.items) {
		candidates.push({
			path: result.path,
			title: result.title,
			excerpt: result.highlight?.text || result.title,
			score: result.finalScore ?? result.score ?? 0,
			highlightText: result.highlight?.text ?? '',
			fromGraph: false,
		});
	}

	// Add graph-only neighbors with minimal metadata
	if (graphCtx) {
		for (const gPath of graphOnlyPaths.slice(0, 10)) {
			const basename = gPath.replace(/^.*\//, '').replace(/\.md$/, '');
			candidates.push({
				path: gPath,
				title: basename,
				excerpt: '',
				score: 0.3,
				highlightText: '',
				fromGraph: true,
			});
		}
	}

	// --- Filter + signal detection loop ---
	const items: AmbientPushItem[] = [];

	for (const candidate of candidates) {
		if (items.length >= maxItems) break;

		// Skip self
		if (candidate.path === context.filePath) continue;

		// Skip already-linked notes (compare basenames)
		const basename = candidate.path
			.replace(/^.*\//, '')
			.replace(/\.md$/, '')
			.toLowerCase();
		if (existingOutlinksLower.has(basename)) continue;

		// Skip recently pushed (session dedup)
		const lastPushed = pushHistory.get(candidate.path);
		if (lastPushed && now - lastPushed < DEDUP_WINDOW_MS) continue;

		// Skip dismissed pairs (feedback loop)
		const pairKey = `${context.filePath}::${candidate.path}`;
		if (feedbackCtx?.dismissedPairs.has(pairKey)) continue;

		// --- Detect all signals ---
		const signals: AmbientSignal[] = [];

		// Text overlap (from FTS5 highlight)
		if (candidate.highlightText) {
			const terms = extractHighlightTerms(candidate.highlightText);
			if (terms.length > 0) {
				signals.push({ type: 'text_overlap', terms });
			}
		}

		// Graph signals (Phase 2)
		if (graphCtx) {
			// Shared tags
			const rTags = resultPathToTags.get(candidate.path) ?? [];
			const tagSignals = detectSharedTags(graphCtx.sourceGraphTags, rTags);
			signals.push(...tagSignals);

			// Graph neighbor
			const neighborSignal = detectGraphNeighborSignal(
				candidate.path,
				graphCtx.directNeighbors,
				graphCtx.twoHopBridgeMap,
			);
			if (neighborSignal) signals.push(neighborSignal);

			// Co-citation
			const coCiteSignal = detectCoCitationSignal(candidate.path, graphCtx.coCitations);
			if (coCiteSignal) signals.push(coCiteSignal);

			// Hub membership
			const hubSignal = detectHubMemberSignal(candidate.path, graphCtx.sharedHubNames);
			if (hubSignal) signals.push(hubSignal);
		}

		// --- Feedback score adjustment ---
		let adjustedScore = candidate.score;
		if (feedbackCtx) {
			// Positive boost: +0.1 per positive interaction (capped at +0.3)
			const posCount = feedbackCtx.positivePairs.get(pairKey) ?? 0;
			if (posCount > 0) {
				adjustedScore += Math.min(0.3, posCount * 0.1);
			}
			// Ignore penalty: -0.05 per ignore (capped at -0.15)
			const ignoreCount = feedbackCtx.ignoredPairs.get(pairKey) ?? 0;
			if (ignoreCount > 0) {
				adjustedScore -= Math.min(0.15, ignoreCount * 0.05);
			}
		}

		// Skip graph-only results with no signals (they'd show as "Related content" with no explanation)
		if (candidate.fromGraph && signals.length === 0) continue;

		const explanation = generateExplanation(signals);

		items.push({
			filePath: candidate.path,
			title: candidate.title,
			excerpt: (candidate.excerpt || candidate.title).slice(0, 150),
			score: adjustedScore,
			explanation,
			explanationType: 'template',
			signals,
			timestamp: now,
		});
	}

	// Re-sort by adjusted score (feedback may have changed ordering)
	items.sort((a, b) => b.score - a.score);

	return items.slice(0, maxItems);
}
