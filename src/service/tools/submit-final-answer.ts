import { AgentTool, safeAgentTool } from "./types";
import { z } from "zod/v3"

export function submitFinalAnswerTool(): AgentTool {
    return safeAgentTool({
        description: "Call this tool to mark the end of the current analysis task. No input or output required.",
        inputSchema: z.object({}),
        execute: async () => {
            return {};
        },
    });
}