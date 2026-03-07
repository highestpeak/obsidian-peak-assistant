import type { ConsolidatedTaskWithId } from '@/core/schemas/agents/search-agent-schemas';
import type { TemplateManager } from '@/core/template/TemplateManager';
import { AgentTemplateId } from '@/core/template/TemplateRegistry';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { tokenizePathOrLabel, filterTokensForGraph } from '@/service/search/support/segmenter';

const TOP_FOLDERS = 3;
const FOLDER_STATS_EACH = 3;
const TOP_TAGS = 10;
const NAME_KEYWORDS_TOP = 20;
const FOLDER_TOP_TAGS = 10;
const GRAPH_INTERNAL_NODES_TOP_K = 10;
const GRAPH_EXTERNAL_NODES_TOP_K = 5;
const GRAPH_MIN_DEGREE = 2;
/** Max internal "connector" nodes added to bridge top nodes via real reference edges. */
const CONNECTOR_MAX = 5;
/** Min token frequency to show as keyword node (avoids one-off noise). */
const KEYWORD_MIN_FREQ = 2;
/** Max keyword nodes linked per doc (keeps graph readable). */
const KEYWORD_TOP_PER_DOC = 5;
const MAX_KW_TOKENS = 12;
/** Chunk size for IN lists to stay under SQLite variable limit; no JOIN, query then merge in memory. */
const EDGE_QUERY_CHUNK = 400;
/** Max lines in Group tree label before truncating with "+X more". */
const GROUP_TREE_MAX_LINES = 14;
/** Only consider top N tokens for kw∩kw shared nodes to avoid O(n²) blowup. */
const SHARED_KW_TOP_TOKENS = 10;
/** Min doc count in a shared (kw∩kw) set to create a shared node; 1 = any overlap becomes shared. */
const SHARED_MIN_DOCS = 1;

/**
 * Build folder path (directory) from file path. Empty for root-level files.
 */
function dirname(path: string): string {
	const i = path.lastIndexOf('/');
	return i <= 0 ? '' : path.slice(0, i);
}

/** Strip folder prefix from path for display in folder-scoped lines (Recent, Word count, Top links). */
function stripFolderPrefixForDisplay(path: string, folderKey: string): string {
	if (folderKey === '') return path.split('/').pop() ?? path;
	const prefix = folderKey + '/';
	return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

/** Trie node for path prefix tree: segment and children. */
interface PathTrieNode {
	segment: string;
	children: Map<string, PathTrieNode>;
	isEnd: boolean;
}

/**
 * Build a trie from path prefixes (each path split by '/').
 * Single-child chains are not merged here; that is done during render.
 */
function buildPathPrefixTrie(pathPrefixes: string[]): PathTrieNode {
	const root: PathTrieNode = { segment: '', children: new Map(), isEnd: false };
	for (const p of pathPrefixes) {
		if (!p.trim()) continue;
		const segments = p.split('/').filter(Boolean);
		let cur = root;
		for (const seg of segments) {
			let next = cur.children.get(seg);
			if (!next) {
				next = { segment: seg, children: new Map(), isEnd: false };
				cur.children.set(seg, next);
			}
			cur = next;
		}
		cur.isEnd = true;
	}
	return root;
}

/**
 * Collect one chain of segments from node until we hit multiple children or a leaf.
 * Returns segments for a single display line (single-child chain merged).
 */
function collectChainSegments(node: PathTrieNode): string[] {
	const segs: string[] = [];
	let cur: PathTrieNode | null = node;
	while (cur) {
		if (cur.segment) segs.push(cur.segment);
		if (cur.children.size !== 1) break;
		cur = cur.children.values().next().value as PathTrieNode;
	}
	return segs;
}

/**
 * Render trie to lines with indent (·· per level). Single-child chains merged into one line.
 * Truncates after GROUP_TREE_MAX_LINES and appends "+X more" when applicable.
 */
function renderPathPrefixTreeToLabel(pathPrefixes: string[]): string {
	if (pathPrefixes.length === 0) return 'Group';
	const root = buildPathPrefixTrie(pathPrefixes);
	const lines: string[] = [];
	const indent = '··';

	function walk(node: PathTrieNode, depth: number): void {
		if (lines.length >= GROUP_TREE_MAX_LINES) return;
		const entries = [...node.children.entries()].sort((a, b) => a[0].localeCompare(b[0]));
		for (const [, child] of entries) {
			if (lines.length >= GROUP_TREE_MAX_LINES) return;
			const chain = collectChainSegments(child);
			const prefix = indent.repeat(depth);
			const line = chain.length === 1
				? `${prefix}${chain[0]}`
				: `${prefix}${chain.join(' / ')}`;
			lines.push(line);
			// If we merged a chain, step into the last node of the chain to recurse its children
			let tail = child;
			for (let i = 1; i < chain.length; i++) {
				const next = tail.children.get(chain[i]);
				if (!next) break;
				tail = next;
			}
			if (tail.children.size > 0) walk(tail, depth + chain.length);
		}
	}

	walk(root, 0);
	if (lines.length >= GROUP_TREE_MAX_LINES) {
		const more = Math.max(1, pathPrefixes.length - (GROUP_TREE_MAX_LINES - 1));
		lines[GROUP_TREE_MAX_LINES - 1] = `(+${more} more)`;
	}
	const groupLabel = lines.map((l) => l.replace(/\]/g, '')).join('<br>');
	return `Group:<br>${groupLabel}`;
}

/**
 * Build shared-context markdown for one evidence group from programmatic stats (folders, tags, link graph).
 * Used by Evidence Agent to understand the group: folder stats (name keywords, top tags, top links),
 * group-level tags, and a Mermaid graph that mixes real reference edges with structural nodes (prefix/kw).
 * Returns empty string when no template manager or no data; on DB errors returns a short fallback message.
 */
export async function buildEvidenceGroupSharedContext(
	tasks: ConsolidatedTaskWithId[],
	templateManager: TemplateManager | undefined
): Promise<string> {
	if (!tasks.length) return '';
	if (!templateManager) return '';

	const paths = tasks.map((t) => t.path);
	const docMetaRepo = sqliteStoreManager.getDocMetaRepo();
	const graphStore = sqliteStoreManager.getGraphStore();

	try {
		const idMaps = await docMetaRepo.getIdsByPaths(paths);
		const docIds = idMaps.map((m) => m.id);
		const pathById = new Map(idMaps.map((m) => [m.id, m.path]));
		if (!docIds.length) return '';

		// --- Folder lines (top 2 folders by in-group count) ---
		const folderLines = await buildFolderLines(paths);

		// --- Tags (top N in group) ---
		const { tagCounts } = await graphStore.getTagsAndCategoriesByDocIds(docIds);
		const tagDesc = Array.from(tagCounts.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, TOP_TAGS)
			.map(([name, count]) => `${name}(${count})`)
			.join(', ');

		// --- Folder-scope reference graph (internal top nodes + external group aggregate) ---
		const folderPrefixes = normalizeFolderPrefixes(paths.map((p) => dirname(p)));
		const mermaidCode = await buildMermaidCode(folderPrefixes, pathById);

		const payload = {
			hasFolderLines: folderLines.length > 0,
			folderLines,
			hasTagDesc: !!tagDesc.trim(),
			tagDesc,
			hasMermaidCode: !!mermaidCode,
			mermaidCode,
		};

		return await templateManager.render(AgentTemplateId.EvidenceGroupSharedContext, payload);
	} catch (err) {
		console.warn('[buildEvidenceGroupSharedContext]', err);
		return '(Shared context unavailable: data error)';
	}
}

/**
 * Dedupe folder paths and keep only minimal set: remove any path that is a strict subpath of another.
 * E.g. ["A", "A/B", "B"] → ["A", "B"] so we do not duplicate docs when querying by prefix.
 */
function normalizeFolderPrefixes(folderPaths: string[]): string[] {
	const unique = [...new Set(folderPaths)].filter(Boolean);
	return unique.filter(
		(f) => !unique.some((other) => other !== f && (f === other || f.startsWith(other + '/')))
	);
}

async function buildFolderLines(paths: string[]): Promise<Array<{
	folderPath: string;
	inGroupCount: number;
	totalInFolder: number;
	extraCount?: number;
	hasTopRecent: boolean;
	topRecent: Array<{ path: string }>;
	hasTopWordCount: boolean;
	topWordCount: Array<{ path: string; word_count: number }>;
	hasTopLinksIn: boolean;
	topLinksIn: Array<{ path: string; inDegree: number }>;
	hasTopLinksOut: boolean;
	topLinksOut: Array<{ path: string; outDegree: number }>;
	hasNameKeywords: boolean;
	nameKeywords: Array<{ keyword: string; count: number }>;
	hasFolderTagDesc: boolean;
	folderTagDesc: string;
}>> {
	const docMetaRepo = sqliteStoreManager.getDocMetaRepo();
	const docStatsRepo = sqliteStoreManager.getDocStatisticsRepo();
	const graphEdgeRepo = sqliteStoreManager.getGraphEdgeRepo();
	const graphNodeRepo = sqliteStoreManager.getGraphNodeRepo();

	const folderToPaths = new Map<string, string[]>();
	for (const p of paths) {
		const dir = dirname(p) || '(root)';
		const arr = folderToPaths.get(dir) ?? [];
		arr.push(p);
		folderToPaths.set(dir, arr);
	}
	const sortedFolders = [...folderToPaths.entries()]
		.sort((a, b) => b[1].length - a[1].length)
		.slice(0, TOP_FOLDERS);

	const folderLines: Array<{
		folderPath: string;
		inGroupCount: number;
		totalInFolder: number;
		extraCount?: number;
		hasTopRecent: boolean;
		topRecent: Array<{ path: string }>;
		hasTopWordCount: boolean;
		topWordCount: Array<{ path: string; word_count: number }>;
		hasTopLinksIn: boolean;
		topLinksIn: Array<{ path: string; inDegree: number }>;
		hasTopLinksOut: boolean;
		topLinksOut: Array<{ path: string; outDegree: number }>;
		hasNameKeywords: boolean;
		nameKeywords: Array<{ keyword: string; count: number }>;
		hasFolderTagDesc: boolean;
		folderTagDesc: string;
	}> = [];

	for (const [folderKey, groupPaths] of sortedFolders) {
		const folderPath = folderKey === '' ? '(root)' : folderKey;
		const inGroupCount = groupPaths.length;
		const totalInFolder =
			folderKey === ''
				? await docStatsRepo.countAll()
				: await docMetaRepo.countByFolderPath(folderKey);
		const extraCount = Math.max(0, totalInFolder - inGroupCount);

		if (folderKey === '') {
			folderLines.push({
				folderPath,
				inGroupCount,
				totalInFolder,
				extraCount: extraCount > 0 ? extraCount : undefined,
				hasTopRecent: false,
				topRecent: [],
				hasTopWordCount: false,
				topWordCount: [],
				hasTopLinksIn: false,
				topLinksIn: [],
				hasTopLinksOut: false,
				topLinksOut: [],
				hasNameKeywords: false,
				nameKeywords: [],
				hasFolderTagDesc: false,
				folderTagDesc: '',
			});
			continue;
		}

		const folderIdMaps = await docMetaRepo.getIdsByFolderPath(folderKey);
		const folderDocIds = folderIdMaps.map((m) => m.id);
		const allFolderPaths = folderIdMaps.map((m) => m.path);
		if (folderDocIds.length === 0) {
			folderLines.push({
				folderPath,
				inGroupCount,
				totalInFolder,
				extraCount: extraCount > 0 ? extraCount : undefined,
				hasTopRecent: false,
				topRecent: [],
				hasTopWordCount: false,
				topWordCount: [],
				hasTopLinksIn: false,
				topLinksIn: [],
				hasTopLinksOut: false,
				topLinksOut: [],
				hasNameKeywords: false,
				nameKeywords: [],
				hasFolderTagDesc: false,
				folderTagDesc: '',
			});
			continue;
		}

		const [topRecentRaw, topWordCountRaw, edgeCounts, tagCountsRaw] = await Promise.all([
			docStatsRepo.getTopRecentEditedByDocIds(folderDocIds, FOLDER_STATS_EACH),
			docStatsRepo.getTopWordCountByDocIds(folderDocIds, FOLDER_STATS_EACH),
			graphEdgeRepo.countEdges(folderDocIds, 'references'),
			chunkedTagCountsByFromNodes(graphEdgeRepo, folderDocIds, FOLDER_TOP_TAGS),
		]);

		const uniqueIds = [...new Set([
			...topRecentRaw.map((r) => r.doc_id),
			...topWordCountRaw.map((r) => r.doc_id),
			...Array.from(edgeCounts.incoming.keys()),
			...Array.from(edgeCounts.outgoing.keys()),
		])];
		const idToPath = new Map(
			(uniqueIds.length ? await docMetaRepo.getByIds(uniqueIds) : []).map((m) => [m.id, m.path] as const)
		);

		const strip = (p: string) => stripFolderPrefixForDisplay(p, folderKey);
		const topRecent = topRecentRaw.map((r) => ({ path: strip(idToPath.get(r.doc_id) ?? r.doc_id) }));
		const topWordCount = topWordCountRaw.map((r) => ({
			path: strip(idToPath.get(r.doc_id) ?? r.doc_id),
			word_count: r.word_count,
		}));
		const topLinksIn = [...edgeCounts.incoming.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, FOLDER_STATS_EACH)
			.map(([node_id, inDegree]) => ({ path: strip(idToPath.get(node_id) ?? node_id), inDegree }));
		const topLinksOut = [...edgeCounts.outgoing.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, FOLDER_STATS_EACH)
			.map(([node_id, outDegree]) => ({ path: strip(idToPath.get(node_id) ?? node_id), outDegree }));

		const keywordCount = new Map<string, number>();
		for (const p of allFolderPaths) {
			const basename = p.split('/').pop() ?? p;
			const nameWithoutExt = basename.replace(/\.[^.]+$/, '');
			for (const token of tokenizePathOrLabel(nameWithoutExt)) {
				keywordCount.set(token, (keywordCount.get(token) ?? 0) + 1);
			}
		}
		const nameKeywords = [...keywordCount.entries()]
			.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
			.slice(0, NAME_KEYWORDS_TOP)
			.map(([keyword, count]) => ({ keyword, count }));

		const tagNodeIds = tagCountsRaw.map((r) => r.to_node_id);
		const tagNodeMap = tagNodeIds.length ? await graphNodeRepo.getByIds(tagNodeIds) : new Map();
		const folderTagDesc = tagCountsRaw
			.map((r) => {
				const label = tagNodeMap.get(r.to_node_id)?.label ?? r.to_node_id;
				return `${label}(${r.count})`;
			})
			.join(', ');

		folderLines.push({
			folderPath,
			inGroupCount,
			totalInFolder,
			extraCount: extraCount > 0 ? extraCount : undefined,
			hasTopRecent: topRecent.length > 0,
			topRecent,
			hasTopWordCount: topWordCount.length > 0,
			topWordCount,
			hasTopLinksIn: topLinksIn.length > 0,
			topLinksIn,
			hasTopLinksOut: topLinksOut.length > 0,
			topLinksOut,
			hasNameKeywords: nameKeywords.length > 0,
			nameKeywords,
			hasFolderTagDesc: !!folderTagDesc.trim(),
			folderTagDesc,
		});
	}

	return folderLines;
}

/**
 * Tag counts for docs: query edges by chunked from_node_id (no JOIN), merge counts in memory.
 * Design: folder can have many docs; chunking avoids SQLite variable limit when filtering by from_node_id.
 */
async function chunkedTagCountsByFromNodes(
	graphEdgeRepo: { getByFromNodesAndTypes: (ids: string[], types: string[]) => Promise<Array<{ to_node_id: string; from_node_id: string }>> },
	fromNodeIds: string[],
	limitN: number
): Promise<Array<{ to_node_id: string; count: number }>> {
	if (!fromNodeIds.length || limitN <= 0) return [];
	const byTo = new Map<string, number>();
	for (const c of chunk(fromNodeIds, EDGE_QUERY_CHUNK)) {
		const edges = await graphEdgeRepo.getByFromNodesAndTypes(c, ['tagged']);
		for (const e of edges) {
			byTo.set(e.to_node_id, (byTo.get(e.to_node_id) ?? 0) + 1);
		}
	}
	return [...byTo.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, limitN)
		.map(([to_node_id, count]) => ({ to_node_id, count }));
}

function chunk<T>(arr: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
	return out;
}

/**
 * Builds a Mermaid flowchart for the evidence group's folder-scope link graph.
 *
 * Design intent:
 * - Prefer real reference edges (doc→doc) so the graph reflects actual links. Top nodes are chosen by
 *   degree within the internal set; we then add up to CONNECTOR_MAX "connector" nodes (internal docs
 *   that are referenced by or reference multiple top nodes) so that isolated top nodes can connect
 *   through these hubs without inventing edges.
 * - Structural glue: (1) prefix nodes list doc aliases in label only (Group→prefix, no prefix→doc);
 *   (2) keyword nodes list doc aliases in label (Group→kw, no kw→doc). Basename for keywords is
 *   stripped of file extension and pure-digit tokens are filtered to reduce noise.
 * - All node ids in the diagram use short aliases (A,B,...,Z,AA,...) for readability and LLM use.
 * - External: no individual external doc nodes; Group→extOut prefix/kw and extIn prefix/kw→Group
 *   with doc aliases in labels, so the graph stays compact.
 */
async function buildMermaidCode(
	pathPrefixes: string[],
	pathById: Map<string, string>
): Promise<string> {
	if (pathPrefixes.length === 0) return '';
	const data = await loadMermaidGraphData(pathPrefixes, pathById);
	if (!data) return '';

	const internal = buildKeywordCluster(
		data.internalNodeIds_TopReference.map((id) => ({
			id,
			path: data.allNodeIdToPath.get(id) ?? ''
		})),
		data.allNodeIdToPath,
		'int'
	);

	return emitMermaidFlowchart(pathPrefixes, data, internal);
}

/** One shared (kw∩kw) node: docs that appear in multiple tokens, with short id and contributor token names. */
export interface SharedKwNode {
	shortId: string;
	tokenNames: string[];
	basenames: string[];
	/** Doc ids for degree lookup when rendering label. */
	ids: string[];
}

/** Keyword cluster result: tokens (possibly merged by doc-set), optional shared (kw∩kw) nodes. */
export interface KeywordClusterResult {
	keptTokens: string[];
	kwToShortId: Map<string, string>;
	tokenToBasenames: Map<string, string[]>;
	tokenToIds: Map<string, Set<string>>;
	sharedNodes: SharedKwNode[];
	/** shortId of shared node -> token names that have an edge to it (Group -> kw, kw -> shared). */
	sharedContributors: Map<string, string[]>;
	/** Doc IDs that appear in any kw or shared node; used to exclude them from Orphans (Orphans = isolated \ this set). */
	docIdsInKwOrShared: Set<string>;
}

/**
 * Build keyword cluster: tokenize basename, substring merge, then merge tokens with identical doc-set,
 * then extract shared (kw∩kw) nodes (greedy by |S| desc) and remove assigned docs from token labels.
 * Returns keptTokens (possibly "t1 / t2" for same doc-set), tokenToIds/Basenames (after shared removed),
 * sharedNodes, and sharedContributors for edges kw -> shared.
 */
function buildKeywordCluster(
	docEntries: Array<{ id: string; path: string }>,
	idToPath: Map<string, string>,
	shortIdPrefix: string
): KeywordClusterResult {
	docEntries = docEntries.filter((e) => e.path !== '');
	const tokenFreq = new Map<string, number>();
	const docTokens = new Map<string, string[]>();
	for (const { id, path } of docEntries) {
		const basenameNoExt = basenameWithoutExtension(path);
		const tokens = filterTokensForGraph(tokenizePathOrLabel(basenameNoExt));
		docTokens.set(id, tokens);
		for (const t of tokens) tokenFreq.set(t, (tokenFreq.get(t) ?? 0) + 1);
	}
	const tokenToIds = new Map<string, Set<string>>();
	for (const { id, path } of docEntries) {
		const tokens = docTokens.get(id) ?? [];
		for (const t of tokens) {
			if ((tokenFreq.get(t) ?? 0) < KEYWORD_MIN_FREQ) continue;
			let set = tokenToIds.get(t);
			if (!set) {
				set = new Set();
				tokenToIds.set(t, set);
			}
			set.add(id);
		}
	}
	let keptTokens = [...tokenToIds.keys()].filter((t) => (tokenToIds.get(t)?.size ?? 0) >= KEYWORD_MIN_FREQ);
	keptTokens.sort((a, b) => {
		const lenA = a.length;
		const lenB = b.length;
		if (lenB !== lenA) return lenB - lenA;
		return (tokenToIds.get(b)?.size ?? 0) - (tokenToIds.get(a)?.size ?? 0);
	});
	// Substring merge: shorter token merged into longer, then remove
	const toRemove = new Set<string>();
	for (let i = 0; i < keptTokens.length; i++) {
		const shortT = keptTokens[i];
		if (toRemove.has(shortT)) continue;
		for (let j = 0; j < i; j++) {
			const longT = keptTokens[j];
			if (toRemove.has(longT)) continue;
			if (longT.includes(shortT)) {
				const longSet = tokenToIds.get(longT)!;
				const shortSet = tokenToIds.get(shortT);
				if (shortSet) for (const id of shortSet) longSet.add(id);
				toRemove.add(shortT);
				break;
			}
		}
	}
	keptTokens = keptTokens.filter((t) => !toRemove.has(t)).slice(0, MAX_KW_TOKENS);
	for (const t of toRemove) tokenToIds.delete(t);

	// Merge tokens with identical doc-set into one display label (e.g. "edit / plan")
	const docSetSignature = (t: string) => [...(tokenToIds.get(t) ?? [])].sort().join(',');
	const sigToTokens = new Map<string, string[]>();
	for (const t of keptTokens) {
		const sig = docSetSignature(t);
		const list = sigToTokens.get(sig) ?? [];
		list.push(t);
		sigToTokens.set(sig, list);
	}
	const mergedLabels: string[] = [];
	const mergedTokenToIds = new Map<string, Set<string>>();
	for (const [, group] of sigToTokens) {
		const label = group.length > 1 ? group.join(' / ') : group[0];
		mergedLabels.push(label);
		mergedTokenToIds.set(label, new Set(tokenToIds.get(group[0])!));
	}
	// Keep order by doc count desc
	mergedLabels.sort((a, b) => (mergedTokenToIds.get(b)?.size ?? 0) - (mergedTokenToIds.get(a)?.size ?? 0));
	keptTokens = mergedLabels;
	tokenToIds.clear();
	for (const t of keptTokens) tokenToIds.set(t, mergedTokenToIds.get(t)!);

	// tokenToBasenames from current tokenToIds (will be updated after shared extraction)
	const tokenToBasenames = new Map<string, string[]>();
	for (const t of keptTokens) {
		const ids = tokenToIds.get(t);
		tokenToBasenames.set(
			t,
			ids ? [...ids].map((id) => (idToPath.get(id) ?? id).split('/').pop() ?? id) : []
		);
	}
	let idx = 0;
	const kwToShortId = new Map<string, string>();
	for (const t of keptTokens) kwToShortId.set(t, `${shortIdPrefix}_${indexToAlias(idx++)}`);

	// Shared (kw∩kw): top SHARED_KW_TOP_TOKENS by doc count (any overlap with >= SHARED_MIN_DOCS becomes shared)
	const topForShared = keptTokens.slice(0, SHARED_KW_TOP_TOKENS);
	type Candidate = { ids: Set<string>; tokens: string[] };
	const candidates: Candidate[] = [];
	for (let i = 0; i < topForShared.length; i++) {
		for (let j = i + 1; j < topForShared.length; j++) {
			const t1 = topForShared[i];
			const t2 = topForShared[j];
			const s1 = tokenToIds.get(t1)!;
			const s2 = tokenToIds.get(t2)!;
			const ids = new Set<string>([...s1].filter((id) => s2.has(id)));
			if (ids.size >= SHARED_MIN_DOCS) candidates.push({ ids, tokens: [t1, t2] });
		}
	}
	candidates.sort((a, b) => b.ids.size - a.ids.size);

	const alreadyAssigned = new Set<string>();
	const sharedNodes: SharedKwNode[] = [];
	const sharedContributors = new Map<string, string[]>();
	for (const { ids, tokens } of candidates) {
		const usable = new Set<string>([...ids].filter((id) => !alreadyAssigned.has(id)));
		if (usable.size < SHARED_MIN_DOCS) continue;
		const shortId = `${shortIdPrefix}_shared_${indexToAlias(sharedNodes.length)}`;
		const basenames = [...usable].map((id) => (idToPath.get(id) ?? id).split('/').pop() ?? id);
		sharedNodes.push({ shortId, tokenNames: [...tokens], basenames, ids: [...usable] });
		sharedContributors.set(shortId, [...tokens]);
		for (const id of usable) alreadyAssigned.add(id);
		for (const t of tokens) {
			const set = tokenToIds.get(t);
			if (set) for (const id of usable) set.delete(id);
		}
	}
	// Recompute tokenToBasenames after removing assigned docs
	for (const t of keptTokens) {
		const ids = tokenToIds.get(t);
		tokenToBasenames.set(
			t,
			ids ? [...ids].map((id) => (idToPath.get(id) ?? id).split('/').pop() ?? id) : []
		);
	}

	// Docs that are in any kw label or shared node; Orphans will exclude these
	const docIdsInKwOrShared = new Set<string>();
	for (const t of keptTokens) {
		const set = tokenToIds.get(t);
		if (set) for (const id of set) docIdsInKwOrShared.add(id);
	}
	for (const id of alreadyAssigned) docIdsInKwOrShared.add(id);

	return {
		keptTokens,
		kwToShortId,
		tokenToBasenames,
		tokenToIds,
		sharedNodes,
		sharedContributors,
		docIdsInKwOrShared,
	};
}

/** Loaded graph data for Mermaid: internal/display nodes, path map, degree maps, intra/external edges, aliases. */
interface MermaidGraphData {
	/** Doc IDs under the group's folder path prefixes (recursive). */
	internalIds: string[];
	/** Top nodes by reference degree within internal set, capped at GRAPH_NODES_MAX; drawn as doc nodes. */
	internalNodeIds_TopReference: string[];

	/** In-degree per node (references into this node) within the internal set. */
	internalInDegreeMap: Map<string, number>;
	/** Out-degree per node (references from this node) within the internal set. */
	internalOutDegreeMap: Map<string, number>;
	/** Reference edges with both endpoints in displayNodeIds (doc→doc links in diagram). */
	intraEdges: Array<{ from_node_id: string; to_node_id: string }>;

	/** Top external nodes that internal nodes link to (outgoing); sorted by count desc, top GRAPH_EXTERNAL_TOP_K. */
	extOut: Array<{ to_node_id: string; count: number }>;
	/** Top external nodes that link into internal nodes (incoming); sorted by count desc, top GRAPH_EXTERNAL_TOP_K. */
	extIn: Array<{ from_node_id: string; count: number }>;
	/** External node IDs that appear only as outgoing (internal → external). */
	extOutOnlyIds: string[];
	/** External node IDs that appear only as incoming (external → internal). */
	extInOnlyIds: string[];
	/** External node IDs that appear in both directions (mutual). */
	extMutualIds: string[];
	/** Unique node IDs from extOut and extIn (for path lookup and alias ordering). */
	allExtNodeIds: string[];

	/** Node id → file path (display + external nodes; external may come from doc_meta or graph_node). */
	allNodeIdToPath: Map<string, string>;
	/** Node id → short diagram id (A, B, ..., Z, AA, ...) for Mermaid and LLM readability. */
	nodeIdToAlias: Map<string, string>;
}

/**
 * Load graph data: internal docs by path prefixes, top nodes by degree, path lookup, intra/external edges, aliases.
 */
async function loadMermaidGraphData(
	pathPrefixes: string[],
	pathById: Map<string, string>
): Promise<MermaidGraphData | null> {
	if (pathPrefixes.length === 0) return null;
	const graphEdgeRepo = sqliteStoreManager.getGraphEdgeRepo();
	const docMetaRepo = sqliteStoreManager.getDocMetaRepo();
	const graphNodeRepo = sqliteStoreManager.getGraphNodeRepo();

	const internalIdMaps = await docMetaRepo.getIdsByPathPrefixes(pathPrefixes);
	const internalIds = internalIdMaps.map((m) => m.id);
	if (internalIds.length === 0) return null;

	// get top reference nodes by degree within internal set
	const { inMap: internalInDegreeMap, outMap: internalOutDegreeMap } = await graphEdgeRepo.getDegreeMapsByNodeIdsChunked(internalIds, 'references');
	const allNodeIds = new Set([...internalInDegreeMap.keys(), ...internalOutDegreeMap.keys()]);
	const totalByNode = new Map<string, number>();
	for (const nid of allNodeIds) {
		const total = (internalInDegreeMap.get(nid) ?? 0) + (internalOutDegreeMap.get(nid) ?? 0);
		if (total > GRAPH_MIN_DEGREE) totalByNode.set(nid, total);
	}
	const topByDegree = [...totalByNode.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, GRAPH_INTERNAL_NODES_TOP_K)
		.map(([id]) => id);
	if (topByDegree.length === 0) return null;

	const topSet = new Set(topByDegree);
	const internalSet = new Set(internalIds);
	const [fromEdges, toEdges, { extOut, extIn }] = await Promise.all([
		graphEdgeRepo.getByFromNodesAndTypes(topByDegree, ['references']),
		graphEdgeRepo.getByToNodesAndTypes(topByDegree, ['references']),
		graphEdgeRepo.getExternalEdgeCountsChunked(internalIds, 'references', GRAPH_EXTERNAL_NODES_TOP_K),
	]);
	const connectorScore = new Map<string, number>();
	for (const e of fromEdges) {
		if (internalSet.has(e.to_node_id) && !topSet.has(e.to_node_id)) {
			connectorScore.set(e.to_node_id, (connectorScore.get(e.to_node_id) ?? 0) + 1);
		}
	}
	for (const e of toEdges) {
		if (internalSet.has(e.from_node_id) && !topSet.has(e.from_node_id)) {
			connectorScore.set(e.from_node_id, (connectorScore.get(e.from_node_id) ?? 0) + 1);
		}
	}
	const connectors = [...connectorScore.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, CONNECTOR_MAX)
		.map(([id]) => id);
	const internalNodeIds_TopReference = [...topByDegree, ...connectors];
	const intraEdges = await graphEdgeRepo.getIntraEdges(internalNodeIds_TopReference, 'references');

	const allExtNodeIds = [...new Set([
		...extOut.map((r) => r.to_node_id),
		...extIn.map((r) => r.from_node_id),
	])];
	const extOutIdSet = new Set(extOut.map((r) => r.to_node_id));
	const extInIdSet = new Set(extIn.map((r) => r.from_node_id));
	const extMutualIds = [...extOutIdSet].filter((id) => extInIdSet.has(id));
	const extOutOnlyIds = [...extOutIdSet].filter((id) => !extInIdSet.has(id));
	const extInOnlyIds = [...extInIdSet].filter((id) => !extOutIdSet.has(id));

	// Load in/out degree for external nodes so ext out/in/mutual labels show real counts (not 0)
	if (allExtNodeIds.length > 0) {
		const { inMap: extInMap, outMap: extOutMap } = await graphEdgeRepo.getDegreeMapsByNodeIdsChunked(allExtNodeIds, 'references');
		for (const [id, d] of extInMap) internalInDegreeMap.set(id, d);
		for (const [id, d] of extOutMap) internalOutDegreeMap.set(id, d);
	}

	const allNodeIdToPath = new Map(pathById);
	const metaRows = await docMetaRepo.getByIds([
		...internalNodeIds_TopReference,
		...allExtNodeIds,
	]);
	for (const m of metaRows) allNodeIdToPath.set(m.id, m.path);
	// Fallback for external nodes not in doc_meta: use graph_node label so ext out/in don't show raw ids
	const extIdsWithoutPath = allExtNodeIds.filter((id) => !allNodeIdToPath.has(id));
	if (extIdsWithoutPath.length > 0) {
		const graphNodeMap = await graphNodeRepo.getByIds(extIdsWithoutPath);
		for (const id of extIdsWithoutPath) {
			const node = graphNodeMap.get(id);
			allNodeIdToPath.set(id, node?.label ?? id);
		}
	}

	const orderedIdsForAlias = [...internalNodeIds_TopReference, ...allExtNodeIds];
	const nodeIdToAlias = buildIdToAlias(orderedIdsForAlias);

	return {
		internalIds,
		internalNodeIds_TopReference,

		internalInDegreeMap,
		internalOutDegreeMap,
		intraEdges,

		extOut,
		extIn,
		extOutOnlyIds,
		extInOnlyIds,
		extMutualIds,
		allExtNodeIds,

		allNodeIdToPath,
		nodeIdToAlias,
	};
}

/** Shared result of prefix/kw aggregation (keyed by prefix key; no Mermaid ids). Used by both internal and external. */
interface PrefixKwSharedCore {
	prefixKeysInOrder: string[];
	prefixToBasenames: Map<string, string[]>;
	prefixToIds: Map<string, Set<string>>;
	keptTokens: string[];
	tokenToBasenames: Map<string, string[]>;
	tokenToIds: Map<string, Set<string>>;
	shared: Array<{ prefixKey: string; token: string; ids: string[]; basenames: string[] }>;
}

/**
 * Unified prefix + keyword + shared (prefix∩kw) aggregation. Used by both internal and external.
 * getPrefixKey(path) returns the prefix key (e.g. pathPrefix or dirname); null skips. idToPath used for shared basenames.
 */
function buildPrefixKwSharedCore(
	docEntries: Array<{ id: string; path: string }>,
	idToPath: Map<string, string>,
): PrefixKwSharedCore {

	const prefixToBasenames = new Map<string, string[]>();
	const prefixToIds = new Map<string, Set<string>>();
	for (const { id, path } of docEntries) {
		const key = getBasenamePrefix(path);
		if (key == null || key === '') continue;

		const basename = path.split('/').pop() ?? path;

		const list = prefixToBasenames.get(key) ?? [];
		if (!list.includes(basename)) list.push(basename);
		prefixToBasenames.set(key, list);

		const idSet = prefixToIds.get(key) ?? new Set();
		idSet.add(id);
		prefixToIds.set(key, idSet);
	}

	const tokenFreq = new Map<string, number>();
	const docTokens = new Map<string, string[]>();
	for (const { id, path } of docEntries) {
		const basenameNoExt = basenameWithoutExtension(path);
		const tokens = filterTokensForGraph(tokenizePathOrLabel(basenameNoExt));
		docTokens.set(id, tokens);
		for (const t of tokens) tokenFreq.set(t, (tokenFreq.get(t) ?? 0) + 1);
	}
	let keptTokens = [...tokenFreq.entries()]
		.filter(([, count]) => count >= KEYWORD_MIN_FREQ)
		.sort((a, b) => b[1] - a[1])
		.map(([t]) => t);
	keptTokens = keptTokens.slice(0, MAX_KW_TOKENS);
	const tokenToBasenames = new Map<string, string[]>();
	const tokenToIds = new Map<string, Set<string>>();
	for (const { id, path } of docEntries) {
		const basename = path.split('/').pop() ?? path;
		const tokens = docTokens.get(id) ?? [];
		const withFreq = tokens
			.filter((t) => keptTokens.includes(t))
			.sort((a, b) => (tokenFreq.get(b) ?? 0) - (tokenFreq.get(a) ?? 0))
			.slice(0, KEYWORD_TOP_PER_DOC);
		for (const t of withFreq) {
			const list = tokenToBasenames.get(t) ?? [];
			list.push(basename);
			tokenToBasenames.set(t, list);
			const idSet = tokenToIds.get(t) ?? new Set();
			idSet.add(id);
			tokenToIds.set(t, idSet);
		}
	}
	for (const t of keptTokens) {
		const list = tokenToBasenames.get(t) ?? [];
		tokenToBasenames.set(t, [...new Set(list)]);
	}

	const shared: Array<{ prefixKey: string; token: string; ids: string[]; basenames: string[] }> = [];
	const prefixKeysForIter = [...prefixToBasenames.keys()];
	for (const prefixKey of prefixKeysForIter) {
		const prefixIds = prefixToIds.get(prefixKey) ?? new Set();
		for (const t of keptTokens) {
			const tokenIds = tokenToIds.get(t) ?? new Set();
			const intersection = [...prefixIds].filter((id) => tokenIds.has(id));
			if (intersection.length === 0) continue;
			const basenames = intersection.map((id) => (idToPath.get(id) ?? id).split('/').pop() ?? id);
			shared.push({ prefixKey, token: t, ids: intersection, basenames });
		}
	}

	return {
		prefixKeysInOrder: prefixKeysForIter,
		prefixToBasenames,
		prefixToIds,
		keptTokens,
		tokenToBasenames,
		tokenToIds,
		shared,
	};
}

/** Assign short Mermaid ids to prefix/kw/shared from core. Same logic for internal and external. */
function mapCoreToShortIds(
	core: PrefixKwSharedCore,
	shortIdPrefix: string
): {
	prefixToShortId: Map<string, string>;
	kwToShortId: Map<string, string>;
	sharedToShortId: string[];
} {
	let idx = 0;
	const prefixToShortId = new Map<string, string>();
	for (const k of core.prefixKeysInOrder) {
		prefixToShortId.set(k, `${shortIdPrefix}_${indexToAlias(idx++)}`);
	}
	const kwToShortId = new Map<string, string>();
	for (const t of core.keptTokens) {
		kwToShortId.set(t, `${shortIdPrefix}_${indexToAlias(idx++)}`);
	}
	const sharedToShortId = core.shared.map((_, i) => `${shortIdPrefix}_shared_${indexToAlias(i)}`);
	return { prefixToShortId, kwToShortId, sharedToShortId };
}

/** Unified prefix/kw/shared result (internal and external). Short id sequence per shortIdPrefix (int_A, extOut_A, ...). */
interface PrefixKwResult {
	prefixKeysInOrder: string[];
	prefixNodeIds: string[];
	prefixToShortId: Map<string, string>;
	prefixToBasenames: Map<string, string[]>;
	prefixToIds: Map<string, Set<string>>;
	keptTokens: string[];
	kwToShortId: Map<string, string>;
	tokenToBasenames: Map<string, string[]>;
	tokenToIds: Map<string, Set<string>>;
	shared: Array<{ prefixKey: string; token: string; ids: string[]; basenames: string[] }>;
	sharedToShortId: string[];
}

/** Source for doc entries: either node ids (internal) or records + getNodeId (external). */
type PrefixKwSource =
	| { nodeIds: string[] }
	| {
		records: Array<{ to_node_id?: string; from_node_id?: string }>;
		getNodeId: (r: { to_node_id?: string; from_node_id?: string }) => string;
	};

/**
 * Build prefix/kw/shared from a source (node ids or records + getNodeId), idToPath, and options.
 * Doc entries are built inside from source so callers only pass how to get (id, path).
 */
function buildPrefixKwShared(
	docEntries: Array<{ id: string; path: string }>,
	idToPath: Map<string, string>,
	shortIdPrefix: string
): PrefixKwResult {
	docEntries = docEntries.filter((e) => e.path !== '');
	const core = buildPrefixKwSharedCore(docEntries, idToPath);
	const { prefixToShortId, kwToShortId, sharedToShortId } = mapCoreToShortIds(core, shortIdPrefix);
	const prefixNodeIds = core.prefixKeysInOrder.map((k) => prefixToShortId.get(k)!);
	return {
		prefixKeysInOrder: core.prefixKeysInOrder,
		prefixNodeIds,
		prefixToShortId,
		prefixToBasenames: core.prefixToBasenames,
		prefixToIds: core.prefixToIds,
		keptTokens: core.keptTokens,
		kwToShortId,
		tokenToBasenames: core.tokenToBasenames,
		tokenToIds: core.tokenToIds,
		shared: core.shared,
		sharedToShortId,
	};
}

/**
 * Emit Mermaid flowchart TD lines: Group subgraph (docs, kw, orphans), external glue nodes (extOut/extIn/extMutual), edges.
 */
function emitMermaidFlowchart(
	pathPrefixes: string[],
	data: MermaidGraphData,
	internal: KeywordClusterResult
): string {
	const {
		internalNodeIds_TopReference: displayNodeIds,
		allNodeIdToPath: idToPath,
		internalInDegreeMap: inMap,
		internalOutDegreeMap: outMap,
		intraEdges,
		nodeIdToAlias: idToAlias,
		extOutOnlyIds,
		extInOnlyIds,
		extMutualIds,
	} = data;
	const hasIntraEdge = new Set<string>();
	for (const e of intraEdges) {
		hasIntraEdge.add(e.from_node_id);
		hasIntraEdge.add(e.to_node_id);
	}
	const connectedNodeIds = displayNodeIds.filter((nid) => hasIntraEdge.has(nid));
	const isolatedNodeIds = displayNodeIds.filter((nid) => !hasIntraEdge.has(nid));
	// Orphans = isolated docs that are NOT hit by any kw (or in shared); exclude docIdsInKwOrShared
	const orphanIdsToShow = isolatedNodeIds.filter((id) => !internal.docIdsInKwOrShared.has(id));

	const mermaidLines: string[] = ['flowchart TD'];
	const subGraphNodeId = 'groupWrap';
	const groupNodeId = 'Group';
	const groupLabel = renderPathPrefixTreeToLabel(pathPrefixes);
	mermaidLines.push(`  subgraph ${subGraphNodeId} ["Group"]`);
	mermaidLines.push(`    ${groupNodeId}["${groupLabel}"]`);

	for (const nid of connectedNodeIds) {
		const alias = idToAlias.get(nid);
		if (alias == null) continue;
		const path = idToPath.get(nid) ?? nid;
		const basename = String((path.split('/').pop() ?? path)).replace(/\]/g, '');
		const inD = inMap.get(nid) ?? 0;
		const outD = outMap.get(nid) ?? 0;
		const inPart = inD > 0 ? `in:${inD}` : '';
		const outPart = outD > 0 ? `out:${outD}` : '';
		const degreePart =
			inPart && outPart ? ` (${inPart} ${outPart})` : inPart || outPart ? ` (${inPart || outPart})` : '';
		mermaidLines.push(`    ${alias}["${basename + degreePart}"]`);
	}
	if (orphanIdsToShow.length > 0) {
		const orphansLabel =
			orphanIdsToShow.length > 0
				? `Orphans<br>(${formatDocIdsWithDegree(orphanIdsToShow, idToPath, inMap, outMap)})`
				: 'Orphans';
		mermaidLines.push(`    Orphans["${orphansLabel}"]`);
	}
	const kwIdsSeen = new Set<string>();
	for (const t of internal.keptTokens) {
		const kid = internal.kwToShortId.get(t)!;
		if (kwIdsSeen.has(kid)) continue;
		kwIdsSeen.add(kid);
		const ids = [...(internal.tokenToIds.get(t) ?? [])];
		const kwLabel =
			ids.length > 0
				? `kw: ${t}<br>(${formatDocIdsWithDegree(ids, idToPath, inMap, outMap)})`
				: `kw: ${t}`;
		mermaidLines.push(`    ${kid}["${kwLabel}"]`);
	}
	for (const sh of internal.sharedNodes) {
		const label =
			sh.ids.length > 0
				? `(${formatDocIdsWithDegree(sh.ids, idToPath, inMap, outMap)})`
				: '';
		mermaidLines.push(`    ${sh.shortId}["${label}"]`);
	}
	mermaidLines.push('  end');

	// Filter out raw ids (long hex) for ext; then format with degree (external nodes often 0/0 in internal maps)
	const extIdsFiltered = (ids: string[]) =>
		ids.filter((id) => {
			const name = (idToPath.get(id) ?? id).split('/').pop() ?? id;
			if (name.length >= 24 && /^[a-f0-9]+$/i.test(name)) return false;
			return true;
		});
	const extOutFiltered = extIdsFiltered(extOutOnlyIds);
	const extInFiltered = extIdsFiltered(extInOnlyIds);
	const extMutualFiltered = extIdsFiltered(extMutualIds);
	if (extOutOnlyIds.length > 0) {
		const label =
			extOutFiltered.length > 0
				? `ext out<br>(${formatDocIdsWithDegree(extOutFiltered, idToPath, inMap, outMap)})`
				: 'ext out';
		mermaidLines.push(`  extOut_glue["${label}"]`);
	}
	if (extInOnlyIds.length > 0) {
		const label =
			extInFiltered.length > 0
				? `ext in<br>(${formatDocIdsWithDegree(extInFiltered, idToPath, inMap, outMap)})`
				: 'ext in';
		mermaidLines.push(`  extIn_glue["${label}"]`);
	}
	if (extMutualIds.length > 0) {
		const label =
			extMutualFiltered.length > 0
				? `ext mutual<br>(${formatDocIdsWithDegree(extMutualFiltered, idToPath, inMap, outMap)})`
				: 'ext mutual';
		mermaidLines.push(`  extMutual_glue["${label}"]`);
	}

	for (const e of intraEdges) {
		const fromA = idToAlias.get(e.from_node_id);
		const toA = idToAlias.get(e.to_node_id);
		if (fromA != null && toA != null) mermaidLines.push(`  ${fromA} --> ${toA}`);
	}
	for (const t of internal.keptTokens) {
		mermaidLines.push(`  ${groupNodeId} --> ${internal.kwToShortId.get(t)!}`);
	}
	for (const [sharedShortId, tokenNames] of internal.sharedContributors) {
		for (const t of tokenNames) {
			const kid = internal.kwToShortId.get(t);
			if (kid) mermaidLines.push(`  ${kid} --> ${sharedShortId}`);
		}
	}
	if (orphanIdsToShow.length > 0) {
		mermaidLines.push(`  ${groupNodeId} --> Orphans`);
	}
	if (extOutOnlyIds.length > 0) {
		mermaidLines.push(`  ${groupNodeId} --> extOut_glue`);
	}
	if (extInOnlyIds.length > 0) {
		mermaidLines.push(`  extIn_glue --> ${groupNodeId}`);
	}
	if (extMutualIds.length > 0) {
		mermaidLines.push(`  ${groupNodeId} --> extMutual_glue`);
		mermaidLines.push(`  extMutual_glue --> ${groupNodeId}`);
	}
	return mermaidLines.length > 1 ? mermaidLines.join('\n') : '';
}


/** Safe Mermaid node id: replace chars that break flowchart syntax. */
function mermaidNodeId(id: string): string {
	return id.replace(/[#\[\](){};,"\s]/g, '_');
}

/** Excel-style short alias: 0->A, 1->B, ..., 26->AA, 27->AB. Used so diagram and LLM use readable ids. */
function indexToAlias(i: number): string {
	if (i < 0) return '';
	let s = '';
	let n = i;
	do {
		s = String.fromCharCode(65 + (n % 26)) + s;
		n = Math.floor(n / 26) - 1;
	} while (n >= 0);
	return s;
}

/** Build id -> short alias map for a stable-ordered list of ids (no duplicates in order). */
function buildIdToAlias(orderedIds: string[]): Map<string, string> {
	const map = new Map<string, string>();
	const seen = new Set<string>();
	let idx = 0;
	for (const id of orderedIds) {
		if (seen.has(id)) continue;
		seen.add(id);
		map.set(id, indexToAlias(idx++));
	}
	return map;
}

/** Strip file extension from basename (e.g. "note.md" -> "note") for keyword tokenization. */
function basenameWithoutExtension(pathOrBasename: string): string {
	const basename = pathOrBasename.split('/').pop() ?? pathOrBasename;
	const noExt = basename.replace(/\.[^.]+$/, '').trim();
	return noExt || basename;
}

/** Prefix key from path: first token of basename (no extension). Unifies internal/external prefix grouping. */
function getBasenamePrefix(path: string): string | null {
	const base = basenameWithoutExtension(path);
	const tokens = filterTokensForGraph(tokenizePathOrLabel(base));
	return tokens[0] ?? null;
}

/** Format doc names for glue node label: join with ; and <br> for line breaks in Mermaid. */
function formatDocNamesForLabel(names: string[]): string {
	return names.map((n) => String(n).replace(/\]/g, '')).join(';<br>');
}

/** Format doc ids with in/out degree for node labels; omit 0 to save token (e.g. in:0 out:10 → "basename (out:10)"). */
function formatDocIdsWithDegree(
	ids: string[],
	idToPath: Map<string, string>,
	inMap: Map<string, number>,
	outMap: Map<string, number>
): string {
	return ids
		.map((id) => {
			const path = idToPath.get(id) ?? id;
			const basename = String((path.split('/').pop() ?? path)).replace(/\]/g, '');
			const inD = inMap.get(id) ?? 0;
			const outD = outMap.get(id) ?? 0;
			const inPart = inD > 0 ? `in:${inD}` : '';
			const outPart = outD > 0 ? `out:${outD}` : '';
			const degreePart =
				inPart && outPart ? ` (${inPart} ${outPart})` : inPart || outPart ? ` (${inPart || outPart})` : '';
			return basename + degreePart;
		})
		.join(';<br>');
}