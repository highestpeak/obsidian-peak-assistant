import { AppContext } from "@/app/context/AppContext";
import { sqliteStoreManager } from "@/core/storage/sqlite/SqliteStoreManager";
import { TFile, TFolder } from "obsidian";
import { buildResponse } from "../types";
import type { TemplateManager } from "@/core/template/TemplateManager";
import { ToolTemplateId } from "@/core/template/TemplateRegistry";

/** Omitted summary when a folder has more items than limit. */
export type OmittedSummary = {
    total: number;
    byExt: Record<string, number>;
    folderCount: number;
};

export type IterFile = {
    type: "folder" | "file";
    path: string;
    /** Display name (basename or last path segment) for compact tree output. */
    name: string;
    /** Link target: full path at root, relative to parent folder for children (saves tokens). */
    linkPath: string;
    /** Tree depth for indent (0 = root level). */
    depth: number;
    /** Obsidian stat mtime for sorting (recent first). */
    mtime?: number;
    /** When > 1, this file is the representative of a group (same normalized name pattern). */
    sameGroupCount?: number;
    /** Display pattern e.g. "*-PeakAssistant-开发日志-*.png" when sameGroupCount > 1. */
    patternName?: string;
    children?: IterFile[];
    /** Present when this folder had more than limit children; rest summarized here. */
    omitted?: OmittedSummary;
};

/** Per-folder item cap; use ≥50 for inventory/full-list breadth (see RawSearch prompt). */
const DEFAULT_LIMIT = 50;

/**
 * Explore folder by vault structure only (no DB filter). Keeps full directory hierarchy;
 * per-folder we show first N items by recent mtime and summarize the rest by extension.
 */
export async function exploreFolder(params: any, templateManager?: TemplateManager) {
    const { folderPath, recursive, max_depth, limit, response_format } = params;
    const perFolderLimit = Math.max(1, Number(limit) ?? DEFAULT_LIMIT);

    const vault = AppContext.getInstance().app.vault;
    const normalizedPath = folderPath === "/" ? "" : (folderPath ?? "").replace(/^\/+|\/+$/g, "");
    const targetFolder = normalizedPath === ""
        ? vault.getRoot()
        : vault.getAbstractFileByPath(normalizedPath) as TFolder;
    if (!targetFolder || !(targetFolder instanceof TFolder)) {
        return `Folder not found: ${folderPath}`;
    }

    // Full tree from vault (with mtime) for collecting paths and for limiting
    const fullTree = getFolderStructure(targetFolder, recursive, max_depth ?? 3, 0);
    const allCandidateFilePaths = getAllFilePaths(fullTree);
    if (!allCandidateFilePaths.length) {
        return "No files found in the folder";
    }

    // One pass: sort+limit+omitted at every level (including root) inside limitAndSortTree
    const { items: finalFileTree, omitted: rootOmitted } = limitAndSortTree(fullTree, perFolderLimit);

    // Folder-level stats by path only (no docId list): tag/category and statistics for this folder (or full vault when root)
    const { tagDesc, categoryDesc } = await getTagsAndCategoriesByFolderPath(normalizedPath, perFolderLimit);
    const docStats = await getDocStatisticsByFolderPath(normalizedPath, perFolderLimit);

    const sameGroupCountByPath = buildSameGroupCountByPath(finalFileTree);
    const data = {
        current_path: folderPath,
        recursive,
        max_depth: max_depth || 3,
        fileTree: finalFileTree,
        sameGroupCountByPath,
        rootOmitted,
        tagDesc,
        categoryDesc,
        docStats,
    };
    return buildResponse(response_format, ToolTemplateId.ExploreFolder, data, { templateManager });
}

/**
 * Get folder structure from vault; each node has mtime from Obsidian stat for later sort.
 */
function getFolderStructure(folder: TFolder, recursive: boolean, maxDepth: number, currentDepth: number): IterFile[] {
    const result: IterFile[] = [];
    for (const child of folder.children) {
        const mtime = (child as TFile & TFolder).stat?.mtime ?? 0;
        const name = child.path.split("/").pop() ?? child.path;
        const base: Partial<IterFile> = { path: child.path, name, mtime };
        if (child instanceof TFolder) {
            const folderItem: IterFile = {
                ...base,
                type: "folder",
                linkPath: "",
                depth: 0,
            } as IterFile;
            if (recursive && currentDepth < maxDepth - 1) {
                folderItem.children = getFolderStructure(child, recursive, maxDepth, currentDepth + 1);
            }
            result.push(folderItem);
        } else if (child instanceof TFile) {
            result.push({
                ...base,
                type: "file",
                linkPath: "",
                depth: 0,
            } as IterFile);
        }
    }
    return result;
}

/** Path relative to parent for link (saves tokens); at root use full path. */
function linkPathRelativeTo(fullPath: string, parentPath: string): string {
    if (!parentPath) return fullPath;
    const prefix = parentPath + "/";
    return fullPath.startsWith(prefix) ? fullPath.slice(prefix.length) : fullPath;
}

/**
 * Group file siblings by normalized basename key; one representative per group (latest mtime) with sameGroupCount.
 * When rest is provided, count same-key files in rest so sameGroupCount includes omitted (e.g. PNG batch).
 * Folders pass through unchanged. Order preserved: first occurrence of each group in original list.
 */
const DEBUG_SIMILAR_COUNT = true; // set false to disable N similar debug logs

function compressFileSiblings(items: IterFile[], rest: IterFile[] = []): IterFile[] {
    const files = items.filter((it): it is IterFile => it.type === "file");
    if (files.length === 0) return items;
    const keyToGroup = new Map<string, IterFile[]>();
    for (const f of files) {
        const basename = f.name ?? f.path.split("/").pop() ?? "";
        const key = normalizeRecentEditedKey(basename);
        const arr = keyToGroup.get(key) ?? [];
        arr.push(f);
        keyToGroup.set(key, arr);
    }
    const restCountByKey = new Map<string, number>();
    for (const it of rest) {
        if (it.type !== "file") continue;
        const basename = it.name ?? it.path.split("/").pop() ?? "";
        if (!basename) continue;
        const key = normalizeRecentEditedKey(basename);
        restCountByKey.set(key, (restCountByKey.get(key) ?? 0) + 1);
    }
    const keyToRep = new Map<string, IterFile>();
    for (const [key, group] of keyToGroup) {
        const sorted = [...group].sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0));
        const rep = sorted[0];
        const ext = rep.path.split(".").pop() ?? "";
        const patternName = ext ? `${key}.${ext}` : key;
        const restCount = restCountByKey.get(key) ?? 0;
        const total = group.length + restCount;
        const repObj: IterFile = {
            type: rep.type,
            path: rep.path,
            name: rep.name,
            linkPath: rep.linkPath,
            depth: rep.depth,
            mtime: rep.mtime,
            sameGroupCount: total,
            ...(total > 1 ? { patternName } : {}),
        };
        keyToRep.set(key, repObj);
    }
    const seen = new Set<string>();
    const result: IterFile[] = [];
    for (const it of items) {
        if (it.type === "folder") {
            result.push(it);
            continue;
        }
        const basename = it.name ?? it.path.split("/").pop() ?? "";
        const key = normalizeRecentEditedKey(basename);
        if (seen.has(key)) continue;
        seen.add(key);
        const rep = keyToRep.get(key);
        if (rep) result.push(rep);
    }
    return result;
}

/**
 * Sort and limit at this level (including root), add omitted summary, then recurse into each folder.
 * Sets depth and linkPath on each item; compresses file siblings by normalized name (sameGroupCount).
 */
function limitAndSortTree(
    nodes: IterFile[],
    limit: number,
    parentPath: string = "",
    depth: number = 0,
): { items: IterFile[]; omitted?: OmittedSummary; rest: IterFile[] } {
    const sorted = [...nodes].sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0));
    const taken = sorted.slice(0, limit);
    const rest = sorted.slice(limit);
    const omitted = rest.length ? summarizeOmitted(rest) : undefined;
    const rawItems = taken.map((node) => {
        const linkPath = linkPathRelativeTo(node.path, parentPath);
        if (node.type === "file") {
            return {
                type: "file" as const,
                path: node.path,
                name: node.name,
                linkPath,
                depth,
                mtime: node.mtime,
            };
        }
        const { items: childItems, omitted: childOmitted } = limitAndSortTree(
            node.children ?? [],
            limit,
            node.path,
            depth + 1
        );
        return {
            type: "folder" as const,
            path: node.path,
            name: node.name,
            linkPath,
            depth,
            mtime: node.mtime,
            children: childItems,
            omitted: childOmitted,
        };
    });
    const items = compressFileSiblings(rawItems, rest);
    return { items, omitted, rest };
}

function summarizeOmitted(rest: IterFile[]): OmittedSummary {
    const byExt: Record<string, number> = {};
    let folderCount = 0;
    for (const item of rest) {
        if (item.type === "folder") {
            folderCount++;
        } else {
            const ext = item.path.split(".").pop()?.toLowerCase() ?? "unknown";
            byExt[ext] = (byExt[ext] ?? 0) + 1;
        }
    }
    return { total: rest.length, byExt, folderCount };
}


/**
 * Normalize basename for grouping: replace id-like parts (leading digits-, long digit runs) with *.
 */
function normalizeRecentEditedKey(basename: string): string {
    if (!basename || typeof basename !== "string") return basename || "";
    const withoutExt = basename.replace(/\.[^.]+$/, "");
    return withoutExt
        .replace(/^\d+\s*-\s*/, "*")
        .replace(/\d{6,}(\s*-\s*)?/g, "*")
        .trim() || withoutExt;
}

/**
 * Compress recent-edited list by normalized key; one representative per group (latest updated_at).
 */
function compressRecentEdited(
    items: Array<{ path: string; updated_at: number }>
): { items: Array<{ path: string; updated_at: number; sameGroupCount: number }>; totalItems: number; totalGroups: number } {
    if (items.length === 0) {
        return { items: [], totalItems: 0, totalGroups: 0 };
    }
    const keyToGroup = new Map<string, Array<{ path: string; updated_at: number }>>();
    for (const it of items) {
        const basename = it.path.split("/").pop() ?? it.path;
        const key = normalizeRecentEditedKey(basename);
        const arr = keyToGroup.get(key) ?? [];
        arr.push(it);
        keyToGroup.set(key, arr);
    }
    const result: Array<{ path: string; updated_at: number; sameGroupCount: number }> = [];
    for (const group of keyToGroup.values()) {
        const sorted = [...group].sort((a, b) => b.updated_at - a.updated_at);
        const representative = sorted[0];
        result.push({
            path: representative.path,
            updated_at: representative.updated_at,
            sameGroupCount: group.length,
        });
    }
    result.sort((a, b) => b.updated_at - a.updated_at);
    return {
        items: result,
        totalItems: items.length,
        totalGroups: result.length,
    };
}

/** Extract all file paths from the file tree (files only). */
function getAllFilePaths(fileTree: IterFile[]): string[] {
    const filePaths: string[] = [];
    for (const item of fileTree) {
        if (item.type === "file") filePaths.push(item.path);
        else if (item.children) filePaths.push(...getAllFilePaths(item.children));
    }
    return filePaths;
}

/** Build path -> sameGroupCount for every file in the tree so template can read from root context (path is unique). */
function buildSameGroupCountByPath(tree: IterFile[]): Record<string, number> {
    const out: Record<string, number> = {};
    function walk(nodes: IterFile[]) {
        for (const node of nodes) {
            if (node.type === "file" && node.path && typeof (node as IterFile & { sameGroupCount?: number }).sameGroupCount === "number") {
                const n = (node as IterFile & { sameGroupCount: number }).sameGroupCount;
                if (n > 1) out[node.path] = n;
            }
            if (node.children?.length) walk(node.children);
        }
    }
    walk(tree);
    return out;
}

/**
 * Tag/category for this folder by path. Root (pathPrefix '') = full vault; no docIds passed from caller.
 * Limits to top N tags and top N categories by count.
 */
async function getTagsAndCategoriesByFolderPath(
    pathPrefix: string,
    topN: number = 20,
): Promise<{ tagDesc: string, categoryDesc: string }> {
    const graphStore = sqliteStoreManager.getGraphStore();
    const docIds = pathPrefix === ""
        ? undefined
        : (await sqliteStoreManager.getDocMetaRepo().getIdsByFolderPath(pathPrefix)).map((m) => m.id);
    if (docIds !== undefined && docIds.length === 0) {
        return { tagDesc: "", categoryDesc: "" };
    }
    const { tagCounts, categoryCounts } = await graphStore.getTagsAndCategoriesByDocIds(docIds);
    const tagDesc = Array.from(tagCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, topN)
        .map(([name, count]) => `${name}(${count})`)
        .join(", ");
    const categoryDesc = Array.from(categoryCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, topN)
        .map(([name, count]) => `${name}(${count})`)
        .join(", ");
    return { tagDesc, categoryDesc };
}

/**
 * Doc statistics for this folder by path. Root (pathPrefix '') = full vault; no docIds passed from caller.
 * topRecentEdited is compressed by normalizeRecentEditedKey (totalItems, totalGroups, sameGroupCount per row).
 * topLinksIn: top N by in-degree; topLinksOut: top N by out-degree.
 */
async function getDocStatisticsByFolderPath(
    pathPrefix: string,
    topK: number = 5,
): Promise<{
    totalFiles: number;
    topRecentEdited: {
        items: Array<{ path: string; updated_at: number; sameGroupCount: number }>;
        totalItems: number;
        totalGroups: number;
        compressedCount: number;
    };
    topWordCount: Array<{ path: string; word_count: number }>;
    topCharCount: Array<{ path: string; char_count: number }>;
    topRichness: Array<{ path: string; richness_score: number }>;
    topLinksIn: Array<{ path: string; inDegree: number }>;
    topLinksOut: Array<{ path: string; outDegree: number }>;
    hasTopLinks: boolean;
    languageStats?: Record<string, number>;
}> {
    const docMetaRepo = sqliteStoreManager.getDocMetaRepo();
    const docStatsRepo = sqliteStoreManager.getDocStatisticsRepo();
    const graphEdgeRepo = sqliteStoreManager.getGraphEdgeRepo();
    const docIdsMaps = pathPrefix === "" ? null : await docMetaRepo.getIdsByFolderPath(pathPrefix);
    const docIds = docIdsMaps === null ? undefined : docIdsMaps.map((m) => m.id);
    if (docIds !== undefined && docIds.length === 0) {
        return {
            totalFiles: 0,
            topRecentEdited: { items: [], totalItems: 0, totalGroups: 0, compressedCount: 0 },
            topWordCount: [],
            topCharCount: [],
            topRichness: [],
            topLinksIn: [],
            topLinksOut: [],
            hasTopLinks: false,
            languageStats: undefined,
        };
    }

    const [
        topRecentEditedRaw,
        topWordCount,
        topCharCount,
        topRichness,
        languageStatsRows,
        totalFiles,
        { topLinksInRaw, topLinksOutRaw },
    ] = await Promise.all([
        docStatsRepo.getTopRecentEditedByDocIds(docIds, topK),
        docStatsRepo.getTopWordCountByDocIds(docIds, topK),
        docStatsRepo.getTopCharCountByDocIds(docIds, topK),
        docStatsRepo.getTopRichnessByDocIds(docIds, topK),
        docStatsRepo.getLanguageStatsByDocIds(docIds),
        docIds === undefined ? docStatsRepo.countAll() : Promise.resolve(docIds.length),
        // Edge type in graph_edges is relationship type (e.g. 'references', 'tagged'), not node type; use no filter to count all edges.
        pathPrefix === ""
            ? graphEdgeRepo.getTopNodeIdsByDegree(topK, undefined, 'references').then((r) => ({
                topLinksInRaw: r.topByInDegree.map((x) => ({ node_id: x.nodeId, inDegree: x.inDegree })),
                topLinksOutRaw: r.topByOutDegree.map((x) => ({ node_id: x.nodeId, outDegree: x.outDegree })),
            }))
            : graphEdgeRepo.countEdges(docIds!).then(({ incoming, outgoing }) => ({
                topLinksInRaw: [...incoming.entries()].sort((a, b) => b[1] - a[1]).slice(0, topK).map(([node_id, inDegree]) => ({ node_id, inDegree })),
                topLinksOutRaw: [...outgoing.entries()].sort((a, b) => b[1] - a[1]).slice(0, topK).map(([node_id, outDegree]) => ({ node_id, outDegree })),
            })),
    ]);

    const allDocIdsFromTops = [
        ...topRecentEditedRaw.map((r) => r.doc_id),
        ...topWordCount.map((r) => r.doc_id),
        ...topCharCount.map((r) => r.doc_id),
        ...topRichness.map((r) => r.doc_id),
        ...topLinksInRaw.map((r) => r.node_id),
        ...topLinksOutRaw.map((r) => r.node_id),
    ];
    const uniqueIds = [...new Set(allDocIdsFromTops)];
    const idToPathMap = docIdsMaps !== null
        ? new Map(docIdsMaps.map((m) => [m.id, m.path]))
        : new Map((uniqueIds.length ? await docMetaRepo.getByIds(uniqueIds) : []).map((m) => [m.id, m.path]));

    const languageStats: Record<string, number> = {};
    for (const row of languageStatsRows) {
        languageStats[row.language] = row.count;
    }

    const topRecentEditedList = topRecentEditedRaw.map((item) => ({
        path: idToPathMap.get(item.doc_id) ?? item.doc_id,
        updated_at: item.updated_at,
    }));
    const topRecentEdited = compressRecentEdited(topRecentEditedList);

    return {
        totalFiles,
        topRecentEdited: {
            ...topRecentEdited,
            compressedCount: topRecentEdited.totalItems - topRecentEdited.totalGroups,
        },
        topWordCount: topWordCount.map((item) => ({ path: idToPathMap.get(item.doc_id) ?? item.doc_id, word_count: item.word_count })),
        topCharCount: topCharCount.map((item) => ({ path: idToPathMap.get(item.doc_id) ?? item.doc_id, char_count: item.char_count })),
        topRichness: topRichness.map((item) => ({ path: idToPathMap.get(item.doc_id) ?? item.doc_id, richness_score: item.richness_score })),
        topLinksIn: topLinksInRaw.map((item) => ({
            path: idToPathMap.get(item.node_id) ?? item.node_id,
            inDegree: item.inDegree,
        })),
        topLinksOut: topLinksOutRaw.map((item) => ({
            path: idToPathMap.get(item.node_id) ?? item.node_id,
            outDegree: item.outDegree,
        })),
        hasTopLinks: topLinksInRaw.length > 0 || topLinksOutRaw.length > 0,
        languageStats: Object.keys(languageStats).length > 0 ? languageStats : undefined,
    };
}
