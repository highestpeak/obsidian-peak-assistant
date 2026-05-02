import { getWorkingThemeInputSchema } from '@/core/schemas/tools/contextDiscovery';
import { AgentTool, safeAgentTool } from '@/service/tools/types';
import { SessionContextService } from '@/service/context/SessionContextService';

/**
 * Tool to retrieve the current working theme, active file, and top recent activities.
 */
export function getWorkingThemeTool(): AgentTool {
    return safeAgentTool({
        description:
            'Get the current working theme derived from recent session activity. ' +
            'Returns the active file, rule-based theme summary (top folders, tags, search keywords), ' +
            'LLM-inferred theme if available, and the top 5 most recent activities.',
        inputSchema: getWorkingThemeInputSchema,
        execute: async () => {
            const ctx = SessionContextService.getInstance().getWorkingContext();

            const topActivities = ctx.recentActivities.slice(0, 5).map((act, i) => ({
                indexId: `A${i + 1}`,
                type: act.type,
                summary: act.summary,
                relatedPaths: act.relatedPaths,
                importanceLevel: act.importanceLevel,
                timestampIso: new Date(act.timestamp).toISOString(),
            }));

            return {
                activeFile: ctx.activeFile
                    ? {
                        path: ctx.activeFile.path,
                        title: ctx.activeFile.title,
                        openedAtIso: new Date(ctx.activeFile.openedAt).toISOString(),
                    }
                    : null,
                workingTheme: {
                    ruleBased: ctx.workingTheme.ruleBased,
                    llmInferred: ctx.workingTheme.llmInferred,
                },
                topActivities,
                totalActivities: ctx.recentActivities.length,
                updatedAtIso: new Date(ctx.updatedAt).toISOString(),
            };
        },
    });
}
