import { getRecentAnalysisResultInputSchema } from '@/core/schemas/tools/contextDiscovery';
import { AgentTool, safeAgentTool } from '@/service/tools/types';
import { AppContext } from '@/app/context/AppContext';

/**
 * Tool to retrieve recent AI analysis results, optionally filtered by a search query.
 */
export function getRecentAnalysisResultTool(): AgentTool {
    return safeAgentTool({
        description:
            'Retrieve recent AI analysis results from the analysis history. ' +
            'Optionally filter by a search query matched against the analysis query/title. ' +
            'Returns analysis summaries including title, query, preset, and creation time.',
        inputSchema: getRecentAnalysisResultInputSchema,
        execute: async (input) => {
            const { query, limit } = input;

            const service = AppContext.getAIAnalysisHistoryService();
            const fetchLimit = Math.max(limit * 5, 20); // fetch extra for filtering
            const records = await service.list({ limit: fetchLimit, offset: 0 });

            if (records.length === 0) {
                return { analyses: [], total: 0, message: 'No analysis history found.' };
            }

            let filtered = records;
            if (query?.trim()) {
                const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);
                filtered = records.filter((r) => {
                    const searchText = `${r.query ?? ''} ${r.title ?? ''}`.toLowerCase();
                    return keywords.some((kw) => searchText.includes(kw));
                });
            }

            const results = filtered.slice(0, limit).map((r) => ({
                id: r.id,
                title: r.title ?? null,
                query: r.query ?? null,
                analysisPreset: r.analysis_preset ?? null,
                vaultRelPath: r.vault_rel_path ?? null,
                createdAt: r.created_at_ts,
                createdAtIso: new Date(r.created_at_ts).toISOString(),
            }));

            return {
                analyses: results,
                total: filtered.length,
                returned: results.length,
            };
        },
    });
}
