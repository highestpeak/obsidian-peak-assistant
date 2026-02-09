import { AgentTool, safeAgentTool } from "./types";
import { z } from "zod/v3";

/**
 * make an agent to a tool.
 */
export function callAgentTool(agentName: string): AgentTool {
    return safeAgentTool({
        description: `Execute a task using the ${agentName} agent. Provide a specific prompt that focuses on gathering relevant information.`,
        inputSchema: z.object({
            prompt: z.string().optional().describe(`The prompt for the ${agentName} agent`),
            query: z.string().optional().describe("Alternative to prompt; same meaning"),
        }).refine((d) => !!(d.prompt ?? d.query), { message: "Either prompt or query is required" }),
        execute: async (params) => {
            const prompt = (params?.prompt ?? params?.query) ?? "";
            return { prompt };
        },
    });
}

/**
 * Tool for dimension update agents (sources, topics, graph, dashboard blocks).
 * Thought agent passes text describing what to add/remove; the sub-agent turns it into operations.
 */
export function updateDimensionTool(dimensionName: string, description: string): AgentTool {
    return safeAgentTool({
        description,
        inputSchema: z.object({
            text: z.string().optional().describe('Describe what to add or remove'),
            prompt: z.string().optional().describe('Same as text'),
        }).refine((d) => !!(d?.text ?? d?.prompt), { message: 'text or prompt is required' }),
        execute: async () => ({ delegated: true }),
    });
}