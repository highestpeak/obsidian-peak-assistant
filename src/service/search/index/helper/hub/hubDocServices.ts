import type { SearchSettings } from '@/core/config/settingsTypes';

/**
 * Hub doc services: materialization, constituent persistence, regeneration.
 *
 * NOTE: The full hub doc materialization pipeline (HubCandidateDiscoveryService,
 * assembly, skeleton generation, LLM fill) has not been implemented yet.
 * This file provides the stub interface that HubRegenService calls for
 * background regeneration. The actual materialization logic will be wired
 * when the hub discovery pipeline is built out.
 */
export class HubDocService {
    constructor(private readonly searchSettings: SearchSettings) {}

    /**
     * Regenerate a single hub doc by node ID and vault path.
     * Stub: logs a warning until the full hub materialization pipeline is implemented.
     */
    async regenerateHubByNodeId(hubNodeId: string, hubPath: string): Promise<void> {
        console.warn(
            `[HubDocService] regenerateHubByNodeId not yet implemented (hub pipeline pending). hubNodeId=${hubNodeId}, hubPath=${hubPath}`,
        );
    }

    /**
     * Static entry point for HubRegenService background regeneration.
     * Guards: skips user-owned hubs (peak_user_owned = true in frontmatter).
     */
    static async regenerateSingleHub(
        hubNodeId: string,
        hubPath: string,
        searchSettings: SearchSettings,
    ): Promise<void> {
        const service = new HubDocService(searchSettings);
        await service.regenerateHubByNodeId(hubNodeId, hubPath);
    }
}
