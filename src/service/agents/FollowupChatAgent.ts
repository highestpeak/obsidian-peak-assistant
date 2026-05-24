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
import { TierController } from '@/service/agents/harness/tier/TierController';
import { defaultTierBindings } from '@/service/agents/harness/tier/bindings';
import { runAgentLoop } from '@/service/agents/harness';
import { adaptAgentTools } from '@/service/agents/harness-bridge/agentToolAdapter';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';

export type HistorySearchFn = (query: string, options?: { maxChars?: number }) => string;

export interface FollowupChatAgentOptions {
    enableLocalSearch?: boolean;
}

const TIER = 'local-fast';

/**
 * Agent for all follow-up chats (Topic, Continue Analysis, Graph/Blocks/Sources).
 * Provides search_chat_history and search_current_result plus vault search tools.
 * Runs via the self-hosted harness (tier=local-fast).
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

        const loopId = `followup-${generateUuidWithoutHyphens()}`;
        const tierController = new TierController({
            bindings: defaultTierBindings(),
            policy: { preferred: TIER },
            loopId,
        });

        const result = await runAgentLoop({
            loopId,
            systemPrompt: system,
            initialMessages: [{ role: 'user', content: prompt }],
            tools: adaptAgentTools(this.tools),
            tierController,
            budget: { maxSteps: 5, maxTokens: 20_000, maxToolCalls: 10 },
        });

        const finalText = result.finalText;
        let accumulatedUsage: LLMUsage | null = null;
        if (result.totalTokens > 0) {
            accumulatedUsage = { inputTokens: 0, outputTokens: 0, totalTokens: result.totalTokens };
        }

        // Emit delta events from final text
        if (finalText) {
            yield { type: 'prompt-stream-delta', id: 'followup', promptId, delta: finalText } as any;
        }

        yield {
            type: 'prompt-stream-result',
            id: 'followup',
            promptId,
            output: finalText.trim(),
            usage: accumulatedUsage ?? undefined,
        } as any;
    }
}
