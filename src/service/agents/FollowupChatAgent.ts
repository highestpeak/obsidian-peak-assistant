import { AIServiceManager } from '@/service/chat/service-manager';
import { Experimental_Agent as Agent } from 'ai';
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

export type HistorySearchFn = (query: string, options?: { maxChars?: number }) => string;

type FollowupToolSet = {
    search_chat_history: AgentTool;
    search_current_result: AgentTool;
    content_reader: AgentTool;
    inspect_note_context?: AgentTool;
    graph_traversal?: AgentTool;
    find_path?: AgentTool;
    find_key_nodes?: AgentTool;
    find_orphans?: AgentTool;
    search_by_dimensions?: AgentTool;
    explore_folder?: AgentTool;
    recent_changes_whole_vault?: AgentTool;
    local_search_whole_vault?: AgentTool;
    submit_final_answer: AgentTool;
};

export interface FollowupChatAgentOptions {
    enableLocalSearch?: boolean;
}

/**
 * Agent for all follow-up chats (Topic, Continue Analysis, Graph/Blocks/Sources).
 * Provides search_chat_history and search_current_result plus vault search tools.
 */
export class FollowupChatAgent {
    private readonly agent: Agent<FollowupToolSet>;

    constructor(
        private readonly aiServiceManager: AIServiceManager,
        private readonly options: FollowupChatAgentOptions,
        private readonly historySearchFn: HistorySearchFn,
        private readonly resultSearchFn: HistorySearchFn
    ) {
        const tools: FollowupToolSet = {
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
        const { provider, modelId } = this.aiServiceManager.getModelForPrompt(PromptId.AiAnalysisFollowup);
        this.agent = new Agent<FollowupToolSet>({
            model: this.aiServiceManager.getMultiChat()
                .getProviderService(provider)
                .modelClient(modelId),
            tools,
        });
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
        const result = this.agent.stream({ system, prompt });
        let acc = '';
        let accumulatedUsage: LLMUsage | null = null;
        const toUsage = (u: unknown): LLMUsage | null => {
            if (!u || typeof u !== 'object') return null;
            const o = u as Record<string, unknown>;
            const inT = typeof o.inputTokens === 'number' ? o.inputTokens : 0;
            const outT = typeof o.outputTokens === 'number' ? o.outputTokens : 0;
            const totalT = typeof o.totalTokens === 'number' ? o.totalTokens : inT + outT || 0;
            return { inputTokens: inT, outputTokens: outT, totalTokens: totalT };
        };
        for await (const chunk of result.fullStream) {
            switch (chunk.type) {
                case 'text-delta':
                    if (typeof (chunk as any).text === 'string') {
                        acc += (chunk as any).text;
                        yield { type: 'prompt-stream-delta', id: 'followup', promptId, delta: (chunk as any).text } as any;
                    }
                    break;
                case 'finish-step': {
                    const stepUsage = toUsage((chunk as { usage?: unknown }).usage);
                    if (stepUsage) accumulatedUsage = mergeTokenUsage(accumulatedUsage, stepUsage);
                    break;
                }
                case 'finish': {
                    const total = toUsage((chunk as { totalUsage?: unknown }).totalUsage) ?? accumulatedUsage;
                    yield { type: 'prompt-stream-result', id: 'followup', promptId, output: acc.trim(), usage: total ?? undefined } as any;
                    break;
                }
                case 'error':
                    yield { type: 'error', error: (chunk as any).error } as any;
                    break;
                default:
                    break;
            }
        }
    }
}
