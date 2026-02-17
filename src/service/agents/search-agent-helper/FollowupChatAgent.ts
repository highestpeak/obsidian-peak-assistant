import { AIServiceManager } from '@/service/chat/service-manager';
import { Experimental_Agent as Agent, hasToolCall, stepCountIs } from 'ai';
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
import { PromptId } from '@/service/prompt/PromptId';
import type { LLMStreamEvent } from '@/core/providers/types';

const DEFAULT_MAX_FOLLOWUP_STEPS = 20;

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
    searchAgentProvider: string;
    searchAgentModel: string;
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
            tools.inspect_note_context = inspectNoteContextTool();
            tools.graph_traversal = graphTraversalTool();
            tools.find_path = findPathTool();
            tools.find_key_nodes = findKeyNodesTool();
            tools.find_orphans = findOrphansTool();
            tools.search_by_dimensions = searchByDimensionsTool();
            tools.explore_folder = exploreFolderTool();
            tools.recent_changes_whole_vault = recentChangesWholeVaultTool();
            tools.local_search_whole_vault = localSearchWholeVaultTool();
        }
        this.agent = new Agent<FollowupToolSet>({
            model: this.aiServiceManager.getMultiChat()
                .getProviderService(this.options.searchAgentProvider)
                .modelClient(this.options.searchAgentModel),
            tools,
            stopWhen: [
                stepCountIs(DEFAULT_MAX_FOLLOWUP_STEPS),
                hasToolCall('submit_final_answer'),
            ],
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
        const prompt = await this.aiServiceManager.renderPrompt(promptId, variables);
        const result = this.agent.stream({ system, prompt });
        let acc = '';
        for await (const chunk of result.fullStream) {
            switch (chunk.type) {
                case 'text-delta':
                    if (typeof (chunk as any).text === 'string') {
                        acc += (chunk as any).text;
                        yield { type: 'prompt-stream-delta', id: 'followup', promptId, delta: (chunk as any).text } as any;
                    }
                    break;
                case 'finish':
                    yield { type: 'prompt-stream-result', id: 'followup', promptId, output: acc.trim() } as any;
                    break;
                case 'error':
                    yield { type: 'error', error: (chunk as any).error } as any;
                    break;
                default:
                    break;
            }
        }
    }
}
