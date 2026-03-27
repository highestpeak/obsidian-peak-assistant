/**
 * Weave paths into structured + mesh context (folder tree, tags, reference graph)
 * for downstream use. Single entry: weavePathsToContext(paths, templateManager).
 */

import type { TemplateManager } from '@/core/template/TemplateManager';
import { AgentTemplateId } from '@/core/template/TemplateRegistry';
import { GRAPH_TAGGED_EDGE_TYPES, GraphEdgeType } from '@/core/po/graph.po';
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
const CONNECTOR_MAX = 5;
const KEYWORD_MIN_FREQ = 2;
const KEYWORD_TOP_PER_DOC = 5;
const MAX_KW_TOKENS = 12;
const EDGE_QUERY_CHUNK = 400;
const GROUP_TREE_MAX_LINES = 14;
const SHARED_KW_TOP_TOKENS = 10;
const SHARED_MIN_DOCS = 1;
const MAX_PATHS_FOR_GRAPH = 500;
const GET_IDS_BY_PATHS_CHUNK = 400;

function dirname(path: string): string {
	const i = path.lastIndexOf('/');
	return i <= 0 ? '' : path.slice(0, i);
}

function stripFolderPrefixForDisplay(path: string, folderKey: string): string {
	if (folderKey === '') return path.split('/').pop() ?? path;
	const prefix = folderKey + '/';
	return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

interface PathTrieNode {
	segment: string;
	children: Map<string, PathTrieNode>;
	isEnd: boolean;
}

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
			const line = chain.length === 1 ? `${prefix}${chain[0]}` : `${prefix}${chain.join(' / ')}`;
			lines.push(line);
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

function normalizeFolderPrefixes(folderPaths: string[]): string[] {
	const unique = [...new Set(folderPaths)].filter(Boolean);
	return unique.filter(
		(f) => !unique.some((other) => other !== f && (f === other || f.startsWith(other + '/')))
	);
}

function chunk<T>(arr: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
	return out;
}

async function getIdsByPathsChunked(paths: string[]): Promise<{ id: string; path: string }[]> {
	if (paths.length === 0) return [];
	const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo();
	const results: { id: string; path: string }[] = [];
	for (const c of chunk(paths, GET_IDS_BY_PATHS_CHUNK)) {
		const rows = await indexedDocumentRepo.getIdsByPaths(c);
		results.push(...rows);
	}
	return results;
}

async function buildFolderLinesFromPaths(
	paths: string[],
	idByPath: Map<string, string>
): Promise<Array<{
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
	const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo();
	const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
	const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo();
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
			folderKey === '' ? await mobiusNodeRepo.countAllDocumentStatisticsRows() : await indexedDocumentRepo.countByFolderPath(folderKey);
		const extraCount = Math.max(0, totalInFolder - inGroupCount);
		const groupDocIds = groupPaths.map((p) => idByPath.get(p)).filter(Boolean) as string[];
		if (groupDocIds.length === 0) {
			folderLines.push({
				folderPath, inGroupCount, totalInFolder,
				extraCount: extraCount > 0 ? extraCount : undefined,
				hasTopRecent: false, topRecent: [], hasTopWordCount: false, topWordCount: [],
				hasTopLinksIn: false, topLinksIn: [], hasTopLinksOut: false, topLinksOut: [],
				hasNameKeywords: false, nameKeywords: [], hasFolderTagDesc: false, folderTagDesc: '',
			});
			continue;
		}
		const [topRecentRaw, topWordCountRaw, edgeCounts, tagCountsRaw] = await Promise.all([
			mobiusNodeRepo.getTopRecentEditedByDocIds(groupDocIds, FOLDER_STATS_EACH),
			mobiusNodeRepo.getTopWordCountByDocIds(groupDocIds, FOLDER_STATS_EACH),
			mobiusEdgeRepo.countEdges(groupDocIds, GraphEdgeType.References),
			chunkedTagCountsByFromNodes(mobiusEdgeRepo, groupDocIds, FOLDER_TOP_TAGS),
		]);
		const uniqueIds = [...new Set([
			...topRecentRaw.map((r) => r.doc_id),
			...topWordCountRaw.map((r) => r.doc_id),
			...Array.from(edgeCounts.incoming.keys()),
			...Array.from(edgeCounts.outgoing.keys()),
		])];
		const idToPath = new Map(
			(uniqueIds.length ? await indexedDocumentRepo.getByIds(uniqueIds) : []).map((m) => [m.id, m.path] as const)
		);
		const strip = (p: string) => stripFolderPrefixForDisplay(p, folderKey);
		const topRecent = topRecentRaw.map((r) => ({ path: strip(idToPath.get(r.doc_id) ?? r.doc_id) }));
		const topWordCount = topWordCountRaw.map((r) => ({
			path: strip(idToPath.get(r.doc_id) ?? r.doc_id),
			word_count: r.word_count,
		}));
		const topLinksIn = [...edgeCounts.incoming.entries()]
			.sort((a, b) => b[1] - a[1]).slice(0, FOLDER_STATS_EACH)
			.map(([node_id, inDegree]) => ({ path: strip(idToPath.get(node_id) ?? node_id), inDegree }));
		const topLinksOut = [...edgeCounts.outgoing.entries()]
			.sort((a, b) => b[1] - a[1]).slice(0, FOLDER_STATS_EACH)
			.map(([node_id, outDegree]) => ({ path: strip(idToPath.get(node_id) ?? node_id), outDegree }));
		const keywordCount = new Map<string, number>();
		for (const p of groupPaths) {
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
		const tagNodeMap = tagNodeIds.length ? await mobiusNodeRepo.getByIds(tagNodeIds) : new Map();
		const folderTagDesc = tagCountsRaw
			.map((r) => { const label = tagNodeMap.get(r.to_node_id)?.label ?? r.to_node_id; return `${label}(${r.count})`; })
			.join(', ');
		folderLines.push({
			folderPath, inGroupCount, totalInFolder,
			extraCount: extraCount > 0 ? extraCount : undefined,
			hasTopRecent: topRecent.length > 0, topRecent,
			hasTopWordCount: topWordCount.length > 0, topWordCount,
			hasTopLinksIn: topLinksIn.length > 0, topLinksIn,
			hasTopLinksOut: topLinksOut.length > 0, topLinksOut,
			hasNameKeywords: nameKeywords.length > 0, nameKeywords,
			hasFolderTagDesc: !!folderTagDesc.trim(), folderTagDesc,
		});
	}
	return folderLines;
}

async function chunkedTagCountsByFromNodes(
	graphEdgeRepo: { getByFromNodesAndTypes: (ids: string[], types: string[]) => Promise<Array<{ to_node_id: string; from_node_id: string }>> },
	fromNodeIds: string[],
	limitN: number
): Promise<Array<{ to_node_id: string; count: number }>> {
	if (!fromNodeIds.length || limitN <= 0) return [];
	const byTo = new Map<string, number>();
	for (const c of chunk(fromNodeIds, EDGE_QUERY_CHUNK)) {
		const edges = await graphEdgeRepo.getByFromNodesAndTypes(c, [...GRAPH_TAGGED_EDGE_TYPES]);
		for (const e of edges) byTo.set(e.to_node_id, (byTo.get(e.to_node_id) ?? 0) + 1);
	}
	return [...byTo.entries()].sort((a, b) => b[1] - a[1]).slice(0, limitN).map(([to_node_id, count]) => ({ to_node_id, count }));
}

interface SharedKwNode { shortId: string; tokenNames: string[]; basenames: string[]; ids: string[]; }
interface KeywordClusterResult {
	keptTokens: string[];
	kwToShortId: Map<string, string>;
	tokenToBasenames: Map<string, string[]>;
	tokenToIds: Map<string, Set<string>>;
	sharedNodes: SharedKwNode[];
	sharedContributors: Map<string, string[]>;
	docIdsInKwOrShared: Set<string>;
}

function basenameWithoutExtension(pathOrBasename: string): string {
	const basename = pathOrBasename.split('/').pop() ?? pathOrBasename;
	const noExt = basename.replace(/\.[^.]+$/, '').trim();
	return noExt || basename;
}

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
			if (!set) { set = new Set(); tokenToIds.set(t, set); }
			set.add(id);
		}
	}
	let keptTokens = [...tokenToIds.keys()].filter((t) => (tokenToIds.get(t)?.size ?? 0) >= KEYWORD_MIN_FREQ);
	keptTokens.sort((a, b) => {
		const lenA = a.length, lenB = b.length;
		if (lenB !== lenA) return lenB - lenA;
		return (tokenToIds.get(b)?.size ?? 0) - (tokenToIds.get(a)?.size ?? 0);
	});
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
	mergedLabels.sort((a, b) => (mergedTokenToIds.get(b)?.size ?? 0) - (mergedTokenToIds.get(a)?.size ?? 0));
	keptTokens = mergedLabels;
	tokenToIds.clear();
	for (const t of keptTokens) tokenToIds.set(t, mergedTokenToIds.get(t)!);
	const tokenToBasenames = new Map<string, string[]>();
	for (const t of keptTokens) {
		const ids = tokenToIds.get(t);
		tokenToBasenames.set(t, ids ? [...ids].map((id) => (idToPath.get(id) ?? id).split('/').pop() ?? id) : []);
	}
	let idx = 0;
	const kwToShortId = new Map<string, string>();
	for (const t of keptTokens) kwToShortId.set(t, `${shortIdPrefix}_${indexToAlias(idx++)}`);
	const topForShared = keptTokens.slice(0, SHARED_KW_TOP_TOKENS);
	type Candidate = { ids: Set<string>; tokens: string[] };
	const candidates: Candidate[] = [];
	for (let i = 0; i < topForShared.length; i++) {
		for (let j = i + 1; j < topForShared.length; j++) {
			const t1 = topForShared[i], t2 = topForShared[j];
			const s1 = tokenToIds.get(t1)!, s2 = tokenToIds.get(t2)!;
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
	for (const t of keptTokens) {
		const ids = tokenToIds.get(t);
		tokenToBasenames.set(t, ids ? [...ids].map((id) => (idToPath.get(id) ?? id).split('/').pop() ?? id) : []);
	}
	const docIdsInKwOrShared = new Set<string>();
	for (const t of keptTokens) {
		const set = tokenToIds.get(t);
		if (set) for (const id of set) docIdsInKwOrShared.add(id);
	}
	for (const id of alreadyAssigned) docIdsInKwOrShared.add(id);
	return {
		keptTokens, kwToShortId, tokenToBasenames, tokenToIds,
		sharedNodes, sharedContributors, docIdsInKwOrShared,
	};
}

interface MermaidGraphData {
	internalIds: string[];
	internalNodeIds_TopReference: string[];
	internalInDegreeMap: Map<string, number>;
	internalOutDegreeMap: Map<string, number>;
	intraEdges: Array<{ from_node_id: string; to_node_id: string }>;
	extOut: Array<{ to_node_id: string; count: number }>;
	extIn: Array<{ from_node_id: string; count: number }>;
	extOutOnlyIds: string[];
	extInOnlyIds: string[];
	extMutualIds: string[];
	allExtNodeIds: string[];
	allNodeIdToPath: Map<string, string>;
	nodeIdToAlias: Map<string, string>;
}

async function loadMermaidGraphDataFromPaths(
	internalIds: string[],
	pathById: Map<string, string>
): Promise<MermaidGraphData | null> {
	if (internalIds.length === 0) return null;
	const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo();
	const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo();
	const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
	const { inMap: internalInDegreeMap, outMap: internalOutDegreeMap } = await mobiusEdgeRepo.getDegreeMapsByNodeIdsChunked(internalIds, GraphEdgeType.References);
	const allNodeIds = new Set([...internalInDegreeMap.keys(), ...internalOutDegreeMap.keys()]);
	const totalByNode = new Map<string, number>();
	for (const nid of allNodeIds) {
		const total = (internalInDegreeMap.get(nid) ?? 0) + (internalOutDegreeMap.get(nid) ?? 0);
		if (total > GRAPH_MIN_DEGREE) totalByNode.set(nid, total);
	}
	const topByDegree = [...totalByNode.entries()].sort((a, b) => b[1] - a[1]).slice(0, GRAPH_INTERNAL_NODES_TOP_K).map(([id]) => id);
	if (topByDegree.length === 0) return null;
	const topSet = new Set(topByDegree);
	const internalSet = new Set(internalIds);
	const [fromEdges, toEdges, { extOut, extIn }] = await Promise.all([
		mobiusEdgeRepo.getByFromNodesAndTypes(topByDegree, [GraphEdgeType.References]),
		mobiusEdgeRepo.getByToNodesAndTypes(topByDegree, [GraphEdgeType.References]),
		mobiusEdgeRepo.getExternalEdgeCountsChunked(internalIds, GraphEdgeType.References, GRAPH_EXTERNAL_NODES_TOP_K),
	]);
	const connectorScore = new Map<string, number>();
	for (const e of fromEdges) {
		if (internalSet.has(e.to_node_id) && !topSet.has(e.to_node_id))
			connectorScore.set(e.to_node_id, (connectorScore.get(e.to_node_id) ?? 0) + 1);
	}
	for (const e of toEdges) {
		if (internalSet.has(e.from_node_id) && !topSet.has(e.from_node_id))
			connectorScore.set(e.from_node_id, (connectorScore.get(e.from_node_id) ?? 0) + 1);
	}
	const connectors = [...connectorScore.entries()].sort((a, b) => b[1] - a[1]).slice(0, CONNECTOR_MAX).map(([id]) => id);
	const internalNodeIds_TopReference = [...topByDegree, ...connectors];
	const intraEdges = await mobiusEdgeRepo.getIntraEdges(internalNodeIds_TopReference, GraphEdgeType.References);
	const allExtNodeIds = [...new Set([...extOut.map((r) => r.to_node_id), ...extIn.map((r) => r.from_node_id)])];
	const extOutIdSet = new Set(extOut.map((r) => r.to_node_id));
	const extInIdSet = new Set(extIn.map((r) => r.from_node_id));
	const extMutualIds = [...extOutIdSet].filter((id) => extInIdSet.has(id));
	const extOutOnlyIds = [...extOutIdSet].filter((id) => !extInIdSet.has(id));
	const extInOnlyIds = [...extInIdSet].filter((id) => !extOutIdSet.has(id));
	if (allExtNodeIds.length > 0) {
		const { inMap: extInMap, outMap: extOutMap } = await mobiusEdgeRepo.getDegreeMapsByNodeIdsChunked(allExtNodeIds, GraphEdgeType.References);
		for (const [id, d] of extInMap) internalInDegreeMap.set(id, d);
		for (const [id, d] of extOutMap) internalOutDegreeMap.set(id, d);
	}
	const allNodeIdToPath = new Map(pathById);
	const metaRows = await indexedDocumentRepo.getByIds([...internalNodeIds_TopReference, ...allExtNodeIds]);
	for (const m of metaRows) allNodeIdToPath.set(m.id, m.path);
	const extIdsWithoutPath = allExtNodeIds.filter((id) => !allNodeIdToPath.has(id));
	if (extIdsWithoutPath.length > 0) {
		const graphNodeMap = await mobiusNodeRepo.getByIds(extIdsWithoutPath);
		for (const id of extIdsWithoutPath) allNodeIdToPath.set(id, graphNodeMap.get(id)?.label ?? id);
	}
	const nodeIdToAlias = buildIdToAlias([...internalNodeIds_TopReference, ...allExtNodeIds]);
	return {
		internalIds, internalNodeIds_TopReference, internalInDegreeMap, internalOutDegreeMap, intraEdges,
		extOut, extIn, extOutOnlyIds, extInOnlyIds, extMutualIds, allExtNodeIds, allNodeIdToPath, nodeIdToAlias,
	};
}

function indexToAlias(i: number): string {
	if (i < 0) return '';
	let s = '';
	let n = i;
	do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
	return s;
}

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

function formatDocIdsWithDegree(
	ids: string[],
	idToPath: Map<string, string>,
	inMap: Map<string, number>,
	outMap: Map<string, number>
): string {
	return ids.map((id) => {
		const path = idToPath.get(id) ?? id;
		const basename = String((path.split('/').pop() ?? path)).replace(/\]/g, '');
		const inD = inMap.get(id) ?? 0, outD = outMap.get(id) ?? 0;
		const inPart = inD > 0 ? `in:${inD}` : '', outPart = outD > 0 ? `out:${outD}` : '';
		const degreePart = inPart && outPart ? ` (${inPart} ${outPart})` : inPart || outPart ? ` (${inPart || outPart})` : '';
		return basename + degreePart;
	}).join(';<br>');
}

function emitMermaidFlowchart(pathPrefixes: string[], data: MermaidGraphData, internal: KeywordClusterResult): string {
	const {
		internalNodeIds_TopReference: displayNodeIds,
		allNodeIdToPath: idToPath,
		internalInDegreeMap: inMap,
		internalOutDegreeMap: outMap,
		intraEdges, nodeIdToAlias: idToAlias,
		extOutOnlyIds, extInOnlyIds, extMutualIds,
	} = data;
	const hasIntraEdge = new Set<string>();
	for (const e of intraEdges) { hasIntraEdge.add(e.from_node_id); hasIntraEdge.add(e.to_node_id); }
	const connectedNodeIds = displayNodeIds.filter((nid) => hasIntraEdge.has(nid));
	const isolatedNodeIds = displayNodeIds.filter((nid) => !hasIntraEdge.has(nid));
	const orphanIdsToShow = isolatedNodeIds.filter((id) => !internal.docIdsInKwOrShared.has(id));
	const mermaidLines: string[] = ['flowchart TD'];
	const groupNodeId = 'Group';
	const groupLabel = renderPathPrefixTreeToLabel(pathPrefixes);
	mermaidLines.push(`  subgraph groupWrap ["Group"]`);
	mermaidLines.push(`    ${groupNodeId}["${groupLabel}"]`);
	for (const nid of connectedNodeIds) {
		const alias = idToAlias.get(nid);
		if (alias == null) continue;
		const path = idToPath.get(nid) ?? nid;
		const basename = String((path.split('/').pop() ?? path)).replace(/\]/g, '');
		const inD = inMap.get(nid) ?? 0, outD = outMap.get(nid) ?? 0;
		const inPart = inD > 0 ? `in:${inD}` : '', outPart = outD > 0 ? `out:${outD}` : '';
		const degreePart = inPart && outPart ? ` (${inPart} ${outPart})` : inPart || outPart ? ` (${inPart || outPart})` : '';
		mermaidLines.push(`    ${alias}["${basename + degreePart}"]`);
	}
	if (orphanIdsToShow.length > 0) {
		const orphansLabel = `Orphans<br>(${formatDocIdsWithDegree(orphanIdsToShow, idToPath, inMap, outMap)})`;
		mermaidLines.push(`    Orphans["${orphansLabel}"]`);
	}
	const kwIdsSeen = new Set<string>();
	for (const t of internal.keptTokens) {
		const kid = internal.kwToShortId.get(t)!;
		if (kwIdsSeen.has(kid)) continue;
		kwIdsSeen.add(kid);
		const ids = [...(internal.tokenToIds.get(t) ?? [])];
		const kwLabel = ids.length > 0 ? `kw: ${t}<br>(${formatDocIdsWithDegree(ids, idToPath, inMap, outMap)})` : `kw: ${t}`;
		mermaidLines.push(`    ${kid}["${kwLabel}"]`);
	}
	for (const sh of internal.sharedNodes) {
		const label = sh.ids.length > 0 ? `(${formatDocIdsWithDegree(sh.ids, idToPath, inMap, outMap)})` : '';
		mermaidLines.push(`    ${sh.shortId}["${label}"]`);
	}
	mermaidLines.push('  end');
	const extIdsFiltered = (ids: string[]) => ids.filter((id) => {
		const name = (idToPath.get(id) ?? id).split('/').pop() ?? id;
		return !(name.length >= 24 && /^[a-f0-9]+$/i.test(name));
	});
	if (extOutOnlyIds.length > 0) mermaidLines.push(`  extOut_glue["${extIdsFiltered(extOutOnlyIds).length > 0 ? `ext out<br>(${formatDocIdsWithDegree(extIdsFiltered(extOutOnlyIds), idToPath, inMap, outMap)})` : 'ext out'}"]`);
	if (extInOnlyIds.length > 0) mermaidLines.push(`  extIn_glue["${extIdsFiltered(extInOnlyIds).length > 0 ? `ext in<br>(${formatDocIdsWithDegree(extIdsFiltered(extInOnlyIds), idToPath, inMap, outMap)})` : 'ext in'}"]`);
	if (extMutualIds.length > 0) mermaidLines.push(`  extMutual_glue["${extIdsFiltered(extMutualIds).length > 0 ? `ext mutual<br>(${formatDocIdsWithDegree(extIdsFiltered(extMutualIds), idToPath, inMap, outMap)})` : 'ext mutual'}"]`);
	for (const e of intraEdges) {
		const fromA = idToAlias.get(e.from_node_id), toA = idToAlias.get(e.to_node_id);
		if (fromA != null && toA != null) mermaidLines.push(`  ${fromA} --> ${toA}`);
	}
	for (const t of internal.keptTokens) mermaidLines.push(`  ${groupNodeId} --> ${internal.kwToShortId.get(t)!}`);
	for (const [sharedShortId, tokenNames] of internal.sharedContributors) {
		for (const t of tokenNames) { const kid = internal.kwToShortId.get(t); if (kid) mermaidLines.push(`  ${kid} --> ${sharedShortId}`); }
	}
	if (orphanIdsToShow.length > 0) mermaidLines.push(`  ${groupNodeId} --> Orphans`);
	if (extOutOnlyIds.length > 0) mermaidLines.push(`  ${groupNodeId} --> extOut_glue`);
	if (extInOnlyIds.length > 0) mermaidLines.push(`  extIn_glue --> ${groupNodeId}`);
	if (extMutualIds.length > 0) { mermaidLines.push(`  ${groupNodeId} --> extMutual_glue`); mermaidLines.push(`  extMutual_glue --> ${groupNodeId}`); }
	return mermaidLines.length > 1 ? mermaidLines.join('\n') : '';
}

/**
 * Weave paths into structured + mesh context markdown (folder tree, top tags, reference graph).
 * Returns empty when no templateManager or no paths; on error returns fallback message.
 */
export async function weavePathsToContext(
	paths: string[],
	templateManager: TemplateManager | undefined
): Promise<string> {
	if (!paths.length) return '';
	if (!templateManager) return '';
	const normalized = [...new Set(paths)].filter((p) => /\.md$/i.test(p)).sort();
	if (normalized.length === 0) return '';
	const graphRepo = sqliteStoreManager.getGraphRepo();
	try {
		const idMaps = await getIdsByPathsChunked(normalized);
		const pathById = new Map(idMaps.map((m) => [m.id, m.path]));
		const idByPath = new Map(idMaps.map((m) => [m.path, m.id]));
		const docIds = idMaps.map((m) => m.id);
		if (docIds.length === 0) return '';
		const folderLines = await buildFolderLinesFromPaths(normalized, idByPath);
		const { topicTagCounts, keywordTagCounts } = await graphRepo.getTagsByDocIds(docIds);
		const tagDesc = Array.from(topicTagCounts.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, TOP_TAGS)
			.map(([name, count]) => `${name}(${count})`)
			.join(', ');
		const userKeywordTagDesc = Array.from(keywordTagCounts.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, TOP_TAGS)
			.map(([name, count]) => `${name}(${count})`)
			.join(', ');
		const pathsForGraph = normalized.length > MAX_PATHS_FOR_GRAPH ? normalized.slice(0, MAX_PATHS_FOR_GRAPH) : normalized;
		const idMapsForGraph = pathsForGraph.length === normalized.length ? idMaps : await getIdsByPathsChunked(pathsForGraph);
		const internalIdsForGraph = idMapsForGraph.map((m) => m.id);
		const pathByIdForGraph = new Map(idMapsForGraph.map((m) => [m.id, m.path]));
		const folderPrefixes = normalizeFolderPrefixes(pathsForGraph.map((p) => dirname(p)));
		let mermaidCode = '';
		const data = await loadMermaidGraphDataFromPaths(internalIdsForGraph, pathByIdForGraph);
		if (data) {
			const internal = buildKeywordCluster(
				data.internalNodeIds_TopReference.map((id) => ({ id, path: data.allNodeIdToPath.get(id) ?? '' })),
				data.allNodeIdToPath, 'int'
			);
			mermaidCode = emitMermaidFlowchart(folderPrefixes, data, internal);
		}
		const payload = {
			hasFolderLines: folderLines.length > 0, folderLines,
			hasTagDesc: !!tagDesc.trim(), tagDesc,
			hasUserKeywordTagDesc: !!userKeywordTagDesc.trim(),
			userKeywordTagDesc,
			hasMermaidCode: !!mermaidCode, mermaidCode,
		};
		return await templateManager.render(AgentTemplateId.WeavePathsContext, payload);
	} catch (err) {
		console.warn('[weavePathsToContext]', err);
		return '(Weaved context unavailable: data error)';
	}
}
