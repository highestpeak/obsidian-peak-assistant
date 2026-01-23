
import { AppContext } from "@/app/context/AppContext";
import { ActiveFile, getActiveNoteDetail, readFileAsText } from "@/core/utils/obsidian-utils";
import { GLOBAL_TAG_CLOUD_TOP_TAGS_COUNT, VAULT_DESCRIPTION_FILENAME } from "@/core/constant";
import { sqliteStoreManager } from "@/core/storage/sqlite/SqliteStoreManager";

type SystemTimeInfo = {
    timestamp: string;
    date: string;
    time: string;
    dayOfWeek: string;
    timezone: string;
}
/**
 * Get current time information
 */
function getCurrentTime(): SystemTimeInfo {
    const now = new Date();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    return {
        timestamp: now.toISOString(),
        date: now.toLocaleDateString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            timeZone: timezone
        }),
        time: now.toLocaleTimeString('en-US', {
            hour12: false,
            timeZone: timezone
        }),
        dayOfWeek: now.toLocaleDateString('en-US', {
            weekday: 'long',
            timeZone: timezone
        }),
        timezone
    };
}

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
 * Get vault description from the prompt folder
 */
async function getVaultDescription(): Promise<string | undefined> {
    try {
        const settings = AppContext.getInstance().settings;

        // Construct path to vault description file in prompt folder
        const descriptionPath = `${settings.ai.promptFolder}/${VAULT_DESCRIPTION_FILENAME}`;

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
        const graphNodeRepo = sqliteStoreManager.getGraphNodeRepo();
        const graphEdgeRepo = sqliteStoreManager.getGraphEdgeRepo();

        // Query top 50 most used tags directly from graph_edges table
        const topTagStats = await graphEdgeRepo.getTopTaggedNodes(GLOBAL_TAG_CLOUD_TOP_TAGS_COUNT);

        if (topTagStats.length === 0) {
            return '';
        }

        // Get tag labels for the top tag IDs
        const tagIds = topTagStats.map(stat => stat.tagId);
        const tagNodesMap = await graphNodeRepo.getByIds(tagIds);

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

export type SystemInfo = {
    current_time: SystemTimeInfo;
    vault_statistics: SystemVaultStatistics;
    current_focus: ActiveFile | null;
    vault_description?: string;
    tag_cloud?: string;
}
/**
 * System information tool for Obsidian
 * Provides comprehensive information about the current Obsidian state
 */
export async function genSystemInfo(): Promise<SystemInfo> {
    const [vaultDescription, tagCloud] = await Promise.all([
        getVaultDescription(),
        getTagCloud()
    ]);

    const result: SystemInfo = {
        // some info is "common sense", should not be get by agent. inject into system prompt in advance:
        // these things can cover 80% of the "this", "that", "just now", "yesterday" such as pronouns.
        current_time: getCurrentTime(),
        vault_statistics: getVaultStatistics(),
        current_focus: getActiveNoteDetail().activeFile,
    };

    // Only add vault_description if it exists
    if (vaultDescription) {
        result.vault_description = vaultDescription;
    }

    // Only add tag_cloud if it has content
    if (tagCloud) {
        result.tag_cloud = tagCloud;
    }

    return result;
}
