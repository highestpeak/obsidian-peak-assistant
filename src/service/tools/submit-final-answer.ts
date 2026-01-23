import { AgentTool, safeAgentTool } from "./types";
import { z } from "zod/v3"

export function submitFinalAnswerTool(): AgentTool {
    return safeAgentTool({
        description: "When you have found all the clues and the required information is built, call this tool to submit the final answer. This will end the current analysis task.",
        inputSchema: z.object({
            summary: z.string().describe("the final analysis report text."),
        }),
        execute: async ({ summary }) => {
            return {
                summary,
            };
        },
    });
}