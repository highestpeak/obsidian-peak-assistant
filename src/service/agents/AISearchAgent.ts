import { LLMStreamEvent, mergeTokenUsage, OneGenerationContext, StreamTriggerName, UIStepType } from '@/core/providers/types';
import { toReActThoughtPromptMessages, generateToolCallId, convertMessagesToText, getToolErrorMessage } from '@/core/providers/adapter/ai-sdk-adapter';
import { localWebSearchTool } from '@/service/tools/search-web';
import { Experimental_Agent as Agent, hasToolCall, stepCountIs } from 'ai';
import { PromptId } from '@/service/prompt/PromptId';
import { submitFinalAnswerTool } from '@/service/tools/submit-final-answer';
import { AgentTool, ManualToolCallHandler } from '@/service/tools/types';
import { buildToolCorrectionMessage, buildToolErrorStreamEvent } from '@/core/providers/helpers/message-helper';
import { AIServiceManager } from '../chat/service-manager';
import { RawSearchAgent } from './search-agent-helper/RawSearchAgent';
import { callAgentTool } from '../tools/call-agent-tool';
import { AgentMemoryManager } from './search-agent-helper/AgentMemoryManager';
import { SummaryAgent } from './search-agent-helper/SummaryAgent';
import { MermaidOverviewAgent } from './search-agent-helper/MermaidOverviewAgent';
import { SourcesUpdateAgent } from './search-agent-helper/SourcesUpdateAgent';
import { TopicsUpdateAgent } from './search-agent-helper/TopicsUpdateAgent';
import { GraphUpdateAgent } from './search-agent-helper/GraphUpdateAgent';
import { DashboardBlocksUpdateAgent } from './search-agent-helper/DashboardBlocksUpdateAgent';
import { buildMinifiedResultSnapshot } from './search-agent-helper/resultSnapshot';
import { memoizeSupplier } from '@/core/utils/functions';
import { emptyUsage } from '@/core/providers/types';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import { DELTA_EVENT_TYPES, getDeltaEventDeltaText } from '@/core/providers/helpers/stream-helper';
import { normalizeFilePath } from '@/core/utils/file-utils';

/** Normalize string for file node id (same as DashboardUpdateToolBuilder). */
function normalizeSpecialKey(raw: string): string {
    const text = String(raw ?? '').trim().toLowerCase();
    return text.replace(/[_\s]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

/** Ensure each source path has a corresponding file node in the graph so they are openable. */
function ensureSourcePathsAsGraphFileNodes(result: SearchAgentResult): void {
    const nodes = result.graph.nodes;
    const existingByPath = new Set(nodes.map((n) => n.path?.trim().toLowerCase()).filter(Boolean));
    const existingById = new Set(nodes.map((n) => n.id?.trim().toLowerCase()).filter(Boolean));
    for (const src of result.sources) {
        const path = src.path?.trim();
        if (!path) continue;
        const normPath = normalizeFilePath(path);
        const lowerPath = normPath.toLowerCase();
        const fileNodeId = `file:${normalizeSpecialKey(normPath)}`;
        if (existingByPath.has(lowerPath) || existingById.has(fileNodeId.toLowerCase())) continue;
        const basename = normPath.split('/').filter(Boolean).pop() ?? normPath;
        const title = basename.replace(/\.(md|markdown)$/i, '') || basename;
        result.graph.nodes.push({
            id: fileNodeId,
            type: 'file',
            title,
            path: normPath,
            attributes: {},
        });
        existingByPath.add(lowerPath);
        existingById.add(fileNodeId.toLowerCase());
    }
}

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

/**
 * Tool set for thought agent (coordinator).
 */
type ThoughtToolSet = {
    call_search_agent: AgentTool;
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


/** How to render the block content. Add new type in DashboardUpdateToolBuilder + DashboardBlocksSection. */
export type DashboardRenderEngine = 'MARKDOWN' | 'TILE' | 'ACTION_GROUP' | 'MERMAID';

export const RESULT_UPDATE_TOOL_NAMES = new Set(['update_sources', 'update_topics', 'update_graph', 'add_dashboard_blocks']);

/** Single item in a TILE or ACTION_GROUP block. */
export interface DashboardBlockItem {
    id: string;
    title: string;
    description?: string;
    icon?: string;
    color?: string;
}

/** Dynamic dashboard block; AI decides title, weight, and content by renderEngine. */
export interface DashboardBlock {
    id: string;
    title?: string;
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
    weight: number;
    suggestQuestions?: string[];
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

export interface InnerAgentContext {
    getMemoryManager: () => AgentMemoryManager;
    getVerifiedPaths: () => Set<string>;
    getResult: () => SearchAgentResult;
    searchHistory: (query: string, options?: { maxChars?: number }) => string;
}

export interface DashboardUpdateContext {
    /**
     * System prompt for this generation.
     */
    thisIterationSystemPrompt?: string;
    /**
     * User prompt for this generation.
     */
    thisIterationUserPrompt?: string;
    /**
     * Hint: include latest message text to help the update agent focus.
     */
    recentEvidenceHint?: string;
    /**
     * Hint: include current result snapshot to help the update agent focus.
     */
    currentResultSnapshot: string;
    /**
     * Minified snapshot for the summary prompt only (topics, sources, blocks, graph key nodes).
     * When set, summary template should prefer this over currentResultSnapshot to reduce noise.
     */
    currentResultSnapshotForSummary?: string;
    /**
     * Analysis mode
     */
    analysisMode: AnalysisMode;
    /**
     * Original query
     */
    originalQuery: string;
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

    /** Finish-phase agents */
    private summaryAgent: SummaryAgent;
    private mermaidOverviewAgent: MermaidOverviewAgent;
    private topicsUpdateAgent: TopicsUpdateAgent;
    private graphUpdateAgent: GraphUpdateAgent;
    private sourcesUpdateAgent: SourcesUpdateAgent;
    private dashboardBlocksUpdateAgent: DashboardBlocksUpdateAgent;

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

    /** Last thought-step context, so finish-phase (e.g. summary) can use its tool evidence when context is not passed. */
    private lastOneGenerationContext: OneGenerationContext | undefined;

    constructor(
        private readonly aiServiceManager: AIServiceManager,
        private options: AISearchAgentOptions,
    ) {
        this.maxIterations = this.options.maxMultiAgentIterations ?? DEFAULT_MAX_MULTI_AGENT_ITERATIONS;
        this.maxWallClockMs = this.options.maxWallClockMs ?? DEFAULT_MAX_WALL_CLOCK_MS;

        this.agentMemoryManager = new AgentMemoryManager(
            this.aiServiceManager,
            this.options
        );

        const outputControl = this.aiServiceManager.getSettings()?.defaultOutputControl;
        const thoughtTemperature = outputControl?.temperature ?? 0.6;
        const thoughtMaxTokens = outputControl?.maxOutputTokens ?? 4096;

        this.thoughtAgent = new Agent<ThoughtToolSet>({
            model: this.aiServiceManager.getMultiChat()
                .getProviderService(this.options.thoughtAgentProvider)
                .modelClient(this.options.thoughtAgentModel),
            tools: {
                call_search_agent: callAgentTool('search'),
                submit_final_answer: submitFinalAnswerTool(),
            },
            stopWhen: [
                stepCountIs(1),
                hasToolCall('submit_final_answer'),
            ],
            temperature: thoughtTemperature,
            maxOutputTokens: thoughtMaxTokens,
        });

        this.searchAgent = new RawSearchAgent(
            this.aiServiceManager,
            this.options,
            (paths) => paths.forEach(path => this.verifiedPaths.add(path))
        );
        this.manualToolCallHandlers['call_search_agent'] = {
            toolName: 'call_search_agent',
            triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT,
            handle: this.searchAgent.manualToolCallHandle.bind(this.searchAgent),
            outputGetter: (resultCollector) => resultCollector.searchResultChunks,
        };

        const innerAgentOption = {
            provider: this.options.thoughtAgentProvider,
            model: this.options.thoughtAgentModel,
            enableWebSearch: this.options.enableWebSearch,
            enableLocalSearch: this.options.enableLocalSearch,
            analysisMode: this.options.analysisMode ?? 'full',
        };

        const innerAgentContext: InnerAgentContext = {
            getVerifiedPaths: () => this.verifiedPaths,
            getMemoryManager: () => this.agentMemoryManager,
            getResult: () => this.agentResult ? this.agentResult : this.resetAgentResult(),
            searchHistory: (q: string, opts?: { maxChars?: number }) => this.agentMemoryManager.searchHistory(q, opts),
        };

        const innerAgentCreateParams = {
            aiServiceManager: this.aiServiceManager,
            options: innerAgentOption,
            context: innerAgentContext,
        };

        this.summaryAgent = new SummaryAgent(innerAgentCreateParams);
        this.mermaidOverviewAgent = new MermaidOverviewAgent(innerAgentCreateParams);
        this.topicsUpdateAgent = new TopicsUpdateAgent(innerAgentCreateParams);
        this.graphUpdateAgent = new GraphUpdateAgent(innerAgentCreateParams);
        this.sourcesUpdateAgent = new SourcesUpdateAgent(innerAgentCreateParams);
        this.dashboardBlocksUpdateAgent = new DashboardBlocksUpdateAgent(innerAgentCreateParams);
    }

    /**
     * Stream search results with ReAct loop (ThoughtAgent coordinates SearchAgent)
     */
    async stream(prompt: string): Promise<AsyncGenerator<LLMStreamEvent>> {
        this.resetAgentResult();
        return this.executeReActLoop(prompt);
    }

    /**
     * Search this session's chat history by query. Used by follow-up flows to look up analysis context.
     */
    searchHistory(query: string, options?: { maxChars?: number }): string {
        return this.agentMemoryManager.searchHistory(query, options);
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

        // first update the dashboard blocks.
        for await (const ev of this.runDashboardUpdate(true)) {
            yield ev;
        }

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

            // run thought agent
            const oneGenerationContext: OneGenerationContext = {
                thoughtTextChunks: [],
                reasoningTextChunks: [],
                toolCalls: [],
                toolResults: [],
                stepTokenUsage: emptyUsage(),
            };
            const getThoughtText = memoizeSupplier(() => oneGenerationContext.thoughtTextChunks.join('').trim());
            yield* this.runThoughtAgent(
                oneGenerationContext,
                () => { isSubmitResultCalled = true; },
                getThoughtText,
            );
            // Build thought message and update agent memory
            this.agentMemoryManager.buildIterationThoughtMessage(oneGenerationContext, getThoughtText());
            this.lastOneGenerationContext = oneGenerationContext;

            // After evidence gathering (thought agent and search agent), force one dashboard update pass to materialize evidence into UI.
            // This decouples result updating from ThoughtAgent and guarantees incremental UI updates per iteration.
            for await (const ev of this.runDashboardUpdate(false, oneGenerationContext)) {
                yield ev;
            }

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

    private async *runThoughtAgent(
        oneGenerationContext: OneGenerationContext,
        setSubmitResultCalled: (called: boolean) => void,
        getThoughtText: () => string,
    ): AsyncGenerator<LLMStreamEvent> {
        const stepId = generateUuidWithoutHyphens();
        yield {
            type: 'ui-step',
            uiType: UIStepType.STEPS_DISPLAY,
            stepId,
            title: 'Thinking about your request...',
            description: 'Thinking',
            triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT,
        };

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
        const systemPrompt = await this.aiServiceManager.renderPrompt(PromptId.ThoughtAgentSystem, { analysisMode, simpleMode });
        const thoughtStream = this.thoughtAgent.stream({
            system: systemPrompt,
            prompt: nextThoughtPrompt,
        });
        oneGenerationContext.systemPrompt = systemPrompt;
        oneGenerationContext.userPrompt = convertMessagesToText(currentPrompt ?? []);
        // Process thoughtAgent's stream in real-time
        for await (const chunk of thoughtStream.fullStream) {
            switch (chunk.type) {
                case 'text-start':
                    yield {
                        type: 'ui-step',
                        uiType: UIStepType.STEPS_DISPLAY,
                        stepId,
                        title: 'Thinking about your request... Thinking...',
                        description: 'Start to think about the request...',
                        triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT,
                    };
                    break;
                case 'text-delta':
                    oneGenerationContext.thoughtTextChunks.push(chunk.text);
                    yield { type: 'text-delta', text: chunk.text, triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT };
                    yield {
                        type: 'ui-step-delta',
                        uiType: UIStepType.STEPS_DISPLAY,
                        stepId,
                        descriptionDelta: chunk.text,
                        triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT,
                    };
                    break;
                case 'reasoning-start':
                    yield {
                        type: 'ui-step',
                        uiType: UIStepType.STEPS_DISPLAY,
                        stepId,
                        title: 'Thinking about your request... Reasoning...',
                        description: 'Start to reason about the request...',
                        triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT,
                    };
                    break;
                case 'reasoning-delta':
                    oneGenerationContext.reasoningTextChunks.push(chunk.text);
                    yield { type: 'reasoning-delta', text: chunk.text, triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT };
                    yield {
                        type: 'ui-step-delta',
                        uiType: UIStepType.STEPS_DISPLAY,
                        stepId,
                        descriptionDelta: chunk.text,
                        triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT,
                    };
                    break;
                case 'tool-call': {
                    const toolCallId = (chunk as { toolCallId?: string }).toolCallId ?? generateToolCallId();
                    oneGenerationContext.toolCalls.push({ toolCallId, toolName: chunk.toolName, input: chunk.input });
                    if (chunk.toolName === 'submit_final_answer') {
                        setSubmitResultCalled(true);
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
                        oneGenerationContext.stepTokenUsage = mergeTokenUsage(oneGenerationContext.stepTokenUsage, resultCollector.stepTokenUsage);
                        oneGenerationContext.toolResults.push({
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
                        };
                    }
                    break;
                }
                case 'tool-result':
                    // already handled by manual tool call handler.
                    if (this.manualToolCallHandlers[chunk.toolName]) {
                        break;
                    }

                    const toolCallId = (chunk as { toolCallId?: string }).toolCallId ?? generateToolCallId();
                    oneGenerationContext.toolResults.push({
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
                    oneGenerationContext.stepTokenUsage = mergeTokenUsage(oneGenerationContext.stepTokenUsage, chunk.totalUsage);
                    yield {
                        type: 'on-step-finish',
                        text: getThoughtText(),
                        finishReason: chunk.finishReason,
                        usage: chunk.totalUsage,
                        triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT
                    };
                    break;
                case 'tool-error': {
                    const errMsg = getToolErrorMessage(chunk);
                    const toolName = (chunk as any).toolName ?? 'unknown';

                    // All errors must be yield as error.
                    yield buildToolErrorStreamEvent(toolName, errMsg, chunk, StreamTriggerName.SEARCH_THOUGHT_AGENT);

                    // try to inject corrective reminder into agent memory for next iteration
                    this.agentMemoryManager.pushMessage(
                        buildToolCorrectionMessage(toolName, errMsg)
                    );
                    break;
                }
                case 'start':
                case 'start-step':
                case 'reasoning-end':
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
    }

    private async *runDashboardUpdate(isInitialCall: boolean, oneGenerationContext?: OneGenerationContext): AsyncGenerator<LLMStreamEvent> {
        const stepId = generateUuidWithoutHyphens();
        let oldAgentResultLenInfo = this.getAgentResultLenInfo(this.agentResult);
        try {
            yield {
                type: 'ui-step',
                uiType: UIStepType.STEPS_DISPLAY,
                stepId,
                title: 'Trying to update dashboard',
                description: 'Starting to update dashboard',
                triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT,
            };

            yield {
                type: 'ui-step',
                uiType: UIStepType.STEPS_DISPLAY,
                stepId,
                title: 'Dashboard Updateing: Updating topics...',
                description: 'Updating topics',
                triggerName: StreamTriggerName.SEARCH_TOPICS_AGENT,
            };
            let dashboardUpdateContext = this.buildDashboardUpdateContext(oneGenerationContext);
            console.debug('[runDashboardUpdate] before update topics, dashboardUpdateContext: ', JSON.stringify(dashboardUpdateContext));
            for await (const ev of this.topicsUpdateAgent.stream(dashboardUpdateContext)) {
                if (ev.type === 'on-step-finish') {
                    this.agentMemoryManager.accumulateTokenUsage(ev.usage);
                }
                if (DELTA_EVENT_TYPES.has(ev.type)) {
                    yield {
                        type: 'ui-step-delta',
                        uiType: UIStepType.STEPS_DISPLAY,
                        stepId,
                        descriptionDelta: getDeltaEventDeltaText(ev),
                        triggerName: StreamTriggerName.SEARCH_TOPICS_AGENT,
                    };
                }

                yield ev;
            }

            if (isInitialCall) {
                // initial call only update topics to give a quick overview of the analysis.
                return;
            }

            yield {
                type: 'ui-step',
                uiType: UIStepType.STEPS_DISPLAY,
                stepId,
                title: 'Dashboard Updateing: Updating sources...',
                description: 'Updating sources',
                triggerName: StreamTriggerName.SEARCH_SOURCES_AGENT,
            };
            // context may change after other agents run. so we need to rebuild the context.
            dashboardUpdateContext = this.buildDashboardUpdateContext(oneGenerationContext);
            console.debug('[runDashboardUpdate] before update sources, dashboardUpdateContext: ', JSON.stringify(dashboardUpdateContext));
            // all other calls update sources
            for await (const ev of this.sourcesUpdateAgent.stream(dashboardUpdateContext)) {
                if (ev.type === 'on-step-finish') {
                    this.agentMemoryManager.accumulateTokenUsage(ev.usage);
                }
                if (DELTA_EVENT_TYPES.has(ev.type)) {
                    yield {
                        type: 'ui-step-delta',
                        uiType: UIStepType.STEPS_DISPLAY,
                        stepId,
                        descriptionDelta: getDeltaEventDeltaText(ev),
                        triggerName: StreamTriggerName.SEARCH_SOURCES_AGENT,
                    };
                }
                yield ev;
            }

            if (this.options.analysisMode && this.options.analysisMode === 'simple') {
                return;
            }

            yield {
                type: 'ui-step',
                uiType: UIStepType.STEPS_DISPLAY,
                stepId,
                title: 'Dashboard Updateing: Updating graph...',
                description: 'Updating graph',
                triggerName: StreamTriggerName.SEARCH_GRAPH_AGENT,
            };
            yield {
                type: 'ui-signal',
                id: `sig-${Date.now()}`,
                channel: 'graph',
                kind: 'stage',
                entityId: stepId,
                payload: { stage: 'start', overlayText: 'Updating graph…', effect: { type: 'scan', intensity: 1 } },
            };
            ensureSourcePathsAsGraphFileNodes(this.agentResult);
            dashboardUpdateContext = this.buildDashboardUpdateContext(oneGenerationContext);
            console.debug('[runDashboardUpdate] before update graph, dashboardUpdateContext: ', JSON.stringify(dashboardUpdateContext));
            for await (const ev of this.graphUpdateAgent.stream(dashboardUpdateContext, { stepId })) {
                if (ev.type === 'on-step-finish') {
                    this.agentMemoryManager.accumulateTokenUsage(ev.usage);
                }
                if (DELTA_EVENT_TYPES.has(ev.type)) {
                    yield {
                        type: 'ui-step-delta',
                        uiType: UIStepType.STEPS_DISPLAY,
                        stepId,
                        descriptionDelta: getDeltaEventDeltaText(ev),
                        triggerName: StreamTriggerName.SEARCH_GRAPH_AGENT,
                    };
                }
                yield ev;
            }
            yield {
                type: 'ui-signal',
                id: `sig-${Date.now()}`,
                channel: 'graph',
                kind: 'stage',
                entityId: stepId,
                payload: { stage: 'finish' },
            };
            yield {
                type: 'ui-step',
                uiType: UIStepType.STEPS_DISPLAY,
                stepId,
                title: 'Dashboard Updateing: Updating dashboard blocks...',
                description: 'Updating dashboard blocks',
                triggerName: StreamTriggerName.SEARCH_DASHBOARD_AGENT,
            };
            dashboardUpdateContext = this.buildDashboardUpdateContext(oneGenerationContext);
            console.debug('[runDashboardUpdate] before update dashboard blocks, dashboardUpdateContext: ', JSON.stringify(dashboardUpdateContext));
            for await (const ev of this.dashboardBlocksUpdateAgent.stream(dashboardUpdateContext)) {
                if (ev.type === 'on-step-finish') {
                    this.agentMemoryManager.accumulateTokenUsage(ev.usage);
                }
                if (DELTA_EVENT_TYPES.has(ev.type)) {
                    yield {
                        type: 'ui-step-delta',
                        uiType: UIStepType.STEPS_DISPLAY,
                        stepId,
                        descriptionDelta: getDeltaEventDeltaText(ev),
                        triggerName: StreamTriggerName.SEARCH_DASHBOARD_AGENT,
                    };
                }
                yield ev;
            }
        } catch (e) {
            yield {
                type: 'pk-debug',
                debugName: 'dashboard-update-agent-error',
                triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT,
                extra: { error: String(e) },
            };
        } finally {
            let newAgentResultLenInfo = this.getAgentResultLenInfo(this.agentResult);
            let changeDesc = this.agentResultChangeDesc(oldAgentResultLenInfo, newAgentResultLenInfo);
            yield {
                type: 'ui-step',
                uiType: UIStepType.STEPS_DISPLAY,
                stepId,
                title: 'Dashboard Updated. ' + changeDesc,
                triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT,
            };
        }
    }

    private async *finishReActLoop(reActStartTimeMs: number): AsyncGenerator<LLMStreamEvent> {
        const summaryStepId = generateUuidWithoutHyphens();
        yield {
            type: 'ui-step',
            uiType: UIStepType.STEPS_DISPLAY,
            stepId: summaryStepId,
            title: 'Summarizing the analysis...',
            triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT,
        };
        for await (const chunk of this.streamTitle()) {
            if (DELTA_EVENT_TYPES.has(chunk.type)) {
                yield {
                    type: 'ui-step-delta',
                    uiType: UIStepType.STEPS_DISPLAY,
                    stepId: summaryStepId,
                    descriptionDelta: getDeltaEventDeltaText(chunk),
                    triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT,
                };
            }
            yield chunk;
        }

        yield {
            type: 'ui-step',
            uiType: UIStepType.STEPS_DISPLAY,
            stepId: summaryStepId,
            title: 'Summarizing the analysis...',
            triggerName: StreamTriggerName.SEARCH_SUMMARY,
        };
        let dashboardUpdateContext = this.buildDashboardUpdateContext();
        for await (const chunk of this.summaryAgent.stream(dashboardUpdateContext)) {
            if (chunk.type === 'prompt-stream-result') {
                this.agentMemoryManager.accumulateTokenUsage(chunk.usage);
            }
            if (DELTA_EVENT_TYPES.has(chunk.type)) {
                yield {
                    type: 'ui-step-delta',
                    uiType: UIStepType.STEPS_DISPLAY,
                    stepId: summaryStepId,
                    descriptionDelta: getDeltaEventDeltaText(chunk),
                    triggerName: StreamTriggerName.SEARCH_SUMMARY,
                };
            }
            yield chunk;
        }
        for await (const chunk of this.mermaidOverviewAgent.stream(dashboardUpdateContext)) {
            if (chunk.type === 'on-step-finish') {
                this.agentMemoryManager.accumulateTokenUsage(chunk.usage);
            }
            if (DELTA_EVENT_TYPES.has(chunk.type)) {
                yield {
                    type: 'ui-step-delta',
                    uiType: UIStepType.STEPS_DISPLAY,
                    stepId: summaryStepId,
                    descriptionDelta: getDeltaEventDeltaText(chunk),
                    triggerName: StreamTriggerName.SEARCH_SUMMARY,
                };
            }
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
     * Generate and set agentResult.title (used for save filename, recent list, folder suggestion).
     */
    private async *streamTitle(): AsyncGenerator<LLMStreamEvent> {
        const variables = {
            query: this.agentMemoryManager.getInitialPrompt() ?? '',
            summary: (this.agentResult.summary ?? '').trim() || undefined,
        };
        const stream = this.aiServiceManager.chatWithPromptStream(
            PromptId.AiAnalysisTitle,
            variables,
        );
        for await (const chunk of stream) {
            if (chunk.type === 'prompt-stream-result') {
                this.agentResult.title = String(chunk.output ?? '').trim() || undefined;
                this.agentMemoryManager.accumulateTokenUsage(chunk.usage);
            }
            yield { ...chunk, triggerName: StreamTriggerName.SEARCH_TITLE };
        }
    }

    /** Max characters for evidence hint so prompt does not explode. */
    private static readonly EVIDENCE_HINT_MAX_CHARS = 6000;

    /**
     * Build evidence hint from latest message text plus tool outputs (e.g. call_search_agent summary and key paths).
     * Uses last iteration context when none passed (e.g. finish-phase summary).
     */
    private buildEvidenceHintFromContext(oneGenerationContext?: OneGenerationContext): string {
        const ctx = oneGenerationContext ?? this.lastOneGenerationContext;
        const parts: string[] = [];
        const base = this.agentMemoryManager.getLatestMessageText();
        if (base.trim()) {
            parts.push('[Latest reasoning]\n' + base.trim());
        }
        if (ctx?.toolResults?.length) {
            const searchSummaries: string[] = [];
            for (const tr of ctx.toolResults) {
                if (tr.toolName !== 'call_search_agent') continue;
                const out = tr.output;
                if (!out || typeof (out as any).value !== 'string') continue;
                try {
                    const parsed = JSON.parse((out as { type: string; value: string }).value) as Record<string, unknown>;
                    const chunks = parsed?.searchResultChunks as { summary?: string; text?: string } | undefined;
                    if (chunks?.summary?.trim()) searchSummaries.push(chunks.summary.trim());
                    else if (chunks?.text?.trim()) searchSummaries.push(chunks.text.trim().slice(0, 1500));
                } catch {
                    // ignore parse errors
                }
            }
            if (searchSummaries.length > 0) {
                parts.push('[Search round summaries]\n' + searchSummaries.join('\n---\n'));
            }
        }
        const keyPaths = Array.from(this.verifiedPaths).slice(0, 25);
        if (keyPaths.length > 0) {
            parts.push('[Key paths from evidence]\n' + keyPaths.join('\n'));
        }
        const combined = parts.join('\n\n');
        return combined.length > AISearchAgent.EVIDENCE_HINT_MAX_CHARS
            ? combined.slice(0, AISearchAgent.EVIDENCE_HINT_MAX_CHARS) + '\n...[truncated]'
            : combined;
    }

    /**
     * WARNING: context may change after other agents run
     */
    private buildDashboardUpdateContext(oneGenerationContext?: OneGenerationContext): DashboardUpdateContext {
        return {
            originalQuery: this.agentMemoryManager.getInitialPrompt(),
            analysisMode: this.options.analysisMode ?? 'full',
            thisIterationSystemPrompt: oneGenerationContext?.systemPrompt ?? undefined,
            thisIterationUserPrompt: oneGenerationContext?.userPrompt ?? undefined,
            recentEvidenceHint: this.buildEvidenceHintFromContext(oneGenerationContext),
            currentResultSnapshot: JSON.stringify(this.agentResult),
            currentResultSnapshotForSummary: buildMinifiedResultSnapshot(this.agentResult),
        };
    }

    private getAgentResultLenInfo(agentResult: SearchAgentResult): AgentResultLenInfo {
        return {
            graphNodes: agentResult.graph.nodes.length,
            graphEdges: agentResult.graph.edges.length,
            topics: agentResult.topics.length,
            sources: agentResult.sources.length,
            dashboardBlocks: agentResult.dashboardBlocks?.length ?? 0,
        };
    }
    /** Only non-zero diff/counts are included so "graphNodes: 0" etc. are not shown. */
    private agentResultChangeDesc(oldAgentResult: AgentResultLenInfo, newAgentResult: AgentResultLenInfo): string {
        const diff = {
            graphNodes: newAgentResult.graphNodes - oldAgentResult.graphNodes,
            graphEdges: newAgentResult.graphEdges - oldAgentResult.graphEdges,
            topics: newAgentResult.topics - oldAgentResult.topics,
            sources: newAgentResult.sources - oldAgentResult.sources,
            dashboardBlocks: newAgentResult.dashboardBlocks - oldAgentResult.dashboardBlocks,
        };
        const parts = Object.entries(diff)
            .filter(([, value]) => value !== 0)
            .map(([key, value]) => `${key}: ${value > 0 ? '+' : ''}${value}`);
        if (parts.length > 0) return parts.join(', ');
        return Object.entries(newAgentResult)
            .filter(([, value]) => value !== 0)
            .map(([key, value]) => `${key}: ${value}`)
            .join(', ') || '';
    }
}

interface AgentResultLenInfo {
    graphNodes: number;
    graphEdges: number;
    topics: number;
    sources: number;
    dashboardBlocks: number;
}
