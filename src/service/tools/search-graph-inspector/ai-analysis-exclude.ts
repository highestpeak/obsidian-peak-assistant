import { AppContext } from "@/app/context/AppContext";
import { sqliteStoreManager } from "@/core/storage/sqlite/SqliteStoreManager";

export interface AiAnalysisExcludeContext {
	folderPath: string;
	excludedDocIds: Set<string>;
}

/**
 * Returns exclude context when "exclude AI analysis folder from search" is enabled.
 * Used by AI analysis search/graph tools to skip docs under the auto-save folder.
 */
export async function getAiAnalysisExcludeContext(): Promise<AiAnalysisExcludeContext | null> {
	const settings = AppContext.getInstance().settings?.search;
	if (settings?.aiAnalysisExcludeAutoSaveFolderFromSearch === false) return null;
	const folder = settings?.aiAnalysisAutoSaveFolder?.trim();
	if (folder) {
		const folderPath = folder.replace(/^\/+/, "");
		const rows = await sqliteStoreManager.getDocMetaRepo().getByFolderPath(folderPath);
		const excludedDocIds = new Set(rows.map((r) => r.id));
		return { folderPath, excludedDocIds };
	}
	return null;
}

/** Normalize path for prefix check: no leading slash. */
function normalizePath(p: string): string {
	return p.replace(/^\/+/, "").trim();
}

/** True if path is the folder or under it. */
export function pathUnderExcludedFolder(path: string, folderPath: string): boolean {
	const p = normalizePath(path);
	const folder = normalizePath(folderPath);
	if (!folder) return false;
	return p === folder || p.startsWith(folder + "/");
}
