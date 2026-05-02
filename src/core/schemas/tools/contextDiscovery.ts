import { z } from "zod/v3";

export const getActivityDetailInputSchema = z.object({
    activityId: z.string().describe('Activity ID from the recent activity index, e.g. "A1"'),
});

export const getRecentAnalysisResultInputSchema = z.object({
    query: z.string().optional().describe('Search query to match against recent analyses'),
    limit: z.number().default(1).describe('Number of results to return'),
});

export const getWorkingThemeInputSchema = z.object({});
