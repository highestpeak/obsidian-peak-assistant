import { AIServiceManager } from '@/service/chat/service-manager';
import type { AgentTool } from '@/service/tools/types';
import {
    inspectNoteContextTool,
    graphTraversalTool,
    findPathTool,
    findKeyNodesTool,
    findOrphansTool,
    searchByDimensionsTool,
    exploreFolderTool,
    recentChangesWholeVaultTool,
    localSearchWholeVaultTool,
} from '@/service/tools/search-graph-inspector';
import { contentReaderTool } from '@/service/tools/content-reader';
import { submitFinalAnswerTool } from '@/service/tools/submit-final-answer';
import { searchMemoryStoreTool } from '@/service/tools/search-memory-store';
import { PromptId, type PromptVariables } from '@/service/prompt/PromptId';
import { mergeTokenUsage, type LLMStreamEvent, type LLMUsage } from '@/core/providers/types';
import { AppContext } from '@/app/context/AppContext';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { queryWithProfile } from './core/sdkAgentPool';
import { translateSdkMessages } from './core/sdkMessageAdapter';
import { agentToolsToMcpServer, mcpToolNames } from './core/agentToolMcpAdapter';

export type HistorySearchFn = (query: string, options?: { maxChars?: number }) => string;

export interface FollowupChatAgentOptions {
    enableLocalSearch?: boolean;
}

const MCP_SERVER_NAME = 'followup';

/**
 * Agent for all follow-up chats (Topic, Continue Analysis, Graph/Blocks/Sources).
 * Provides search_chat_history and search_current_result plus vault search tools.
 * Uses Agent SDK query() via MCP server for tool dispatch.
 */
export class FollowupChatAgent {
    private readonly tools: Record<string, AgentTool>;

    constructor(
        private readonly aiServiceManager: AIServiceManager,
        private readonly options: FollowupChatAgentOptions,
        private readonly historySearchFn: HistorySearchFn,
        private readonly resultSearchFn: HistorySearchFn
    ) {
        const tools: Record<string, AgentTool> = {
            search_chat_history: searchMemoryStoreTool(historySearchFn, {
                description: 'Search the analysis session chat history (reasoning, tool calls, evidence). Use when you need to cite how the analysis was done or what was discovered during the run.',
            }),
            search_current_result: searchMemoryStoreTool(resultSearchFn, {
                description: 'Search the current analysis result (summary, topics, sources, blocks, graph, steps, follow-ups). Use when you need to cite the final outputs of the analysis.',
            }),
            content_reader: contentReaderTool(),
            submit_final_answer: submitFinalAnswerTool(),
        };
        if (this.options.enableLocalSearch) {
            const tm = this.aiServiceManager.getTemplateManager?.();
            tools.inspect_note_context = inspectNoteContextTool(tm);
            tools.graph_traversal = graphTraversalTool(tm);
            tools.find_path = findPathTool(tm);
            tools.find_key_nodes = findKeyNodesTool(tm);
            tools.find_orphans = findOrphansTool(tm);
            tools.search_by_dimensions = searchByDimensionsTool(tm);
            tools.explore_folder = exploreFolderTool(tm);
            tools.recent_changes_whole_vault = recentChangesWholeVaultTool(tm);
            tools.local_search_whole_vault = localSearchWholeVaultTool(tm);
        }
        this.tools = tools;
    }

    /**
     * Stream follow-up response with fixed system prompt and parameterized user prompt.
     */
    async *streamFollowup(
        promptId: PromptId,
        variables: Record<string, unknown>
    ): AsyncGenerator<LLMStreamEvent> {
        const system = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisFollowupSystem, {});
        const prompt = await this.aiServiceManager.renderPrompt(promptId, variables as PromptVariables[PromptId]);

        const ctx = AppContext.getInstance();
        const profile = ProfileRegistry.getInstance().getActiveAgentProfile()!;
        const mcpServer = agentToolsToMcpServer(MCP_SERVER_NAME, this.tools);
        const allowedTools = mcpToolNames(MCP_SERVER_NAME, this.tools);

        const messages = queryWithProfile(ctx.app, ctx.pluginId, profile, {
            prompt,
            systemPrompt: system,
            maxTurns: 5,
            mcpServers: { [MCP_SERVER_NAME]: mcpServer },
            allowedTools,
        });

        let acc = '';
        let accumulatedUsage: LLMUsage | null = null;
        let resultEmitted = false;

        for await (const ev of translateSdkMessages(messages, { hasPartialMessages: true })) {
            // Translate SDK events into the PromptService-compatible shape
            // that existing callers expect (prompt-stream-delta / prompt-stream-result).
            if (ev.type === 'text-delta' && typeof (ev as any).text === 'string') {
                acc += (ev as any).text;
                yield { type: 'prompt-stream-delta', id: 'followup', promptId, delta: (ev as any).text } as any;
            } else if (ev.type === 'complete') {
                const usage = (ev as any).usage ?? null;
                if (usage) accumulatedUsage = mergeTokenUsage(accumulatedUsage, usage);
            } else if (ev.type === 'error') {
                yield ev;
            }
        }

        // Emit final result after stream completes
        if (acc) {
            yield { type: 'prompt-stream-result', id: 'followup', promptId, output: acc.trim(), usage: accumulatedUsage ?? undefined } as any;
            resultEmitted = true;
        }

        if (!resultEmitted) {
            yield { type: 'prompt-stream-result', id: 'followup', promptId, output: '', usage: accumulatedUsage ?? undefined } as any;
        }
    }
}
