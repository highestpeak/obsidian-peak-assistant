import { AppContext } from "@/app/context/AppContext";
import { getAIPromptFolder } from "@/app/settings/types";
import { readFileAsText } from "@/core/utils/obsidian-utils";
import { GLOBAL_TAG_CLOUD_TOP_TAGS_COUNT, VAULT_DESCRIPTION_FILENAME } from "@/core/constant";
import { sqliteStoreManager } from "@/core/storage/sqlite/SqliteStoreManager";
import { exploreFolder } from "@/service/tools/search-graph-inspector/explore-folder";

type SystemVaultStatistics = {
    vaultName: string;
    totalFiles: number;
    markdownFiles: number;
    otherFiles: number;
}
/**
 * Get vault statistics
 */
function getVaultStatistics(): SystemVaultStatistics {
    const app = AppContext.getInstance().app;
    const vaultName = app.vault.getName();

    const allFiles = app.vault.getFiles();
    const markdownFiles = allFiles.filter(f => f.extension === 'md');
    const otherFiles = allFiles.filter(f => f.extension !== 'md');

    return {
        vaultName,
        totalFiles: allFiles.length,
        markdownFiles: markdownFiles.length,
        otherFiles: otherFiles.length,
    };
}

/**
 * Vault capability schema: user-written description of what the knowledge base contains (e.g. "Personal life records, product methodology, tech articles"). Used to give the classifier confidence that a dimension is likely answerable.
 */
async function getVaultDescription(): Promise<string | undefined> {
    try {
        const descriptionPath = `${getAIPromptFolder()}/${VAULT_DESCRIPTION_FILENAME}`;

        // Read file content using utility function
        const content = await readFileAsText(descriptionPath);
        return content?.trim() || undefined;
    } catch (error) {
        console.warn('[system-info] Error reading vault description:', error);
        return undefined;
    }
}

/**
 * Get tag cloud - top 50 most used tags with their usage count
 */
async function getTagCloud(): Promise<string> {
    try {
        const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
        const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo();

        // Query top 50 most used tags directly from graph_edges table
        const topTagStats = await mobiusEdgeRepo.getTopTaggedNodes(GLOBAL_TAG_CLOUD_TOP_TAGS_COUNT);

        if (topTagStats.length === 0) {
            return '';
        }

        // Get tag labels for the top tag IDs
        const tagIds = topTagStats.map(stat => stat.tagId);
        const tagNodesMap = await mobiusNodeRepo.getByIds(tagIds);

        // Format as "#tag (count), #tag (count), ..."
        return topTagStats
            .map(stat => {
                const tagNode = tagNodesMap.get(stat.tagId);
                if (!tagNode) return null;
                return `#${tagNode.label}(${stat.count})`;
            })
            .filter(item => item !== null)
            .join(', ');
    } catch (error) {
        console.warn('[system-info] Error getting tag cloud:', error);
        return '';
    }
}

/** Vault "map" for MindFlow pre-thought: structure, tags, description, capabilities. Fed once per loop start. */
export interface VaultPersona {
    /** User-written vault description (e.g. "My AI research notes"). */
    description?: string;
    /** Auto-identified domains (reserved; empty for now). */
    domain: string[];
    /** Directory outline (2–3 levels) for "which drawer holds what". */
    structure: string;
    /** Top tags with counts (e.g. "#tag(12), #other(5)"). */
    topTags: string;
    /** One-line capability hint (e.g. "Many tech docs; no real-time news"). */
    capabilities: string;
}

/**
 * Build VaultPersona for MindFlow pre-thought. Use only when phase === 'pre-thought'.
 */
export async function getVaultPersona(): Promise<VaultPersona> {
    const [vaultDescription, tagCloud] = await Promise.all([
        getVaultDescription(),
        getTagCloud(),
    ]);
    const stats = getVaultStatistics();
    const tm = AppContext.getInstance().manager.getTemplateManager?.();
    const exploreResult = await exploreFolder(
        { folderPath: "/", recursive: true, max_depth: 2, limit: 100, response_format: "markdown" },
        tm
    );
    return {
        description: vaultDescription,
        domain: [],
        structure: exploreResult,
        topTags: tagCloud || '(none)',
        capabilities: `${stats.markdownFiles} markdown, ${stats.otherFiles} other files`
            + (stats.totalFiles < 20 ? `small vault; consider external search if needed` : ``),
    };
}
