import { submitFinalAnswerInputSchema } from "@/core/schemas/tools/submitFinalAnswer";
import { AgentTool, safeAgentTool } from "./types";

export function submitFinalAnswerTool(): AgentTool {
    return safeAgentTool({
        description: "Call this tool to mark the end of the current analysis task. No input or output required.",
        inputSchema: submitFinalAnswerInputSchema,
        execute: async () => {
            return {};
        },
    });
}