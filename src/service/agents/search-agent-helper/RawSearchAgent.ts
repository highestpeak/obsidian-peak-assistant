
import { AIServiceManager } from "@/service/chat/service-manager";
import { Experimental_Agent as Agent, hasToolCall, stepCountIs } from 'ai';
import { AgentTool } from "@/service/tools/types";
import {
    inspectNoteContextTool,
    graphTraversalTool,
    findPathTool,
    findKeyNodesTool,
    findOrphansTool,
    searchByDimensionsTool,
    exploreFolderTool,
    recentChangesWholeVaultTool,
    localSearchWholeVaultTool
} from '@/service/tools/search-graph-inspector';
import { genSystemInfo } from '@/service/tools/system-info';
import { contentReaderTool } from '@/service/tools/content-reader';
import { submitFinalAnswerTool } from '@/service/tools/submit-final-answer';
import { LLMStreamEvent, LLMUsage, StreamTriggerName, ToolResultOutput } from "@/core/providers/types";
import { PromptId } from "@/service/prompt/PromptId";

/**
 * Tool set for search agent (executor)
 */
type SearchToolSet = {
    content_reader: AgentTool;
    web_search?: AgentTool;
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

export interface RawSearchAgentOptions {
    enableWebSearch?: boolean;
    enableLocalSearch?: boolean;
    searchAgentProvider: string;
    searchAgentModel: string;
}

// search inspector agent max steps.
const DEFAULT_MAX_SEARCH_AGENT_STEPS = 50;

export class RawSearchAgent {
    /**
     * Search Agent - sub agent for search tasks
     */
    private searchAgent: Agent<SearchToolSet>;

    constructor(
        private readonly aiServiceManager: AIServiceManager,
        private readonly options: RawSearchAgentOptions,
        private readonly registerVerifiedPathsFromToolOutput?: (toolName: string, output: any) => void
    ) {
        // Create search agent (focused on search tasks, no submit_final_answer)
        let searchTools: SearchToolSet = {
            content_reader: contentReaderTool(),
            submit_final_answer: submitFinalAnswerTool(),
        };
        // todo
        // if (this.options.enableWebSearch) {
        //     searchTools.web_search = localWebSearchTool();
        // }
        if (this.options.enableLocalSearch) {
            searchTools.inspect_note_context = inspectNoteContextTool();
            searchTools.graph_traversal = graphTraversalTool();
            searchTools.find_path = findPathTool();
            searchTools.find_key_nodes = findKeyNodesTool();
            searchTools.find_orphans = findOrphansTool();
            searchTools.search_by_dimensions = searchByDimensionsTool();
            searchTools.explore_folder = exploreFolderTool();
            searchTools.recent_changes_whole_vault = recentChangesWholeVaultTool();
            searchTools.local_search_whole_vault = localSearchWholeVaultTool();
        }
        this.searchAgent = new Agent<SearchToolSet>({
            model: this.aiServiceManager.getMultiChat()
                .getProviderService(this.options.searchAgentProvider)
                .modelClient(this.options.searchAgentModel),
            tools: searchTools,
            stopWhen: [
                stepCountIs(DEFAULT_MAX_SEARCH_AGENT_STEPS),
                // stop when the submit_final_answer tool is called
                hasToolCall('submit_final_answer'),
            ],
        });
    }

    /**
     * Stream search execution (used internally by thought agent)
     */
    public async streamSearch(prompt: string): Promise<AsyncGenerator<LLMStreamEvent>> {
        if (!prompt) {
            return (async function* (): AsyncGenerator<LLMStreamEvent> {
                yield { type: 'error', error: new Error('search prompt is required') };
            })();
        }

        const system = await this.aiServiceManager.renderPrompt(
            PromptId.AiSearchSystem,
            await genSystemInfo()
        );
        // read and learn: https://gist.github.com/sshh12/25ad2e40529b269a88b80e7cf1c38084
        const result = this.searchAgent.stream({
            system: system,
            prompt,
        });

        const self = this;

        return (async function* (): AsyncGenerator<LLMStreamEvent> {
            let finalSummary: string = '';
            const reasoningTextChunks: string[] = [];
            const thoughtTextChunks: string[] = [];
            for await (const chunk of result.fullStream) {
                switch (chunk.type) {
                    case 'text-delta':
                        thoughtTextChunks.push(chunk.text);
                        yield { type: 'text-delta', text: chunk.text, triggerName: StreamTriggerName.SEARCH_INSPECTOR_AGENT };
                        break;
                    case 'reasoning-delta':
                        reasoningTextChunks.push(chunk.text);
                        yield { type: 'reasoning-delta', text: chunk.text, triggerName: StreamTriggerName.SEARCH_INSPECTOR_AGENT };
                        break;
                    case 'tool-call': {
                        if (chunk.toolName === 'submit_final_answer') {
                            finalSummary = chunk.input.summary;
                            break;
                        }
                        // Preserve toolCallId for UI correlation
                        const callId = (chunk as any).toolCallId ?? `search-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                        yield {
                            type: 'tool-call',
                            id: callId,
                            toolName: chunk.toolName,
                            input: chunk.input,
                            triggerName: StreamTriggerName.SEARCH_INSPECTOR_AGENT
                        };
                        break;
                    }
                    case 'tool-result': {
                        // Register verified paths from tool outputs (EvidenceGate)
                        self.registerVerifiedPathsFromToolOutput?.(chunk.toolName, chunk.output);
                        // Preserve toolCallId for UI correlation
                        const resultId = (chunk as any).toolCallId ?? `search-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                        yield {
                            type: 'tool-result',
                            id: resultId,
                            toolName: chunk.toolName,
                            input: chunk.input,
                            output: chunk.output,
                            triggerName: StreamTriggerName.SEARCH_INSPECTOR_AGENT
                        };
                        break;
                    }
                    case 'tool-error': {
                        const errMsg = typeof (chunk as any).error === 'string'
                            ? (chunk as any).error
                            : (chunk as any).error?.message ?? JSON.stringify((chunk as any).error);
                        const toolName = (chunk as any).toolName ?? 'unknown';
                        console.warn('[AISearchAgent][streamSearch] tool-error:', toolName, errMsg);

                        yield {
                            type: 'error',
                            error: new Error(`Tool ${toolName} failed: ${errMsg}`),
                            triggerName: StreamTriggerName.SEARCH_INSPECTOR_AGENT,
                            extra: { toolName, toolCallId: (chunk as any).toolCallId },
                        };
                        break;
                    }
                    case 'finish': {
                        // console.debug('[AISearchAgent][streamSearch] complete:', JSON.stringify({
                        //     summary: finalSummary,
                        //     text: thoughtTextChunks.join('').trim(),
                        //     reasoning: reasoningTextChunks.join('').trim(),
                        // }));
                        yield {
                            type: 'complete',
                            finishReason: chunk.finishReason,
                            usage: chunk.totalUsage,
                            triggerName: StreamTriggerName.SEARCH_INSPECTOR_AGENT,
                            result: {
                                summary: finalSummary,
                                text: thoughtTextChunks.join('').trim(),
                                reasoning: reasoningTextChunks.join('').trim(),
                            },
                        };
                        break;
                    }
                    case 'start':
                    case 'start-step':
                    case 'reasoning-start':
                    case 'reasoning-end':
                    case 'text-start':
                    case 'text-end':
                    case 'finish-step':
                    case 'tool-input-end':
                    case 'tool-input-start':
                    case 'tool-input-delta':
                        // devtools will merge these duplicate logs.
                        console.debug('[AISearchAgent] streamSearch skip. one of the following types: '
                            + 'start, start-step, reasoning-start, reasoning-end, text-start, text-end, '
                            + 'finish-step, tool-input-start, tool-input-delta, tool-input-end');
                        break;
                    default:
                        yield { type: 'unSupported', chunk: chunk, comeFrom: 'streamSearch', triggerName: StreamTriggerName.SEARCH_INSPECTOR_AGENT };
                        break;
                }
            }
        })();
    }

    public async *manualToolCallHandle(chunkInput: any, resultCollector: Record<string, any>): AsyncGenerator<LLMStreamEvent> {
        const searchPrompt = (chunkInput?.prompt ?? chunkInput?.query) ?? '';
        const searchStream = await this.streamSearch(searchPrompt);

        // Forward search agent output in real-time
        const searchResultChunks: Record<string, any> = {};
        for await (const searchChunk of searchStream) {
            switch (searchChunk.type) {
                case 'complete':
                    resultCollector.stepTokenUsage = searchChunk.usage;
                    searchResultChunks.summary = searchChunk.result?.summary?.trim?.()?.length
                        ? searchChunk.result.summary
                        : searchChunk.result?.text;
                    break;
                default:
                    yield searchChunk;
                    break;
            }
        }
        resultCollector.searchResultChunks = searchResultChunks;
    }

}