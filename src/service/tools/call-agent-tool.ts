import { makeCallAgentToolInputSchema, updateDimensionToolInputSchema } from "@/core/schemas/tools/callAgentTool";
import { AgentTool, safeAgentTool } from "./types";

/**
 * make an agent to a tool.
 */
export function callAgentTool(agentName: string): AgentTool {
    return safeAgentTool({
        description: `Execute a task using the ${agentName} agent. Provide a specific prompt that focuses on gathering relevant information.`,
        inputSchema: makeCallAgentToolInputSchema(agentName),
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
        inputSchema: updateDimensionToolInputSchema,
        execute: async () => ({ delegated: true }),
    });
}