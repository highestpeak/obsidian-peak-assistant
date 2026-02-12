
import { AIServiceManager } from "@/service/chat/service-manager";
import { Experimental_Agent as Agent, DynamicToolCall, hasToolCall, ProviderMetadata, stepCountIs } from 'ai';
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
import { LLMStreamEvent, LLMUsage, StreamTriggerName, ToolResultOutput, UIStepType } from "@/core/providers/types";
import { PromptId } from "@/service/prompt/PromptId";
import { generateUuidWithoutHyphens } from "@/core/utils/id-utils";
import { getFileNameFromPath } from "@/core/utils/file-utils";

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
        private readonly appendVerifiedPaths?: (paths: string[]) => void
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
            const stepId = generateUuidWithoutHyphens();
            yield {
                type: 'ui-step',
                uiType: UIStepType.STEPS_DISPLAY,
                stepId,
                title: 'Deep-diving into the knowledge base...',
            };

            let finalSummary: string = '';
            const reasoningTextChunks: string[] = [];
            const thoughtTextChunks: string[] = [];
            for await (const chunk of result.fullStream) {
                switch (chunk.type) {
                    case 'text-start':
                        yield {
                            type: 'ui-step',
                            uiType: UIStepType.STEPS_DISPLAY,
                            stepId,
                            title: 'Deep-diving into the knowledge base... Thinking...',
                            description: 'Thinking about the request...',
                        };
                        break;
                    case 'text-delta':
                        thoughtTextChunks.push(chunk.text);
                        yield { type: 'text-delta', text: chunk.text, triggerName: StreamTriggerName.SEARCH_INSPECTOR_AGENT };
                        yield {
                            type: 'ui-step-delta',
                            uiType: UIStepType.STEPS_DISPLAY,
                            stepId,
                            descriptionDelta: chunk.text,
                        };
                        break;
                    case 'reasoning-start':
                        yield {
                            type: 'ui-step',
                            uiType: UIStepType.STEPS_DISPLAY,
                            stepId,
                            title: 'Deep-diving into the knowledge base... Reasoning...',
                            description: 'Reasoning about the request...',
                        };
                        break;
                    case 'reasoning-delta':
                        reasoningTextChunks.push(chunk.text);
                        yield { type: 'reasoning-delta', text: chunk.text, triggerName: StreamTriggerName.SEARCH_INSPECTOR_AGENT };
                        yield {
                            type: 'ui-step-delta',
                            uiType: UIStepType.STEPS_DISPLAY,
                            stepId,
                            descriptionDelta: chunk.text,
                        };
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
                        const uiEvent = buildToolCallUIEvent(chunk, stepId);
                        if (uiEvent) {
                            yield uiEvent;
                        }
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
                        yield {
                            type: 'ui-step',
                            uiType: UIStepType.STEPS_DISPLAY,
                            stepId,
                            title: 'Deep-dive into the knowledge base... Finished!',
                            description: 'Deep-dive into the knowledge base finished!',
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


    /**
     * Register paths from tool outputs as verified.
     * Called when processing vault_inspector or content_reader results.
     */
    private registerVerifiedPathsFromToolOutput(toolName: string, output: any): void {
        if (!output) return;
        if (!this.appendVerifiedPaths) return;

        try {
            // Handle structured output with results array (local_search, etc.)
            if (output.results && Array.isArray(output.results)) {
                for (const item of output.results) {
                    if (item.path) {
                        this.appendVerifiedPaths([item.path]);
                    }
                }
            }
            // Handle data.results pattern (hybrid mode)
            if (output.data?.results && Array.isArray(output.data.results)) {
                for (const item of output.data.results) {
                    if (item.path) {
                        this.appendVerifiedPaths([item.path]);
                    }
                }
            }
            // Handle graph nodes
            if (output.levels && Array.isArray(output.levels)) {
                for (const level of output.levels) {
                    if (level.documentNodes && Array.isArray(level.documentNodes)) {
                        for (const node of level.documentNodes) {
                            // Graph nodes may have path in attributes
                            const attrs = typeof node.attributes === 'string'
                                ? JSON.parse(node.attributes)
                                : node.attributes;
                            if (attrs?.path) {
                                this.appendVerifiedPaths([attrs.path]);
                            }
                        }
                    }
                }
            }
            // Handle content_reader responses
            if (toolName === 'content_reader' && typeof output === 'object' && output.path) {
                this.appendVerifiedPaths([output.path]);
            }
        } catch (error) {
            console.warn(`[AISearchAgent] Error extracting paths from tool output: ${error}`);
        }
    }
}

function buildToolCallUIEvent(chunk: any, stepId: string): LLMStreamEvent | undefined {
    const toolName = chunk.toolName;
    if (!toolName) return undefined;
    const input = chunk.input ?? {};
    let fileName = '';
    switch (toolName) {
        case 'content_reader':
            fileName = getFileNameFromPath(input.path);
            const ifQuery = input.query ? `Query: ${input.query}` : '';
            const ifRange = input.lineRange ? `Range: ${input.lineRange.start}-${input.lineRange.end}` : '';
            return {
                type: 'ui-step',
                uiType: UIStepType.STEPS_DISPLAY,
                stepId,
                title: `Read File. ${input.mode} read. ${fileName}. ${ifQuery} ${ifRange}`,
                description: JSON.stringify(input),
            };
        case 'inspect_note_context':
            fileName = getFileNameFromPath(input.note_path);
            return {
                type: 'ui-step',
                uiType: UIStepType.STEPS_DISPLAY,
                stepId,
                title: `Inspect Note Context. ${fileName}.`,
                description: JSON.stringify(input),
            };
        case 'graph_traversal':
            fileName = getFileNameFromPath(input.start_note_path);
            const ifHops = input.hops ? `Hops: ${input.hops}` : '';
            return {
                type: 'ui-step',
                uiType: UIStepType.STEPS_DISPLAY,
                stepId,
                title: `Explore Graph. ${fileName}. ${ifHops}`,
                description: JSON.stringify(input),
            };
        case 'find_path':
            fileName = getFileNameFromPath(input.start_note_path);
            const endFileName = getFileNameFromPath(input.end_note_path);
            return {
                type: 'ui-step',
                uiType: UIStepType.STEPS_DISPLAY,
                stepId,
                title: `Find Path. ${fileName} -> ${endFileName}.`,
                description: JSON.stringify(input),
            };
        case 'find_key_nodes':
            return {
                type: 'ui-step',
                uiType: UIStepType.STEPS_DISPLAY,
                stepId,
                title: `Find Key Nodes in vault.`,
                description: JSON.stringify(input),
            };
        case 'find_orphans':
            return {
                type: 'ui-step',
                uiType: UIStepType.STEPS_DISPLAY,
                stepId,
                title: `Find Orphans in vault.`,
                description: JSON.stringify(input),
            };
        case 'search_by_dimensions':
            return {
                type: 'ui-step',
                uiType: UIStepType.STEPS_DISPLAY,
                stepId,
                title: `Search by Dimensions. ${input.boolean_expression}.`,
                description: JSON.stringify(input),
            };
        case 'explore_folder':
            fileName = getFileNameFromPath(input.folder_path);
            const ifRecursive = input.recursive ? `Recursive: true` : `Recursive: false`;
            const ifMaxDepth = input.max_depth ? `Max Depth: ${input.max_depth}` : '';
            return {
                type: 'ui-step',
                uiType: UIStepType.STEPS_DISPLAY,
                stepId,
                title: `Explore Folder. ${fileName}. ${ifRecursive} ${ifMaxDepth}`,
                description: JSON.stringify(input),
            };
        case 'recent_changes_whole_vault':
            return {
                type: 'ui-step',
                uiType: UIStepType.STEPS_DISPLAY,
                stepId,
                title: `Search recent Changes Whole Vault.`,
                description: JSON.stringify(input),
            };
        case 'local_search_whole_vault':
            const ifSearchQuery = input.query ? `Query: ${input.query}` : '';
            const ifScopeMode = input.scopeMode ? `Scope Mode: ${input.scopeMode}` : '';
            return {
                type: 'ui-step',
                uiType: UIStepType.STEPS_DISPLAY,
                stepId,
                title: `Local Search Whole Vault. ${ifSearchQuery}. ${ifScopeMode}.`,
                description: JSON.stringify(input),
            };
        case 'submit_final_answer':
        default:
            return undefined;
    }
}
