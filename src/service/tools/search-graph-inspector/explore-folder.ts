import { SLICE_CAPS } from '@/core/constant';
import { GRAPH_WIKI_REFERENCE_EDGE_TYPES } from '@/core/po/graph.po';
import { AppContext } from "@/app/context/AppContext";
import { getAIHubSummaryFolder } from '@/app/settings/types';
import { humanReadableTime } from "@/core/utils/date-utils";
import { compactPathsForPrompt, compactPathsWithSuffix } from "@/core/utils/pathTreeCompact";
import { sqliteStoreManager } from "@/core/storage/sqlite/SqliteStoreManager";
import { TFile, TFolder } from "obsidian";
import type { TemplateManager } from "@/core/template/TemplateManager";
import { ToolTemplateId } from "@/core/template/TemplateRegistry";

export type OmittedSummary = { total: number; byExt: Record<string, number>; folderCount: number };

export type IterFile = {
    type: "folder" | "file";
    path: string;
    name: string;
    linkPath: string;
    depth: number;
    mtime?: number;
    sameGroupCount?: number;
    patternName?: string;
    children?: IterFile[];
    omitted?: OmittedSummary;
};

const DEFAULT_LIMIT = 50;

type DocStats = {
    totalFiles: number;
    topRecentEdited: { items: Array<{ path: string; updated_at: number; sameGroupCount: number }>; totalItems: number; totalGroups: number; compressedCount: number };
    topWordCount: Array<{ path: string; word_count: number }>;
    topCharCount: Array<{ path: string; char_count: number }>;
    topRichness: Array<{ path: string; richness_score: number }>;
    topLinksIn: Array<{ path: string; inDegree: number }>;
    topLinksOut: Array<{ path: string; outDegree: number }>;
    hasTopLinks: boolean;
    languageStats?: Record<string, number>;
};
const EMPTY_DOC_STATS: DocStats = {
    totalFiles: 0,
    topRecentEdited: { items: [], totalItems: 0, totalGroups: 0, compressedCount: 0 },
    topWordCount: [], topCharCount: [], topRichness: [],
    topLinksIn: [], topLinksOut: [], hasTopLinks: false, languageStats: undefined,
};

/** Helper: compact a list with suffix, or '' if empty. */
function compactOrEmpty<T>(items: T[], mapFn: (i: T) => { path: string; suffix: string }): string {
    return items.length > 0 ? compactPathsWithSuffix(items.map(mapFn), 40, 3500) : '';
}

export async function exploreFolder(params: any, templateManager?: TemplateManager) {
    const { folderPath, recursive, max_depth, limit, response_format } = params;
    const perFolderLimit = Math.max(1, Number(limit) ?? DEFAULT_LIMIT);
    const vault = AppContext.getInstance().app.vault;
    const normalizedPath = normalizeVaultFolderPath(folderPath);
    const exclusions = getExploreFolderExclusions();
    if (exclusions.enabled && isPathExcluded(normalizedPath, exclusions.excludedPathPrefixes)) {
        return renderExploreFolderExcludedMarkdown(folderPath, exclusions.excludedPathPrefixes);
    }
    const targetFolder = normalizedPath === "" ? vault.getRoot() : vault.getAbstractFileByPath(normalizedPath) as TFolder;
    if (!targetFolder || !(targetFolder instanceof TFolder)) return `Folder not found: ${folderPath}`;

    const fullTree = getFolderStructure(targetFolder, recursive, max_depth ?? 3, 0, exclusions.enabled ? exclusions.excludedPathPrefixes : undefined);
    if (!getAllFilePaths(fullTree).length) return "No files found in the folder";

    const { items: finalFileTree, omitted: rootOmitted } = limitAndSortTree(fullTree, perFolderLimit);
    const visibleFilePaths = getAllFilePaths(finalFileTree);

    const [{ tagDesc, userKeywordTagDesc, categoryDesc }, docStats] = await Promise.all([
        exclusions.enabled
            ? getTagsAndCategoriesByDocPaths(visibleFilePaths, perFolderLimit)
            : getTagsAndCategoriesByFolderPath(normalizedPath, perFolderLimit),
        exclusions.enabled
            ? getDocStatisticsByDocPaths(visibleFilePaths, perFolderLimit)
            : getDocStatisticsByFolderPath(normalizedPath, perFolderLimit),
    ]);

    const data = {
        current_path: folderPath, recursive, max_depth: max_depth || 3,
        fileTree: finalFileTree,
        compactFileTree: compactPathsForPrompt(visibleFilePaths, 80, 6000),
        compactRecentEdited: compactOrEmpty(docStats.topRecentEdited.items, (i) => ({
            path: i.path,
            suffix: ` (${humanReadableTime(i.updated_at)})${(i.sameGroupCount ?? 0) > 1 ? ` _(${i.sameGroupCount} similar)_` : ''}`,
        })),
        compactWordCount: compactOrEmpty(docStats.topWordCount, (i) => ({ path: i.path, suffix: `: ${i.word_count} words` })),
        compactCharCount: compactOrEmpty(docStats.topCharCount, (i) => ({ path: i.path, suffix: `: ${i.char_count} characters` })),
        compactRichness: compactOrEmpty(docStats.topRichness, (i) => ({ path: i.path, suffix: `: ${i.richness_score} richness` })),
        compactTopLinksIn: compactOrEmpty(docStats.topLinksIn, (i) => ({ path: i.path, suffix: `: ${i.inDegree}` })),
        compactTopLinksOut: compactOrEmpty(docStats.topLinksOut, (i) => ({ path: i.path, suffix: `: ${i.outDegree}` })),
        sameGroupCountByPath: buildSameGroupCountByPath(finalFileTree),
        rootOmitted, tagDesc, userKeywordTagDesc, categoryDesc, docStats,
    };
    return buildExploreFolderResponse(response_format, data, templateManager);
}

function getFolderStructure(folder: TFolder, recursive: boolean, maxDepth: number, currentDepth: number, excludedPathPrefixes?: string[]): IterFile[] {
    const result: IterFile[] = [];
    for (const child of folder.children) {
        if (excludedPathPrefixes?.length && isPathExcluded(child.path, excludedPathPrefixes)) continue;
        const mtime = (child as TFile & TFolder).stat?.mtime ?? 0;
        const name = child.path.split("/").pop() ?? child.path;
        if (child instanceof TFolder) {
            const children = recursive && currentDepth < maxDepth - 1
                ? getFolderStructure(child, recursive, maxDepth, currentDepth + 1, excludedPathPrefixes) : undefined;
            result.push({ type: "folder", path: child.path, name, linkPath: "", depth: 0, mtime, children });
        } else if (child instanceof TFile) {
            result.push({ type: "file", path: child.path, name, linkPath: "", depth: 0, mtime });
        }
    }
    return result;
}

function linkPathRelativeTo(fullPath: string, parentPath: string): string {
    if (!parentPath) return fullPath;
    const prefix = parentPath + "/";
    return fullPath.startsWith(prefix) ? fullPath.slice(prefix.length) : fullPath;
}

function basenameKey(it: IterFile): string {
    return normalizeRecentEditedKey(it.name ?? it.path.split("/").pop() ?? "");
}

/** Group file siblings by normalized basename; one representative per group (latest mtime). */
function compressFileSiblings(items: IterFile[], rest: IterFile[] = []): IterFile[] {
    if (!items.some((it) => it.type === "file")) return items;
    const keyToGroup = new Map<string, IterFile[]>();
    for (const f of items) if (f.type === "file") {
        const key = basenameKey(f);
        (keyToGroup.get(key) ?? (keyToGroup.set(key, []), keyToGroup.get(key)!)).push(f);
    }
    const restCountByKey = new Map<string, number>();
    for (const it of rest) if (it.type === "file") {
        const key = basenameKey(it);
        if (key) restCountByKey.set(key, (restCountByKey.get(key) ?? 0) + 1);
    }
    const keyToRep = new Map<string, IterFile>();
    for (const [key, group] of keyToGroup) {
        const rep = [...group].sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0))[0];
        const ext = rep.path.split(".").pop() ?? "";
        const total = group.length + (restCountByKey.get(key) ?? 0);
        keyToRep.set(key, { ...rep, sameGroupCount: total, ...(total > 1 ? { patternName: ext ? `${key}.${ext}` : key } : {}) });
    }
    const seen = new Set<string>();
    const result: IterFile[] = [];
    for (const it of items) {
        if (it.type === "folder") { result.push(it); continue; }
        const key = basenameKey(it);
        if (seen.has(key)) continue;
        seen.add(key);
        const rep = keyToRep.get(key);
        if (rep) result.push(rep);
    }
    return result;
}

/** Sort+limit at each level, set depth/linkPath, compress file siblings. */
function limitAndSortTree(nodes: IterFile[], limit: number, parentPath = "", depth = 0): { items: IterFile[]; omitted?: OmittedSummary; rest: IterFile[] } {
    const sorted = [...nodes].sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0));
    const taken = sorted.slice(0, limit);
    const rest = sorted.slice(limit);
    const omitted = rest.length ? summarizeOmitted(rest) : undefined;
    const rawItems = taken.map((node) => {
        const linkPath = linkPathRelativeTo(node.path, parentPath);
        const base = { path: node.path, name: node.name, linkPath, depth, mtime: node.mtime };
        if (node.type === "file") return { type: "file" as const, ...base };
        const { items: children, omitted: childOmitted } = limitAndSortTree(node.children ?? [], limit, node.path, depth + 1);
        return { type: "folder" as const, ...base, children, omitted: childOmitted };
    });
    return { items: compressFileSiblings(rawItems, rest), omitted, rest };
}

function summarizeOmitted(rest: IterFile[]): OmittedSummary {
    const byExt: Record<string, number> = {};
    let folderCount = 0;
    for (const item of rest) {
        if (item.type === "folder") folderCount++;
        else { const ext = item.path.split(".").pop()?.toLowerCase() ?? "unknown"; byExt[ext] = (byExt[ext] ?? 0) + 1; }
    }
    return { total: rest.length, byExt, folderCount };
}

function normalizeRecentEditedKey(basename: string): string {
    if (!basename || typeof basename !== "string") return basename || "";
    const withoutExt = basename.replace(/\.[^.]+$/, "");
    return withoutExt.replace(/^\d+\s*-\s*/, "*").replace(/\d{6,}(\s*-\s*)?/g, "*").trim() || withoutExt;
}

function compressRecentEdited(items: Array<{ path: string; updated_at: number }>): { items: Array<{ path: string; updated_at: number; sameGroupCount: number }>; totalItems: number; totalGroups: number } {
    if (!items.length) return { items: [], totalItems: 0, totalGroups: 0 };
    const keyToGroup = new Map<string, Array<{ path: string; updated_at: number }>>();
    for (const it of items) {
        const key = normalizeRecentEditedKey(it.path.split("/").pop() ?? it.path);
        (keyToGroup.get(key) ?? (keyToGroup.set(key, []), keyToGroup.get(key)!)).push(it);
    }
    const result = [...keyToGroup.values()].map((group) => {
        const rep = [...group].sort((a, b) => b.updated_at - a.updated_at)[0];
        return { path: rep.path, updated_at: rep.updated_at, sameGroupCount: group.length };
    }).sort((a, b) => b.updated_at - a.updated_at);
    return { items: result, totalItems: items.length, totalGroups: result.length };
}

function getAllFilePaths(fileTree: IterFile[]): string[] {
    return fileTree.flatMap((item) =>
        item.type === "file" ? [item.path] : item.children ? getAllFilePaths(item.children) : [],
    );
}

function buildSameGroupCountByPath(tree: IterFile[]): Record<string, number> {
    const out: Record<string, number> = {};
    const walk = (nodes: IterFile[]) => {
        for (const n of nodes) {
            if (n.type === "file" && n.sameGroupCount && n.sameGroupCount > 1) out[n.path] = n.sameGroupCount;
            if (n.children?.length) walk(n.children);
        }
    };
    walk(tree);
    return out;
}

const EMPTY_TAG_DESC = { tagDesc: "", userKeywordTagDesc: "", categoryDesc: "" };

/** Format a tag count map to "name(count), ..." string. */
function formatTagCounts(counts: Map<string, number>, topN: number): string {
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN).map(([n, c]) => `${n}(${c})`).join(", ");
}

function formatTagResult(tags: { topicTagCounts: Map<string, number>; functionalTagCounts: Map<string, number>; keywordTagCounts: Map<string, number> }, topN: number) {
    return {
        tagDesc: formatTagCounts(tags.topicTagCounts, topN),
        userKeywordTagDesc: formatTagCounts(tags.keywordTagCounts, topN),
        categoryDesc: formatTagCounts(tags.functionalTagCounts, topN),
    };
}

async function getTagsAndCategoriesByFolderPath(pathPrefix: string, topN = 20) {
    const docIds = pathPrefix === ""
        ? undefined
        : (await sqliteStoreManager.getIndexedDocumentRepo().getIdsByFolderPath(pathPrefix)).map((m) => m.id);
    if (docIds !== undefined && !docIds.length) return EMPTY_TAG_DESC;
    return formatTagResult(await sqliteStoreManager.getGraphRepo().getTagsByDocIds(docIds), topN);
}

/** Map edge count entries to sorted top-K array. */
function topKFromMap<V>(map: Map<string, number>, topK: number, mkEntry: (id: string, count: number) => V): V[] {
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, topK).map(([id, c]) => mkEntry(id, c));
}

/** Build final DocStats result from raw DB rows + idToPathMap. */
function buildDocStatsResult(
    totalFiles: number,
    topRecentEditedRaw: Array<{ doc_id: string; updated_at: number }>,
    topWordCount: Array<{ doc_id: string; word_count: number }>,
    topCharCount: Array<{ doc_id: string; char_count: number }>,
    topRichness: Array<{ doc_id: string; richness_score: number }>,
    topLinksInRaw: Array<{ node_id: string; inDegree: number }>,
    topLinksOutRaw: Array<{ node_id: string; outDegree: number }>,
    languageStatsRows: Array<{ language: string; count: number }>,
    idToPathMap: Map<string, string>,
): DocStats {
    const p = (id: string) => idToPathMap.get(id) ?? id;
    const topRecentEdited = compressRecentEdited(topRecentEditedRaw.map((i) => ({ path: p(i.doc_id), updated_at: i.updated_at })));
    const langStats: Record<string, number> = {};
    for (const r of languageStatsRows) langStats[r.language] = r.count;
    return {
        totalFiles,
        topRecentEdited: { ...topRecentEdited, compressedCount: topRecentEdited.totalItems - topRecentEdited.totalGroups },
        topWordCount: topWordCount.map((i) => ({ path: p(i.doc_id), word_count: i.word_count })),
        topCharCount: topCharCount.map((i) => ({ path: p(i.doc_id), char_count: i.char_count })),
        topRichness: topRichness.map((i) => ({ path: p(i.doc_id), richness_score: i.richness_score })),
        topLinksIn: topLinksInRaw.map((i) => ({ path: p(i.node_id), inDegree: i.inDegree })),
        topLinksOut: topLinksOutRaw.map((i) => ({ path: p(i.node_id), outDegree: i.outDegree })),
        hasTopLinks: topLinksInRaw.length > 0 || topLinksOutRaw.length > 0,
        languageStats: Object.keys(langStats).length > 0 ? langStats : undefined,
    };
}

async function getDocStatisticsByFolderPath(pathPrefix: string, topK = 5): Promise<DocStats> {
    const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo();
    const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
    const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo();
    const docIdsMaps = pathPrefix === "" ? null : await indexedDocumentRepo.getIdsByFolderPath(pathPrefix);
    const docIds = docIdsMaps === null ? undefined : docIdsMaps.map((m) => m.id);
    if (docIds !== undefined && !docIds.length) return { ...EMPTY_DOC_STATS };

    const [topRecentEditedRaw, topWordCount, topCharCount, topRichness, languageStatsRows, totalFiles, { topLinksInRaw, topLinksOutRaw }] = await Promise.all([
        mobiusNodeRepo.getTopRecentEditedByDocIds(docIds, topK),
        mobiusNodeRepo.getTopWordCountByDocIds(docIds, topK),
        mobiusNodeRepo.getTopCharCountByDocIds(docIds, topK),
        mobiusNodeRepo.getTopRichnessByDocIds(docIds, topK),
        mobiusNodeRepo.getLanguageStatsByDocIds(docIds),
        docIds === undefined ? mobiusNodeRepo.countAllDocumentStatisticsRows() : Promise.resolve(docIds.length),
        pathPrefix === ""
            ? mobiusEdgeRepo.getTopNodeIdsByDegree(topK, undefined, GRAPH_WIKI_REFERENCE_EDGE_TYPES).then((r) => ({
                topLinksInRaw: r.topByInDegree.map((x) => ({ node_id: x.nodeId, inDegree: x.inDegree })),
                topLinksOutRaw: r.topByOutDegree.map((x) => ({ node_id: x.nodeId, outDegree: x.outDegree })),
            }))
            : mobiusEdgeRepo.countEdges(docIds!).then(({ incoming, outgoing }) => ({
                topLinksInRaw: topKFromMap(incoming, topK, (id, n) => ({ node_id: id, inDegree: n })),
                topLinksOutRaw: topKFromMap(outgoing, topK, (id, n) => ({ node_id: id, outDegree: n })),
            })),
    ]);

    const allIds = [...new Set([
        ...topRecentEditedRaw.map((r) => r.doc_id), ...topWordCount.map((r) => r.doc_id),
        ...topCharCount.map((r) => r.doc_id), ...topRichness.map((r) => r.doc_id),
        ...topLinksInRaw.map((r) => r.node_id), ...topLinksOutRaw.map((r) => r.node_id),
    ])];
    const idToPathMap = docIdsMaps !== null
        ? new Map(docIdsMaps.map((m) => [m.id, m.path]))
        : new Map((allIds.length ? await indexedDocumentRepo.getByIds(allIds) : []).map((m) => [m.id, m.path]));

    return buildDocStatsResult(totalFiles, topRecentEditedRaw, topWordCount, topCharCount, topRichness, topLinksInRaw, topLinksOutRaw, languageStatsRows, idToPathMap);
}

function normalizeVaultFolderPath(folderPath: unknown): string {
    const raw = folderPath == null ? "" : String(folderPath).trim();
    return (raw === "" || raw === "/") ? "" : raw.replace(/^\/+|\/+$/g, "");
}

function isPathExcluded(path: string, excludedPathPrefixes: string[]): boolean {
    if (!excludedPathPrefixes.length) return false;
    const p = normalizeVaultFolderPath(path);
    if (p === "") return false;
    const hub = normalizeVaultFolderPath(getAIHubSummaryFolder());
    if (hub && (p === hub || p.startsWith(hub + "/"))) return false;
    return excludedPathPrefixes.some((raw) => {
        const prefix = normalizeVaultFolderPath(raw);
        return prefix && (p === prefix || p.startsWith(prefix + "/"));
    });
}

function getExploreFolderExclusions(): { enabled: boolean; excludedPathPrefixes: string[] } {
    const settings = AppContext.getInstance().settings;
    if (!(settings.search.aiAnalysisExcludeAutoSaveFolderFromSearch ?? true)) return { enabled: false, excludedPathPrefixes: [] };
    const excludedPathPrefixes = [...new Set([settings.ai.rootFolder, settings.search.aiAnalysisAutoSaveFolder].map(normalizeVaultFolderPath).filter(Boolean))];
    return { enabled: excludedPathPrefixes.length > 0, excludedPathPrefixes };
}

export function getFullVaultFilePathsForGrep(): string[] {
    const exclusions = getExploreFolderExclusions();
    return getAllFilePaths(getFolderStructure(AppContext.getInstance().app.vault.getRoot(), true, 50, 0, exclusions.enabled ? exclusions.excludedPathPrefixes : undefined));
}

function renderExploreFolderExcludedMarkdown(requestedFolderPath: unknown, excludedPrefixes: string[]): string {
    const req = requestedFolderPath == null ? "" : String(requestedFolderPath);
    return `## explore_folder\n\nThe requested folder is excluded by settings and cannot be explored.\n\n- Requested: \`${req}\`\n- Excluded prefixes:\n${excludedPrefixes.map((p) => `- \`${p}\``).join("\n") || "- (none)"}`;
}

async function buildExploreFolderResponse(responseFormat: 'structured' | 'markdown' | 'hybrid', data: any, templateManager?: TemplateManager): Promise<any> {
    if (responseFormat === 'structured') return data;
    const markdown = await renderExploreFolderMarkdown(data, templateManager);
    return responseFormat === 'markdown' ? markdown : { data, template: markdown };
}

async function renderExploreFolderMarkdown(data: any, templateManager?: TemplateManager): Promise<string> {
    const tm = templateManager ?? AppContext.getInstance().manager.getTemplateManager?.();
    if (tm) {
        try {
            const rendered = await tm.render(ToolTemplateId.ExploreFolder, data);
            if (typeof rendered === 'string' && rendered.trim() !== '') return rendered;
        } catch { /* fall back */ }
    }
    return fallbackExploreFolderMarkdown(data);
}

function fallbackExploreFolderMarkdown(data: any): string {
    const tree = Array.isArray(data?.fileTree) ? (data.fileTree as IterFile[]) : [];
    const treeBody = tree.length ? tree.flatMap(renderTreeLines).join("\n") : "(empty)";
    const omitted = data?.rootOmitted as OmittedSummary | undefined;
    return `## Folder: \`${data?.current_path ?? "/"}\`\n\n- recursive: \`${String(Boolean(data?.recursive))}\`\n- max_depth: \`${String(data?.max_depth ?? 3)}\`\n\n\`\`\`\n${treeBody}\n\`\`\`${omitted?.total ? `\n\n- omitted_at_root: ${omitted.total} item(s) (folders: ${omitted.folderCount})` : ""}`;
}

function renderTreeLines(node: IterFile): string[] {
    const indent = "  ".repeat(Math.max(0, node.depth ?? 0));
    const suffix = node.type === "folder" ? "/" : "";
    const group = node.sameGroupCount && node.sameGroupCount > 1 ? ` (x${node.sameGroupCount}${node.patternName ? `, ${node.patternName}` : ""})` : "";
    const lines = [`${indent}${node.name}${suffix}${group}`];
    if (node.type === "folder" && node.children?.length) for (const child of node.children) lines.push(...renderTreeLines(child));
    return lines;
}

async function getTagsAndCategoriesByDocPaths(paths: string[], topN = 20) {
    const uniquePaths = [...new Set(paths)].filter(Boolean);
    if (!uniquePaths.length) return EMPTY_TAG_DESC;
    const docIds = (await sqliteStoreManager.getIndexedDocumentRepo().getIdsByPaths(uniquePaths)).map((m) => m.id);
    if (!docIds.length) return EMPTY_TAG_DESC;
    return formatTagResult(await sqliteStoreManager.getGraphRepo().getTagsByDocIds(docIds), topN);
}

async function getDocStatisticsByDocPaths(paths: string[], topK = 5): Promise<DocStats> {
    const uniquePaths = [...new Set(paths)].filter(Boolean);
    if (!uniquePaths.length) return { ...EMPTY_DOC_STATS };
    const cappedPaths = uniquePaths.slice(0, SLICE_CAPS.inspector.exploreFolderPaths);
    const docIdsMaps = await sqliteStoreManager.getIndexedDocumentRepo().getIdsByPaths(cappedPaths);
    const docIds = docIdsMaps.map((m) => m.id);
    if (!docIds.length) return { ...EMPTY_DOC_STATS };

    const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
    const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo();
    const idToPathMap = new Map(docIdsMaps.map((m) => [m.id, m.path]));

    const [topRecentEditedRaw, topWordCount, topCharCount, topRichness, languageStatsRows, { topLinksInRaw, topLinksOutRaw }] = await Promise.all([
        mobiusNodeRepo.getTopRecentEditedByDocIds(docIds, topK),
        mobiusNodeRepo.getTopWordCountByDocIds(docIds, topK),
        mobiusNodeRepo.getTopCharCountByDocIds(docIds, topK),
        mobiusNodeRepo.getTopRichnessByDocIds(docIds, topK),
        mobiusNodeRepo.getLanguageStatsByDocIds(docIds),
        mobiusEdgeRepo.countEdges(docIds).then(({ incoming, outgoing }) => ({
            topLinksInRaw: topKFromMap(incoming, topK, (id, n) => ({ node_id: id, inDegree: n })),
            topLinksOutRaw: topKFromMap(outgoing, topK, (id, n) => ({ node_id: id, outDegree: n })),
        })),
    ]);

    return buildDocStatsResult(docIds.length, topRecentEditedRaw, topWordCount, topCharCount, topRichness, topLinksInRaw, topLinksOutRaw, languageStatsRows, idToPathMap);
}
