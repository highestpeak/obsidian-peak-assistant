import { LLMStreamEvent, LLMUsage, StreamTriggerName, ToolResultOutput, mergeTokenUsage } from '@/core/providers/types';
import { toReActThoughtPromptMessages, generateToolCallId, convertMessagesToText } from '@/core/providers/adapter/ai-sdk-adapter';
import { localWebSearchTool } from '@/service/tools/search-web';
import { Experimental_Agent as Agent, hasToolCall, stepCountIs } from 'ai';
import { PromptId } from '@/service/prompt/PromptId';
import { submitFinalAnswerTool } from '@/service/tools/submit-final-answer';
import { AgentTool, ManualToolCallHandler } from '@/service/tools/types';
import { buildLLMRequestMessage } from '@/core/providers/helpers/message-helper';
import { AIServiceManager } from '../chat/service-manager';
import { RawSearchAgent } from './search-agent-helper/RawSearchAgent';
import { callAgentTool } from '../tools/call-agent-tool';
import { buildDimensionTool, makeDimensionManualToolHandler, registerVerifiedPathsFromToolOutput } from './search-agent-helper/ResultUpdateToolHelper';
import { DimensionUpdateAgent } from './search-agent-helper/DimensionUpdateAgent';
import type { ResultUpdateDimension } from './search-agent-helper/ResultUpdateToolHelper';
import { AgentMemoryManager } from './search-agent-helper/AgentMemoryManager';
import { applyOperationsForDimension } from './search-agent-helper/ResultUpdateToolHelper';
import { normalizeMermaidForDisplay } from '@/core/utils/mermaid-utils';

/** Simple: summary + sources only (save tokens). Full: complete analysis. */
export type AnalysisMode = 'simple' | 'full';

export interface AISearchAgentOptions {
    enableWebSearch?: boolean;
    enableLocalSearch?: boolean;
    /** Simple mode: only summary + sources (save tokens). Full: complete analysis. */
    analysisMode?: AnalysisMode;
    /**
     * Maximum iterations for multi-agent ReAct loop.
     */
    maxMultiAgentIterations?: number;
    /**
     * Maximum wall clock time in milliseconds for the entire search.
     */
    maxWallClockMs?: number;
    /**
     * model id for thought agent
     */
    thoughtAgentModel: string;
    /**
     * provider for thought agent
     */
    thoughtAgentProvider: string;
    /**
     * model id for search agent
     */
    searchAgentModel: string;
    /**
     * provider for search agent
     */
    searchAgentProvider: string;
}

/** Tool names that update agent result; tool-result for these carries extra.currentResult for incremental UI. */
export const RESULT_UPDATE_TOOL_NAMES = new Set(['update_result', 'update_sources', 'update_topics', 'update_graph', 'add_dashboard_blocks']);

/**
 * Tool set for thought agent (coordinator).
 */
type ThoughtToolSet = {
    call_search_agent: AgentTool;
    update_sources: AgentTool;
    update_topics: AgentTool;
    update_graph: AgentTool;
    add_dashboard_blocks: AgentTool;
    submit_final_answer: AgentTool;
};

// search agent max multi agent iterations.
const DEFAULT_MAX_MULTI_AGENT_ITERATIONS = 100;
// search thought agent max wall clock time.
const DEFAULT_MAX_WALL_CLOCK_MS = 10 * 60 * 1000;
// Maximum consecutive iterations without progress before forcing synthesis.
// IMPORTANT: this must be conservative, otherwise the agent may terminate before any meaningful tool chain completes.
const MAX_NO_PROGRESS_ITERATIONS = 4;
// Do not apply "no progress" early-stop too early, especially when the dashboard is still empty.
const MIN_ITERATIONS_BEFORE_NO_PROGRESS_CHECK = 10;

export interface InsightCard {
    id: string;
    title: string;
    description: string;
    icon: string;
    color: string;
}

export interface Suggestion {
    id: string;
    title: string;
    description: string;
    icon: string;
    color: string;
}

/** Layout slot for dashboard blocks. */
export type DashboardSlot = 'MAIN' | 'SIDEBAR' | 'FLOW';
/** How to render the block content. */
export type DashboardRenderEngine = 'MARKDOWN' | 'TILE' | 'ACTION_GROUP' | 'MERMAID';

/** Single item in a TILE or ACTION_GROUP block. */
export interface DashboardBlockItem {
    id: string;
    title: string;
    description?: string;
    icon?: string;
    color?: string;
}

/** Dynamic dashboard block (inspiration, Mermaid, etc.); AI decides title, slot, and content. */
export interface DashboardBlock {
    id: string;
    title?: string;
    category?: string;
    slot: DashboardSlot;
    /** 0-10; drives grid layout: 1-3 small, 4-6 medium, 7-10 full-width. */
    weight?: number;
    renderEngine: DashboardRenderEngine;
    items?: DashboardBlockItem[];
    markdown?: string;
    mermaidCode?: string;
}

export interface AISearchSource {
    id: string;
    title: string;
    // important: we will open file by this path.
    path: string;
    // why it was selected or rejected.
    reasoning: string;
    // add badges to the item to quickly judge the role of each note in the current analysis.
    badges: string[];
    score: {
        // 0~100
        physical: number;
        semantic: number;
        average: number;
    }
}

export interface AISearchTopic {
    label: string;
    weight: number
}

export interface AISearchNode {
    // uuid of the node. generated by agent.
    id: string;
    // we can add many types of nodes. like file, folder, concept, tag, etc. determined by Agent.
    type: string;
    // title of the node. generated by agent.
    title: string;
    // important: we will open file by this path.
    path?: string;
    // attributes of the node. like tags, categories, etc. determined by Agent.
    attributes: {
        [key: string]: any;
    };
}

export interface AISearchEdge {
    // uuid of the edge. generated by agent.
    id: string;
    // uuid of the source node.
    source: string;
    // type of the edge. like link, reference, etc. determined by Agent.
    type: string;
    // uuid of the target node.
    target: string;
    // attributes of the edge. like weight, etc. determined by Agent.
    attributes: {
        [key: string]: any;
    };
}

export interface AISearchGraph {
    nodes: AISearchNode[];
    edges: AISearchEdge[];
}

export interface SearchAgentResult {
    /** Short display title (generated at end of analysis). */
    title?: string;
    summary: string;
    graph: AISearchGraph;
    dashboardBlocks?: DashboardBlock[];
    topics: AISearchTopic[];
    sources: AISearchSource[];
    /** Overview diagram generated by Mermaid Overview Agent (raw Mermaid code). */
    overviewMermaid?: string;
}

/**
 * Search Agent.
 * ReAct architecture.
 * Multi agent architecture. (SubAgents)
 */
export class AISearchAgent {
    /**
     * Thought Agent - main coordinator for ReAct loop
     */
    private thoughtAgent: Agent<ThoughtToolSet>;

    /**
     * Search Agent - sub agent for search tasks
     */
    private searchAgent: RawSearchAgent;

    /**
     * Manual tool call handlers
     */
    private manualToolCallHandlers: Record<string, ManualToolCallHandler> = {};

    /**
     * Maximum iterations for multi-agent ReAct loop
     */
    private maxIterations: number;
    /**
     * Maximum wall clock time for the entire search
     */
    private maxWallClockMs: number;

    /**
     * Agent memory
     */
    private agentMemoryManager: AgentMemoryManager;
    /**
     * Agent result
     */
    private agentResult: SearchAgentResult;
    /**
     * Set of verified paths (paths that exist in vault/DB or appeared in tool outputs)
     */
    private verifiedPaths: Set<string> = new Set();

    constructor(
        private readonly aiServiceManager: AIServiceManager,
        private options: AISearchAgentOptions,
    ) {
        this.maxIterations = this.options.maxMultiAgentIterations ?? DEFAULT_MAX_MULTI_AGENT_ITERATIONS;
        this.maxWallClockMs = this.options.maxWallClockMs ?? DEFAULT_MAX_WALL_CLOCK_MS;

        this.searchAgent = new RawSearchAgent(
            this.aiServiceManager,
            this.options,
            (toolName, output) => registerVerifiedPathsFromToolOutput(toolName, output, this.verifiedPaths)
        );

        const getResult = () => this.agentResult ?? this.resetAgentResult();
        this.thoughtAgent = new Agent<ThoughtToolSet>({
            model: this.aiServiceManager.getMultiChat()
                .getProviderService(this.options.thoughtAgentProvider)
                .modelClient(this.options.thoughtAgentModel),
            tools: {
                call_search_agent: callAgentTool('search'),
                submit_final_answer: submitFinalAnswerTool(),
                // although we have manual tool call handlers for these tools, we define these tools again to make thought agent call them directly. 
                // and avoid more LLM calls. these dimension tools will never be executed. they will be handled by the manual tool call handlers.
                update_sources: buildDimensionTool('sources', getResult, this.verifiedPaths),
                update_topics: buildDimensionTool('topics', getResult, this.verifiedPaths),
                update_graph: buildDimensionTool('graph', getResult, this.verifiedPaths),
                add_dashboard_blocks: buildDimensionTool('dashboardBlocks', getResult, this.verifiedPaths),
            },
            stopWhen: [
                // default: stop at every call. we manually control the loop using ReAct loop.
                stepCountIs(1),
                // stop when the submit_final_answer tool is called
                hasToolCall('submit_final_answer'),
            ],
            // do not use tool choice. this only control the next tool to be called.
            // don't understand this too much currently. don't find enough documentation about it.
            // toolChoice: {
            //     type: 'tool',
            //     toolName: 'submit_final_answer',
            // },
        });

        /** Manual tool call handlers for the thought agent. */
        this.manualToolCallHandlers['call_search_agent'] = {
            toolName: 'call_search_agent',
            triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT,
            handle: this.searchAgent.manualToolCallHandle.bind(this.searchAgent),
            outputGetter: (resultCollector) => resultCollector.searchResultChunks,
        };
        this.initManualToolCallHandlers('update_sources', 'sources', StreamTriggerName.SEARCH_SOURCES_AGENT, PromptId.SourcesUpdateAgentSystem);
        this.initManualToolCallHandlers('update_topics', 'topics', StreamTriggerName.SEARCH_TOPICS_AGENT, PromptId.TopicsUpdateAgentSystem);
        this.initManualToolCallHandlers('update_graph', 'graph', StreamTriggerName.SEARCH_GRAPH_AGENT, PromptId.GraphUpdateAgentSystem);
        this.initManualToolCallHandlers('add_dashboard_blocks', 'dashboardBlocks', StreamTriggerName.SEARCH_DASHBOARD_AGENT, PromptId.DashboardBlocksUpdateAgentSystem);

        /** Agent memory manager. */
        this.agentMemoryManager = new AgentMemoryManager(
            this.aiServiceManager,
            this.options
        );
    }

    private initManualToolCallHandlers(manualKey: keyof ThoughtToolSet, dimension: ResultUpdateDimension, triggerName: StreamTriggerName, promptId: PromptId): void {
        const getResult = () => this.agentResult || this.resetAgentResult();
        this.manualToolCallHandlers[manualKey] = makeDimensionManualToolHandler(
            dimension,
            triggerName,
            new DimensionUpdateAgent(
                this.aiServiceManager,
                {
                    provider: this.options.thoughtAgentProvider,
                    model: this.options.thoughtAgentModel,
                },
                {
                    getResult,
                    verifiedPaths: this.verifiedPaths,
                },
                dimension,
                promptId,
                triggerName
            ),
            getResult,
            this.verifiedPaths
        );
    }

    /**
     * Stream search results with ReAct loop (ThoughtAgent coordinates SearchAgent)
     */
    async stream(prompt: string): Promise<AsyncGenerator<LLMStreamEvent>> {
        this.resetAgentResult();
        return this.executeReActLoop(prompt);
    }

    private resetAgentResult(): SearchAgentResult {
        this.agentResult = {
            title: '',
            summary: '',
            topics: [],
            graph: { nodes: [], edges: [] },
            sources: [],
            dashboardBlocks: [],
        };
        // Clear verified paths for fresh start
        this.verifiedPaths.clear();
        return this.agentResult;
    }

    /**
     * Execute the ReAct loop (ThoughtAgent coordinates SearchAgent)
     * Implements controlled state machine with early stop and time budget.
     */
    private async *executeReActLoop(initialPrompt: string): AsyncGenerator<LLMStreamEvent> {
        // Initialize agent memory for this session
        this.agentMemoryManager.resetAgentMemory(initialPrompt);

        // iteraction control
        let iterationCount = 0;
        let reActStartTimeMs = Date.now();
        let isSubmitResultCalled = false;
        // Track progress for early stop detection
        let noProgressIterations = 0;
        let previousSourcesCount = 0;
        let previousNodesCount = 0;
        let previousEdgesCount = 0;

        while (iterationCount < this.maxIterations) {
            iterationCount++;

            // Check time budget before starting new iteration
            const elapsedMs = Date.now() - reActStartTimeMs;
            if (elapsedMs > this.maxWallClockMs) {
                yield {
                    type: 'pk-debug',
                    debugName: 'thought-agent-time-budget-exceeded',
                    triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT,
                    extra: {
                        reason: `[AISearchAgent] Time budget exceeded (${elapsedMs}ms > ${this.maxWallClockMs}ms), forcing synthesis`,
                    },
                };
                break;
            }

            // Check early stop conditions
            const currentSourcesCount = this.agentResult.sources.length;
            const currentNodesCount = this.agentResult.graph.nodes.length;
            const currentEdgesCount = this.agentResult.graph.edges.length;
            yield {
                type: 'pk-debug',
                debugName: 'thought-agent-iteration-progress',
                triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT,
                extra: {
                    iterationCount,
                    currentSourcesCount,
                    currentNodesCount,
                    currentEdgesCount,
                    previousSourcesCount,
                    previousNodesCount,
                    previousEdgesCount,
                    noProgressIterations,
                },
            };
            // Detect no progress - force synthesis only after we gave the agent enough iterations to actually run tool chains.
            if (iterationCount >= MIN_ITERATIONS_BEFORE_NO_PROGRESS_CHECK) {
                if (currentSourcesCount === previousSourcesCount &&
                    currentNodesCount === previousNodesCount &&
                    currentEdgesCount === previousEdgesCount) {
                    noProgressIterations++;
                } else {
                    noProgressIterations = 0;
                }
            }
            if (noProgressIterations >= MAX_NO_PROGRESS_ITERATIONS) {
                yield {
                    type: 'pk-debug',
                    debugName: 'thought-agent-no-progress',
                    triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT,
                    extra: {
                        reason: `[AISearchAgent] No progress for ${noProgressIterations} iterations (sources=${currentSourcesCount}), forcing synthesis`,
                    },
                };
                break;
            }
            previousSourcesCount = currentSourcesCount;
            previousNodesCount = currentNodesCount;
            previousEdgesCount = currentEdgesCount;

            const thoughtTextChunks: string[] = [];
            const reasoningTextChunks: string[] = [];
            let stepTokenUsage: LLMUsage = {
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
            };
            let toolCalls: Array<{ toolCallId: string; toolName: string; input: any }> = [];
            let toolResults: Array<{ toolCallId: string; toolName: string; output: ToolResultOutput }> = [];

            // Build current prompt with agent memory, yielding progress events
            const promptGenerator = this.agentMemoryManager.buildCurrentPrompt();
            for await (const chunk of promptGenerator) {
                // Yield summary generation progress
                yield chunk;
            }
            // Get the final prompt after summarization is complete
            const currentPrompt = this.agentMemoryManager.agentMemoryToPrompt();
            const nextThoughtPrompt = toReActThoughtPromptMessages(currentPrompt);
            yield {
                type: 'pk-debug',
                debugName: 'thought-agent-next-thought-prompt',
                triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT,
                extra: {
                    nextThoughtPrompt,
                },
            };

            // ThoughtAgent thinks and decides next action (streaming)
            const analysisMode = this.options.analysisMode ?? 'full';
            const simpleMode = analysisMode === 'simple';
            const thoughtStream = this.thoughtAgent.stream({
                system: await this.aiServiceManager.renderPrompt(PromptId.ThoughtAgentSystem, { analysisMode, simpleMode }),
                prompt: nextThoughtPrompt,
            });
            // Process thoughtAgent's stream in real-time
            for await (const chunk of thoughtStream.fullStream) {
                switch (chunk.type) {
                    case 'text-delta':
                        thoughtTextChunks.push(chunk.text);
                        yield { type: 'text-delta', text: chunk.text, triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT };
                        break;
                    case 'reasoning-delta':
                        reasoningTextChunks.push(chunk.text);
                        yield { type: 'reasoning-delta', text: chunk.text, triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT };
                        break;
                    case 'tool-call': {
                        const toolCallId = (chunk as { toolCallId?: string }).toolCallId ?? generateToolCallId();
                        toolCalls.push({ toolCallId, toolName: chunk.toolName, input: chunk.input });
                        if (chunk.toolName === 'submit_final_answer') {
                            isSubmitResultCalled = true;
                        }
                        yield {
                            type: 'tool-call',
                            id: toolCallId,
                            toolName: chunk.toolName,
                            input: chunk.input,
                            triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT,
                        };

                        const manualToolCallHandler = this.manualToolCallHandlers[chunk.toolName];
                        if (manualToolCallHandler) {
                            const resultCollector: Record<string, any> = {};
                            yield* manualToolCallHandler.handle(chunk.input, resultCollector);
                            stepTokenUsage = mergeTokenUsage(stepTokenUsage, resultCollector.stepTokenUsage);
                            toolResults.push({
                                toolCallId,
                                toolName: chunk.toolName,
                                output: {
                                    type: 'text',
                                    value: JSON.stringify(manualToolCallHandler.outputGetter?.(resultCollector) ?? resultCollector),
                                }
                            });
                            yield {
                                type: 'tool-result',
                                id: toolCallId,
                                toolName: chunk.toolName,
                                input: chunk.input,
                                output: manualToolCallHandler.outputGetter?.(resultCollector) ?? resultCollector,
                                triggerName: manualToolCallHandler.triggerName,
                                ...(RESULT_UPDATE_TOOL_NAMES.has(chunk.toolName)
                                    ? { extra: { currentResult: this.agentResult } }
                                    : {}),
                            };
                        }
                        break;
                    }
                    case 'tool-result':
                        // already handled by manual tool call handler.
                        if (this.manualToolCallHandlers[chunk.toolName]) {
                            break;
                        }
                        // Register verified paths from tool outputs (EvidenceGate)
                        registerVerifiedPathsFromToolOutput(chunk.toolName, chunk.output, this.verifiedPaths);

                        const toolCallId = (chunk as { toolCallId?: string }).toolCallId ?? generateToolCallId();
                        toolResults.push({
                            toolCallId,
                            toolName: chunk.toolName,
                            output: {
                                type: 'text',
                                value: JSON.stringify(chunk.output),
                            }
                        });
                        yield {
                            type: 'tool-result',
                            id: toolCallId,
                            toolName: chunk.toolName,
                            input: chunk.input,
                            output: chunk.output,
                            triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT,
                            extra: {
                                currentResult: this.agentResult,
                            },
                        };
                        break;
                    case 'finish':
                        stepTokenUsage = mergeTokenUsage(stepTokenUsage, chunk.totalUsage);
                        yield {
                            type: 'on-step-finish',
                            text: thoughtTextChunks.join('').trim(),
                            finishReason: chunk.finishReason,
                            usage: chunk.totalUsage,
                            triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT
                        };
                        break;
                    case 'tool-error': {
                        const errMsg = typeof (chunk as any).error === 'string'
                            ? (chunk as any).error
                            : (chunk as any).error?.message ?? JSON.stringify((chunk as any).error);
                        const toolName = (chunk as any).toolName ?? 'unknown';

                        const isRecoverableError = errMsg.includes('unavailable tool') || errMsg.includes('not available') || errMsg.includes('Available tools:');

                        // All errors must be yield as error. but recoverable errors will be handled separately.
                        yield {
                            type: 'error',
                            error: new Error(`Tool ${toolName} failed: ${errMsg}`),
                            triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT,
                            extra: { toolName, toolCallId: (chunk as any).toolCallId, isRecoverableError },
                        };

                        // Recoverable error: "unavailable tool" - ThoughtAgent tried to call SearchAgent's tools directly
                        if (isRecoverableError) {
                            // Inject corrective reminder into agent memory for next iteration
                            const correctiveMessage = buildLLMRequestMessage('assistant',
                                `Error: Attempted to call unavailable tool '${toolName}'. ` +
                                `ThoughtAgent can only use: ${Object.keys(this.thoughtAgent.tools).join(', ')}. ` +
                                `To search the vault, use call_search_agent with a prompt describing what you want to find.`
                            );
                            this.agentMemoryManager.pushMessage(correctiveMessage);
                            break;
                        }

                        break;
                    }
                    case 'start':
                    case 'start-step':
                    case 'reasoning-start':
                    case 'reasoning-end':
                    case 'text-start':
                    case 'text-end':
                    case 'finish-step':
                    case 'tool-input-start':
                    case 'tool-input-delta':
                    case 'tool-input-end':
                        // devtools will merge these duplicate logs.
                        console.debug('[AISearchAgent] thoughtAgent skip. one of the following types: '
                            + 'start, start-step, reasoning-start, reasoning-end, text-start, text-end, '
                            + 'finish-step, tool-input-start, tool-input-delta, tool-input-end');
                        break;
                    default:
                        yield { type: 'unSupported', chunk: chunk, comeFrom: 'thoughtAgent', triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT };
                        break;
                }
            }

            // Build thought message and update agent memory
            this.agentMemoryManager.buildIterationThoughtMessage(thoughtTextChunks, reasoningTextChunks, toolCalls, toolResults, stepTokenUsage);

            // ThoughtAgent decided to submit final answer, end the loop
            if (isSubmitResultCalled) {
                console.debug('[AISearchAgent] ThoughtAgent decided to submit final answer, end the loop');
                break;
            }
        }

        if (!isSubmitResultCalled) {
            yield {
                type: 'pk-debug',
                debugName: 'Exited_loop_without_submitting',
                extra: {
                    messages: 'Exited loop without submitting (max iterations or early stop)',
                    reActStartTimeMs,
                    reActEndTimeMs: Date.now(),
                    reActDurationMs: Date.now() - reActStartTimeMs,
                },
            }
        }
        yield* this.finishReActLoop(reActStartTimeMs);
    }

    private async *finishReActLoop(reActStartTimeMs: number): AsyncGenerator<LLMStreamEvent> {
        for await (const chunk of this.streamFinalSummary()) {
            yield chunk;
        }
        for await (const chunk of this.streamTitle()) {
            yield chunk;
        }
        for await (const chunk of this.streamOverviewMermaid()) {
            yield chunk;
        }
        for await (const chunk of this.runReviewBlocks()) {
            yield chunk;
        }

        yield {
            type: 'complete',
            finishReason: 'stop',
            usage: this.agentMemoryManager.getAgentMemory().totalTokenUsage,
            durationMs: Date.now() - reActStartTimeMs,
            result: this.agentResult,
            triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT,
        };
    }

    /**
     * Stream the final summary prompt and set `agentResult.summary`.
     */
    private async *streamFinalSummary(): AsyncGenerator<LLMStreamEvent> {
        const variables = {
            agentResult: this.agentResult,
            agentMemory: this.agentMemoryManager.getAgentMemory(),
            options: this.options,
            latestMessagesText: convertMessagesToText(this.agentMemoryManager.getAgentMemory().latestMessages),
        };

        const summaryStream = this.aiServiceManager.chatWithPromptStream(
            PromptId.SearchAiSummary,
            variables,
        );

        for await (const chunk of summaryStream) {
            if (chunk.type === 'prompt-stream-result') {
                this.agentResult.summary = chunk.output;
            }
            yield { ...chunk, triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT };
        }
    }

    /**
     * Generate and set agentResult.title (used for save filename, recent list, folder suggestion).
     */
    private async *streamTitle(): AsyncGenerator<LLMStreamEvent> {
        const memory = this.agentMemoryManager.getAgentMemory();
        const r = this.agentResult;
        const variables = {
            query: memory.initialPrompt ?? '',
            summary: (r.summary ?? '').trim().slice(0, 400) || undefined,
        };
        const stream = this.aiServiceManager.chatWithPromptStream(
            PromptId.AiAnalysisTitle,
            variables,
        );
        for await (const chunk of stream) {
            if (chunk.type === 'prompt-stream-result') {
                const raw = String(chunk.output ?? '').trim().slice(0, 80);
                this.agentResult.title = raw || undefined;
            }
            yield { ...chunk, triggerName: StreamTriggerName.SEARCH_TITLE };
        }
    }

    /**
     * Stream Mermaid overview generation and set agentResult.overviewMermaid.
     * Uses current agentResult and agentMemory as context.
     */
    private async *streamOverviewMermaid(): AsyncGenerator<LLMStreamEvent> {
        const memory = this.agentMemoryManager.getAgentMemory();
        const r = this.agentResult;
        const originalQuery = memory.initialPrompt ?? '';
        const summary = r.summary?.trim() ?? '';
        const topicsText = r.topics?.length
            ? r.topics.map((t) => t.label).join(', ')
            : '';
        const graphSummary =
            r.graph?.nodes?.length || r.graph?.edges?.length
                ? `Nodes: ${r.graph.nodes.length}, Edges: ${r.graph.edges.length}. Sample: ${(r.graph.nodes ?? []).slice(0, 8).map((n) => n.title).join(', ')}`
                : '';
        const sourcesSummary = (r.sources ?? [])
            .slice(0, 6)
            .map((s) => s.title || s.path)
            .join(', ') || '';
        const blocksSummary = (r.dashboardBlocks ?? [])
            .slice(0, 5)
            .map((b) => b.title || b.category || b.id)
            .join(', ') || '';

        const variables = {
            originalQuery,
            summary: summary || '(none)',
            topicsText: topicsText || '(none)',
            graphSummary: graphSummary || '(none)',
            sourcesSummary: sourcesSummary || '(none)',
            blocksSummary: blocksSummary || '(none)',
        };

        const stream = this.aiServiceManager.chatWithPromptStream(
            PromptId.AiAnalysisOverviewMermaid,
            variables,
        );

        for await (const chunk of stream) {
            if (chunk.type === 'prompt-stream-result') {
                const raw = String(chunk.output ?? '').trim();
                this.agentResult.overviewMermaid = normalizeMermaidForDisplay(raw);
            }
            yield { ...chunk, triggerName: StreamTriggerName.SEARCH_OVERVIEW_MERMAID };
        }
    }

    /** Max rounds of review-and-apply for dashboard blocks. */
    private static readonly MAX_REVIEW_STEPS = 2;

    /**
     * Run blocks review agent and apply suggested operations (automatic after overview).
     */
    private async *runReviewBlocks(): AsyncGenerator<LLMStreamEvent> {
        const memory = this.agentMemoryManager.getAgentMemory();
        const r = this.agentResult;
        const originalQuery = memory.initialPrompt ?? '';
        const summaryBrief = (r.summary ?? '').trim().slice(0, 400);
        const getResult = () => this.agentResult;
        const blocksJson = JSON.stringify(r.dashboardBlocks ?? [], null, 0);
        const variables = {
            originalQuery,
            summaryBrief: summaryBrief || '(none)',
            blocksJson: blocksJson || '[]',
        };

        for (let step = 0; step < AISearchAgent.MAX_REVIEW_STEPS; step++) {

            yield {
                type: 'pk-debug',
                debugName: 'review-blocks-start',
                triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT,
                extra: { step: step + 1, maxSteps: AISearchAgent.MAX_REVIEW_STEPS },
            };

            let raw: string;
            try {
                raw = await this.aiServiceManager.chatWithPrompt(PromptId.AiAnalysisBlocksReview, variables);
            } catch (e) {
                yield {
                    type: 'pk-debug',
                    debugName: 'review-blocks-error',
                    triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT,
                    extra: { error: String(e) },
                };
                break;
            }

            let parsed: { needsFix?: boolean; suggestedOperations?: any[] };
            try {
                const stripped = String(raw ?? '').replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/, '$1');
                parsed = JSON.parse(stripped) as typeof parsed;
            } catch {
                break;
            }

            if (!parsed.needsFix || !Array.isArray(parsed.suggestedOperations) || parsed.suggestedOperations.length === 0) {
                yield {
                    type: 'pk-debug',
                    debugName: 'review-blocks-done',
                    triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT,
                    extra: { applied: false, reason: 'no fix needed' },
                };
                break;
            }

            const ops = parsed.suggestedOperations.filter(
                (o: any) => o && o.targetField === 'dashboardBlocks'
            );
            if (ops.length === 0) break;

            const { success, message } = await applyOperationsForDimension(
                'dashboardBlocks',
                getResult,
                ops,
                this.verifiedPaths
            );

            yield {
                type: 'pk-debug',
                debugName: 'review-blocks-result',
                triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT,
                extra: { step: step + 1, success, message },
            };

            if (!success) break;
        }
    }
}
