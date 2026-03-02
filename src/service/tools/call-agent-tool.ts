import { makeCallAgentToolInputSchema } from "@/core/schemas/tools/callAgentTool";
import { AgentTool, safeAgentTool } from "./types";

export interface CallAgentToolOptions {
	/** Patterns to reject in prompt; passed to schema. Caller defines (e.g. vault-search forbid dialogue patterns). */
	forbidDialoguePatterns?: RegExp[];
	/** Message when prompt matches forbidDialoguePatterns. Caller defines. */
	forbidDialogueMessage?: string;
}

/**
 * Make an agent available as a tool. Caller passes options (e.g. forbidDialoguePatterns + message) from outside so the schema stays generic.
 */
export function callAgentTool(agentName: string, options?: CallAgentToolOptions): AgentTool {
    return safeAgentTool({
        description: `Execute a task using the ${agentName} agent. Provide a specific prompt that focuses on gathering relevant information.`,
        inputSchema: makeCallAgentToolInputSchema(agentName, options),
        execute: async (params) => {
            const prompt = params.prompt;
            return { prompt };
        },
    });
}
