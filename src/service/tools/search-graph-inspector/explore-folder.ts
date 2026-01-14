import { sqliteStoreManager } from "@/core/storage/sqlite/SqliteStoreManager";
import { AppContext } from "@/app/context/AppContext";
import { TFile, TFolder } from "obsidian";
import { template as EXPLORE_FOLDER_TEMPLATE } from "../templates/explore-folder";
import Handlebars from "handlebars";
import { applyFiltersAndSorters, getDefaultItemFiledGetter } from "./common";
import { buildResponse } from "../types";

/**
 * we do not use database to get the structure. to get better performance.
 * path prefix match may cost time
 */
export async function exploreFolder(params: any) {
    const { folderPath, recursive, max_depth, limit, response_format, filters, sorter } = params;

    // Get the target folder
    const vault = AppContext.getInstance().app.vault;
    const normalizedPath = folderPath === "/" ? "" : folderPath.replace(/^\/+|\/+$/g, "");
    const targetFolder = normalizedPath === ""
        ? vault.getRoot()
        : vault.getAbstractFileByPath(normalizedPath) as TFolder;
    if (!targetFolder || !(targetFolder instanceof TFolder)) {
        return `Folder not found: ${folderPath}`;
    }

    // Get folder structure recursively if requested
    const candidateFileTree = getFolderStructure(targetFolder, recursive, max_depth);
    // Get all file paths from the structure
    const allCandidateFilePaths = getAllFilePaths(candidateFileTree);
    if (!allCandidateFilePaths.length) {
        return "No files found in the folder";
    }

    // filter and sort candidate doc ids
    const candidateDocIdsMaps = await sqliteStoreManager.getDocMetaRepo().getIdsByPaths(allCandidateFilePaths);;
    const itemFiledGetter = await getDefaultItemFiledGetter(candidateDocIdsMaps.map(item => item.id), filters, sorter);
    const finalDocIdsMaps = applyFiltersAndSorters<{ id: string, path: string }>(candidateDocIdsMaps, filters, sorter, limit, itemFiledGetter);

    // get final file tree
    const pathToIdMap = new Map<string, string>();
    for (const doc of finalDocIdsMaps) {
        pathToIdMap.set(doc.path, doc.id);
    }
    const finalFileTree = getFinalFileTree(candidateFileTree, pathToIdMap);

    // Get tag and category information by docIds
    const { tagDesc, categoryDesc } = await getTagsAndCategoriesByDocIds(finalDocIdsMaps.map(item => item.id));

    // Get doc statistics by docIds
    const docStats = await getDocStatisticsByDocIds(finalDocIdsMaps.map(item => item.id), limit);

    // Render template
    return buildResponse(response_format, EXPLORE_FOLDER_TEMPLATE, {
        current_path: folderPath,
        recursive,
        max_depth: max_depth || 3,
        fileTree: finalFileTree,
        tagDesc,
        categoryDesc,
        docStats
    });
}

type IterFile = {
    type: "folder" | "file",
    path: string,
    children?: IterFile[]
}
/**
 * Get folder structure recursively
 */
function getFolderStructure(folder: TFolder, recursive: boolean, maxDepth: number, currentDepth: number = 0): IterFile[] {
    const result: IterFile[] = [];

    // Add current folder's children
    for (const child of folder.children) {
        if (child instanceof TFolder) {
            const folderItem: IterFile = {
                type: "folder",
                path: child.path
            };

            // Recursively add subfolder contents if recursive is true and depth allows
            if (recursive && currentDepth < maxDepth - 1) {
                folderItem.children = getFolderStructure(child, recursive, maxDepth, currentDepth + 1);
            }

            result.push(folderItem);
        } else if (child instanceof TFile) {
            result.push({
                type: "file",
                path: child.path
            });
        }
    }

    return result;
}

/**
 * Extract all file paths from the file tree structure
 */
function getAllFilePaths(fileTree: IterFile[]): string[] {
    const filePaths: string[] = [];

    for (const item of fileTree) {
        if (item.type === "file") {
            filePaths.push(item.path);
        } else if (item.type === "folder" && item.children) {
            filePaths.push(...getAllFilePaths(item.children));
        }
    }

    return filePaths;
}

function getFinalFileTree(candidateFileTree: IterFile[], pathToIdMap: Map<string, string>): IterFile[] {
    const result: IterFile[] = [];
    
    for (const item of candidateFileTree) {
        if (!pathToIdMap.has(item.path)) { continue; }
        if (item.type === "file") {
            result.push({
                type: "file",
                path: item.path
            });
        } else if (item.type === "folder" && item.children) {
            result.push({
                type: "folder",
                path: item.path,
                children: getFinalFileTree(item.children, pathToIdMap)
            });
        }
    }
    return result;
}

/**
 * Get tags and categories description by document IDs
 */
async function getTagsAndCategoriesByDocIds(docIds: string[]):
    Promise<{ tagDesc: string, categoryDesc: string }> {
    if (!docIds.length) {
        return { tagDesc: "", categoryDesc: "" };
    }

    const graphStore = sqliteStoreManager.getGraphStore();
    const tagsAndCategoriesMap = await graphStore.getTagsAndCategoriesByDocIds(docIds);
    const tagDesc = Array.from(tagsAndCategoriesMap.values()).map(item => item.tags.join(", ")).join(", ");
    const categoryDesc = Array.from(tagsAndCategoriesMap.values()).map(item => item.categories.join(", ")).join(", ");

    return { tagDesc, categoryDesc };
}

/**
 * Get document statistics by document IDs
 */
async function getDocStatisticsByDocIds(docIds: string[], topK: number = 5): Promise<{
    totalFiles: number;
    topRecentEdited: Array<{ path: string, updated_at: number }>;
    topWordCount: Array<{ path: string, word_count: number }>;
    topCharCount: Array<{ path: string, char_count: number }>;
    topRichness: Array<{ path: string, richness_score: number }>;
    languageStats: Record<string, number>;
}> {
    if (!docIds.length) {
        return {
            totalFiles: 0,
            topRecentEdited: [],
            topWordCount: [],
            topCharCount: [],
            topRichness: [],
            languageStats: {}
        };
    }

    const docStatsRepo = sqliteStoreManager.getDocStatisticsRepo();

    // Query all statistics in parallel
    const [
        topRecentEdited,
        topWordCount,
        topCharCount,
        topRichness,
        languageStatsRows
    ] = await Promise.all([
        docStatsRepo.getTopRecentEditedByDocIds(docIds, topK),
        docStatsRepo.getTopWordCountByDocIds(docIds, topK),
        docStatsRepo.getTopCharCountByDocIds(docIds, topK),
        docStatsRepo.getTopRichnessByDocIds(docIds, topK),
        docStatsRepo.getLanguageStatsByDocIds(docIds)
    ]);

    // Convert language stats array to record
    const languageStats: Record<string, number> = {};
    for (const row of languageStatsRows) {
        languageStats[row.language] = row.count;
    }

    return {
        totalFiles: docIds.length,
        topRecentEdited: topRecentEdited.map(item => ({ path: item.doc_id, updated_at: item.updated_at })),
        topWordCount: topWordCount.map(item => ({ path: item.doc_id, word_count: item.word_count })),
        topCharCount: topCharCount.map(item => ({ path: item.doc_id, char_count: item.char_count })),
        topRichness: topRichness.map(item => ({ path: item.doc_id, richness_score: item.richness_score })),
        languageStats
    };
}
