import { AppContext } from "@/app/context/AppContext";
import { getAIPromptFolder } from "@/core/config/folderPaths";
import { readFileAsText } from "@/app/vault/obsidian-utils";
import { GLOBAL_TAG_CLOUD_TOP_TAGS_COUNT, VAULT_DESCRIPTION_FILENAME } from "@/core/constant";
import { sqliteStoreManager } from "@/core/storage/sqlite/SqliteStoreManager";
import { exploreFolder } from "@/service/tools/search-graph-inspector/explore-folder";

function getVaultStatistics() {
    const allFiles = AppContext.getInstance().app.vault.getFiles();
    const mdCount = allFiles.filter(f => f.extension === 'md').length;
    return { markdownFiles: mdCount, otherFiles: allFiles.length - mdCount, totalFiles: allFiles.length };
}

async function getVaultDescription(): Promise<string | undefined> {
    try {
        const content = await readFileAsText(`${getAIPromptFolder(AppContext.getInstance().settings.ai.rootFolder)}/${VAULT_DESCRIPTION_FILENAME}`, AppContext.getInstance().app);
        return content?.trim() || undefined;
    } catch { return undefined; }
}

async function getTagCloud(): Promise<string> {
    try {
        const topTagStats = await sqliteStoreManager.getMobiusEdgeRepo().getTopTaggedNodes(GLOBAL_TAG_CLOUD_TOP_TAGS_COUNT);
        if (!topTagStats.length) return '';
        const tagNodesMap = await sqliteStoreManager.getMobiusNodeRepo().getByIds(topTagStats.map(s => s.tagId));
        return topTagStats.map(s => { const n = tagNodesMap.get(s.tagId); return n ? `#${n.label}(${s.count})` : null; }).filter(Boolean).join(', ');
    } catch { return ''; }
}

export interface VaultPersona {
    description?: string;
    domain: string[];
    structure: string;
    topTags: string;
    capabilities: string;
}

export async function getVaultPersona(): Promise<VaultPersona> {
    const [description, topTags] = await Promise.all([getVaultDescription(), getTagCloud()]);
    const stats = getVaultStatistics();
    const ctx = AppContext.getInstance();
    const tm = ctx.manager.getTemplateManager?.();
    const structure = await exploreFolder(
        { folderPath: "/", recursive: true, max_depth: 2, limit: 100, response_format: "markdown" },
        {
            vault: ctx.app.vault,
            rootFolder: ctx.settings.ai.rootFolder,
            autoSaveFolder: ctx.settings.search.aiAnalysisAutoSaveFolder,
            excludeAutoSaveFolder: ctx.settings.search.aiAnalysisExcludeAutoSaveFolderFromSearch,
            templateManagerFallback: () => tm,
        },
        tm,
    );
    return {
        description, domain: [], structure, topTags: topTags || '(none)',
        capabilities: `${stats.markdownFiles} markdown, ${stats.otherFiles} other files` + (stats.totalFiles < 20 ? `; small vault, consider external search` : ``),
    };
}
