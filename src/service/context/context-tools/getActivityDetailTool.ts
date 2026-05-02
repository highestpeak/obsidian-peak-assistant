import { getActivityDetailInputSchema } from '@/core/schemas/tools/contextDiscovery';
import { AgentTool, safeAgentTool } from '@/service/tools/types';
import { SessionContextService } from '@/service/context/SessionContextService';

/**
 * Tool to retrieve full details for a specific recent activity by its index ID (e.g. "A1").
 * The index is 1-based (A1 = first/most recent activity).
 */
export function getActivityDetailTool(): AgentTool {
    return safeAgentTool({
        description:
            'Get full details for a specific recent activity using its index ID (e.g. "A1" for the first activity). ' +
            'Returns timestamp, type, summary, related file paths, importance level, and metadata.',
        inputSchema: getActivityDetailInputSchema,
        execute: async (input) => {
            const { activityId } = input;

            // Parse index from "A1", "A2", etc.
            const match = /^A(\d+)$/i.exec(activityId.trim());
            if (!match) {
                return { error: `Invalid activityId format "${activityId}". Expected format: "A1", "A2", etc.` };
            }

            const index = parseInt(match[1], 10) - 1; // convert to 0-based
            if (index < 0) {
                return { error: `Activity index must be >= 1 (got "${activityId}").` };
            }

            const ctx = SessionContextService.getInstance().getWorkingContext();
            const activities = ctx.recentActivities;

            if (index >= activities.length) {
                return {
                    error: `Activity "${activityId}" not found. There are only ${activities.length} recent activities.`,
                    totalActivities: activities.length,
                };
            }

            const activity = activities[index];
            return {
                id: activity.id,
                indexId: activityId.toUpperCase(),
                type: activity.type,
                timestamp: activity.timestamp,
                timestampIso: new Date(activity.timestamp).toISOString(),
                summary: activity.summary,
                relatedPaths: activity.relatedPaths,
                importanceLevel: activity.importanceLevel,
                metadata: activity.metadata ?? null,
            };
        },
    });
}
