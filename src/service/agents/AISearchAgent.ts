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
import { DashboardUpdateAgent, DashboardUpdatePlan } from './search-agent-helper/DashboardUpdateAgent';
import { FinalRefineAgent } from './search-agent-helper/FinalRefineAgent';
import { FollowUpQuestionAgent } from './search-agent-helper/FollowUpQuestionAgent';
import { DocSimpleAgent } from './search-agent-helper/DocSimpleAgent';
import { buildMinifiedResultSnapshot } from './search-agent-helper/helpers/resultSnapshot';
import { addConceptLinksBySimilarity } from './search-agent-helper/helpers/conceptLinkBySimilarity';
import { AppContext } from '@/app/context/AppContext';
import { memoizeSupplier } from '@/core/utils/functions';
import { emptyUsage } from '@/core/providers/types';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import { DELTA_EVENT_TYPES, getDeltaEventDeltaText } from '@/core/providers/helpers/stream-helper';

/** Max characters for evidence hint so prompt does not explode. */
const EVIDENCE_HINT_MAX_CHARS = 6000;

/** docSimple = current note only; vaultSimple = vault search then summarize; vaultFull = deep vault analysis. */
export type AnalysisMode = 'docSimple' | 'vaultSimple' | 'vaultFull';

export interface AISearchAgentOptions {
    enableWebSearch?: boolean;
    enableLocalSearch?: boolean;
    /** Required. docSimple | vaultSimple | vaultFull. Doc scope for docSimple uses stream(opts.scopeValue). */
    analysisMode: AnalysisMode;
    /**
     * Maximum iterations for multi-agent ReAct loop.
     */
    maxMultiAgentIterations?: number;
    /**
     * Maximum wall clock time in milliseconds for the entire search.
     */
    maxWallClockMs?: number;
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
    /** Follow-up questions suggested by a dedicated agent from full search history/session; not from topics. */
    suggestedFollowUpQuestions?: string[];
}

export interface InnerAgentContext {
    getMemoryManager: () => AgentMemoryManager;
    getVerifiedPaths: () => Set<string>;
    getResult: () => SearchAgentResult;
    searchHistory: (query: string, options?: { maxChars?: number }) => string;
}

export interface AISearchUpdateContext {
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
    /** Plan from DashboardUpdateAgent.getPlan(); execution agents follow topicsPlan, sourcesPlan, graphPlan, blockPlan. */
    plan?: DashboardUpdatePlan;
}

/**
 * Search Agent.
 * ReAct architecture.
 * Multi agent architecture. (SubAgents)
 */
export class AISearchAgent {
    /** DocSimple: single-file Q&A agent. Created only when analysisMode === 'docSimple'. */
    private docSimpleAgent: DocSimpleAgent;

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
    private finalRefineAgent: FinalRefineAgent;
    private followUpQuestionAgent: FollowUpQuestionAgent;

    /** Dashboard update orchestrator: topics, sources, graph, blocks, review */
    private dashboardUpdateAgent: DashboardUpdateAgent;

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
    /** Paths already emitted as incremental source + graph node during this run (streaming write). */
    private emittedSourcePaths: Set<string> = new Set();

    /** Last thought-step context, so finish-phase (e.g. summary) can use its tool evidence when context is not passed. */
    private lastOneGenerationContext: OneGenerationContext | undefined;

    constructor(
        private readonly aiServiceManager: AIServiceManager,
        private options: AISearchAgentOptions,
    ) {
        this.maxIterations = this.options.maxMultiAgentIterations ?? DEFAULT_MAX_MULTI_AGENT_ITERATIONS;
        this.maxWallClockMs = this.options.maxWallClockMs ?? DEFAULT_MAX_WALL_CLOCK_MS;

        this.docSimpleAgent = new DocSimpleAgent(this.aiServiceManager);

        this.agentMemoryManager = new AgentMemoryManager(this.aiServiceManager);

        const { provider: thoughtProvider, modelId: thoughtModel } = this.aiServiceManager.getModelForPrompt(PromptId.ThoughtAgent);
        const outputControl = this.aiServiceManager.getSettings()?.defaultOutputControl;
        const thoughtTemperature = outputControl?.temperature ?? 0.6;
        const thoughtMaxTokens = outputControl?.maxOutputTokens ?? 4096;

        this.thoughtAgent = new Agent<ThoughtToolSet>({
            model: this.aiServiceManager.getMultiChat()
                .getProviderService(thoughtProvider)
                .modelClient(thoughtModel),
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
            { enableWebSearch: this.options.enableWebSearch, enableLocalSearch: this.options.enableLocalSearch },
            (paths) => paths.forEach(path => this.verifiedPaths.add(path))
        );
        this.manualToolCallHandlers['call_search_agent'] = {
            toolName: 'call_search_agent',
            triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT,
            handle: this.searchAgent.manualToolCallHandle.bind(this.searchAgent),
            outputGetter: (resultCollector) => resultCollector.searchResultChunks,
        };

        const innerAgentOption = {
            enableWebSearch: this.options.enableWebSearch,
            enableLocalSearch: this.options.enableLocalSearch,
            analysisMode: this.options.analysisMode,
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
        this.finalRefineAgent = new FinalRefineAgent(innerAgentCreateParams);
        this.dashboardUpdateAgent = new DashboardUpdateAgent({
            ...innerAgentCreateParams,
            onTokenUsage: (u) => this.agentMemoryManager.accumulateTokenUsage(u),
        });
        this.followUpQuestionAgent = new FollowUpQuestionAgent({
            aiServiceManager: this.aiServiceManager,
            onTokenUsage: (u) => this.agentMemoryManager.accumulateTokenUsage(u),
        });
    }

    /**
     * Stream search results with ReAct loop (ThoughtAgent coordinates SearchAgent)
     * @param opts.scopeValue Used by DocSimpleAgent (current file path)
     */
    async stream(prompt: string, opts?: { scopeValue?: string }): Promise<AsyncGenerator<LLMStreamEvent>> {
        if (this.options.analysisMode === 'docSimple') {
            return this.docSimpleAgent!.stream(prompt, { scopeValue: opts?.scopeValue });
        }
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
            suggestedFollowUpQuestions: [],
        };
        this.verifiedPaths.clear();
        this.emittedSourcePaths.clear();
        this.dashboardUpdateAgent.resetSessionState();
        return this.agentResult;
    }

    /**
     * Execute the ReAct loop (ThoughtAgent coordinates SearchAgent)
     * Implements controlled state machine with early stop and time budget.
     */
    private async *executeReActLoop(initialPrompt: string): AsyncGenerator<LLMStreamEvent> {
        // Initialize agent memory for this session
        this.agentMemoryManager.resetAgentMemory(initialPrompt);

        // first update the dashboard blocks
        for await (const ev of this.runDashboardUpdate(true)) {
            yield ev;
        }

        // iteration control
        const maxIterations = this.maxIterations;
        let iterationCount = 0;
        let reActStartTimeMs = Date.now();
        let isSubmitResultCalled = false;
        let noProgressIterations = 0;
        let previousSourcesCount = 0;
        let previousNodesCount = 0;
        let previousEdgesCount = 0;

        while (iterationCount < maxIterations) {
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

            // run thought agent (wrapped in try-catch so one iteration error does not terminate entire AI Analysis)
            const oneGenerationContext: OneGenerationContext = {
                thoughtTextChunks: [],
                reasoningTextChunks: [],
                toolCalls: [],
                toolResults: [],
                stepTokenUsage: emptyUsage(),
            };
            const getThoughtText = memoizeSupplier(
                () => (oneGenerationContext.thoughtTextChunks ?? []).join('').trim(),
            );
            try {
                yield* this.runThoughtAgent(
                    oneGenerationContext,
                    () => { isSubmitResultCalled = true; },
                    getThoughtText,
                );
                // Build thought message and update agent memory
                const thoughtText = getThoughtText();
                this.agentMemoryManager.buildIterationThoughtMessage(
                    oneGenerationContext,
                    thoughtText ?? '',
                );
                this.lastOneGenerationContext = oneGenerationContext;

                for await (const ev of this.runDashboardUpdate(false, oneGenerationContext)) {
                    yield ev;
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                console.error('[AISearchAgent] Thought agent iteration error (continuing next iteration):', err);
                yield {
                    type: 'pk-debug',
                    debugName: 'thought-agent-iteration-error',
                    triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT,
                    extra: {
                        reason: `[AISearchAgent] Thought agent error: ${message}. Continuing next iteration.`,
                        error: message,
                    },
                };
                continue;
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
        const analysisMode = this.options.analysisMode;
        const systemPrompt = await this.aiServiceManager.renderPrompt(PromptId.ThoughtAgent, {
            analysisMode,
            simpleMode: this.options.analysisMode === 'vaultSimple'
        });
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

        // Deterministic streaming write: new verified paths -> placeholder source + single-node graph patch.
        for await (const ev of this.dashboardUpdateAgent.emitStreamingSourcesAndGraphFromVerifiedPaths(
            this.emittedSourcePaths,
        )) {
            yield ev;
        }
    }

    private async *runDashboardUpdate(isInitialCall: boolean, oneGenerationContext?: OneGenerationContext): AsyncGenerator<LLMStreamEvent> {
        if (this.options.analysisMode !== 'vaultFull')
            return;

        const updateContext = this.buildDashboardUpdateContext(oneGenerationContext);

        const oldAgentResultLenInfo = this.getAgentResultLenInfo(this.agentResult);
        yield* this.dashboardUpdateAgent.runDashboardUpdate({
            updateContext,
            isInitialCall,
            buildChangeDesc: () => this.agentResultChangeDesc(oldAgentResultLenInfo, this.getAgentResultLenInfo(this.agentResult)),
        });

        if (!isInitialCall) {
            const reviewStepId = generateUuidWithoutHyphens();
            yield* this.dashboardUpdateAgent.streamReview(updateContext, { stepId: reviewStepId });
        }
    }

    private async *finishReActLoop(reActStartTimeMs: number): AsyncGenerator<LLMStreamEvent> {
        if (this.options.analysisMode === 'vaultFull') {
            yield* this.streamFullAnalysis();
        } else {
            const summaryStepId = generateUuidWithoutHyphens();
            yield* this.streamFinalRefine(summaryStepId, 'Refining results…', 'full');
            let dashboardUpdateContext = this.buildDashboardUpdateContext();
            yield* this.streamTitleAndSummary(summaryStepId, dashboardUpdateContext);
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
     * Stream title then summary for the analysis, emitting ui-step and ui-step-delta as needed.
     */
    private async *streamTitleAndSummary(
        stepId: string,
        dashboardContext: AISearchUpdateContext
    ): AsyncGenerator<LLMStreamEvent> {
        yield {
            type: 'ui-step',
            uiType: UIStepType.STEPS_DISPLAY,
            stepId,
            title: 'Summarizing the analysis...',
            triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT,
        };
        for await (const chunk of this.streamTitle()) {
            if (DELTA_EVENT_TYPES.has(chunk.type)) {
                yield {
                    type: 'ui-step-delta',
                    uiType: UIStepType.STEPS_DISPLAY,
                    stepId,
                    descriptionDelta: getDeltaEventDeltaText(chunk),
                    triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT,
                };
            }
            yield chunk;
        }
        yield {
            type: 'ui-step',
            uiType: UIStepType.STEPS_DISPLAY,
            stepId,
            title: 'Summarizing the analysis...',
            triggerName: StreamTriggerName.SEARCH_SUMMARY,
        };
        for await (const chunk of this.summaryAgent.stream(dashboardContext)) {
            if (chunk.type === 'prompt-stream-result') {
                this.agentMemoryManager.accumulateTokenUsage(chunk.usage);
            }
            if (DELTA_EVENT_TYPES.has(chunk.type)) {
                yield {
                    type: 'ui-step-delta',
                    uiType: UIStepType.STEPS_DISPLAY,
                    stepId,
                    descriptionDelta: getDeltaEventDeltaText(chunk),
                    triggerName: StreamTriggerName.SEARCH_SUMMARY,
                };
            }
            yield chunk;
        }
    }

    /** Number of refine rounds: each round runs sources (by batch) then graph refine (full). */
    private static readonly REFINE_ROUNDS = 2;
    /** Sources refine batch size; graph is always full. */
    private static readonly REFINE_SOURCES_BATCH_SIZE = 12;

    /**
     * Single refine step: sources only (optionally one batch), graph only, or full. Emits ui-step + ui-step-delta.
     */
    private async *streamFinalRefine(
        summaryStepId: string,
        stepTitle: string,
        refineMode: 'sources_only' | 'graph_only' | 'full',
        opts?: { sourcesBatch?: { index: number; start: number; end: number; total: number } }
    ): AsyncGenerator<LLMStreamEvent> {
        try {
            yield {
                type: 'ui-step',
                uiType: UIStepType.STEPS_DISPLAY,
                stepId: summaryStepId,
                title: stepTitle,
                description: refineMode === 'sources_only' ? 'Refining sources…' : refineMode === 'graph_only' ? 'Refining graph…' : 'Refining results…',
                triggerName: StreamTriggerName.SEARCH_DASHBOARD_UPDATE_AGENT,
            };
            const refineContext = this.buildDashboardUpdateContext();
            for await (const ev of this.finalRefineAgent.stream(refineContext, {
                stepId: summaryStepId,
                refineMode,
                sourcesBatch: opts?.sourcesBatch,
            })) {
                if (ev.type === 'on-step-finish') {
                    this.agentMemoryManager.accumulateTokenUsage(ev.usage);
                }
                if (DELTA_EVENT_TYPES.has(ev.type)) {
                    yield {
                        type: 'ui-step-delta',
                        uiType: UIStepType.STEPS_DISPLAY,
                        stepId: summaryStepId,
                        descriptionDelta: getDeltaEventDeltaText(ev),
                        triggerName: StreamTriggerName.SEARCH_DASHBOARD_UPDATE_AGENT,
                    };
                }
                yield ev;
            }
        } catch (e) {
            console.warn('[AISearchAgent] Final refine failed; keeping incremental result.', e);
        }
    }

    private async *streamFullAnalysis(): AsyncGenerator<LLMStreamEvent> {
        const summaryStepId = generateUuidWithoutHyphens();

        // Final review pass before summary (vaultFull only): dedupe/merge blocks, cap 6–8
        const reviewContext = this.buildDashboardUpdateContext();
        for await (const ev of this.dashboardUpdateAgent.streamReview(reviewContext, { stepId: summaryStepId })) {
            yield ev;
        }

        // Multiple refine rounds: sources by batch (each batch one LLM call), then graph full
        const rounds = AISearchAgent.REFINE_ROUNDS;
        const batchSize = AISearchAgent.REFINE_SOURCES_BATCH_SIZE;
        for (let r = 1; r <= rounds; r++) {
            const roundLabel = rounds > 1 ? ` (${r}/${rounds})` : '';
            const totalSources = this.agentResult!.sources.length;
            if (totalSources > 0) {
                const numBatches = Math.ceil(totalSources / batchSize);
                for (let b = 0; b < numBatches; b++) {
                    const start = b * batchSize;
                    const end = Math.min(start + batchSize, totalSources);
                    const batchLabel = numBatches > 1 ? ` batch ${b + 1}/${numBatches}` : '';
                    yield* this.streamFinalRefine(
                        summaryStepId,
                        `Refining sources${roundLabel}${batchLabel}…`,
                        'sources_only',
                        { sourcesBatch: { index: b, start, end, total: numBatches } }
                    );
                }
            }
            yield* this.streamFinalRefine(
                summaryStepId,
                `Refining graph${roundLabel}…`,
                'graph_only'
            );
        }

        let dashboardUpdateContext = this.buildDashboardUpdateContext();
        yield* this.streamTitleAndSummary(summaryStepId, dashboardUpdateContext);

        // Overview diagram: vaultFull only. Retry (empty/invalid mermaid) is handled inside MermaidOverviewAgent.
        for await (const chunk of this.mermaidOverviewAgent.stream(dashboardUpdateContext)) {
            if (DELTA_EVENT_TYPES.has(chunk.type)) {
                yield {
                    type: 'ui-step-delta',
                    uiType: UIStepType.STEPS_DISPLAY,
                    stepId: summaryStepId,
                    descriptionDelta: getDeltaEventDeltaText(chunk),
                    triggerName: StreamTriggerName.SEARCH_OVERVIEW_MERMAID,
                };
            }
            yield chunk;
        }

        // Dedicated step: suggest follow-up questions from full session context (vaultFull only).
        try {
            yield {
                type: 'ui-step',
                uiType: UIStepType.STEPS_DISPLAY,
                stepId: summaryStepId,
                title: 'Suggesting follow-up questions...',
                triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT,
            };
            const mem = this.agentMemoryManager.getAgentMemory();
            const evidenceHint = this.buildEvidenceHintFromContext();
            const sessionContext = [
                `[User query]\n${(mem.initialPrompt ?? '').trim()}`,
                mem.sessionSummary?.trim() ? `[Session summary]\n${mem.sessionSummary.trim()}` : '',
                evidenceHint ? `[Evidence / reasoning]\n${evidenceHint}` : '',
            ]
                .filter(Boolean)
                .join('\n\n');
            const capped = sessionContext.length > 12_000 ? sessionContext.slice(0, 12_000) + '\n...[truncated]' : sessionContext;
            for await (const ev of this.followUpQuestionAgent.stream(
                { sessionContext: capped },
                {
                    setQuestions: (q) => { this.agentResult.suggestedFollowUpQuestions = q; },
                    stepId: summaryStepId,
                    triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT,
                }
            )) {
                if (ev.type === 'on-step-finish') {
                    this.agentMemoryManager.accumulateTokenUsage(ev.usage);
                }
                if (DELTA_EVENT_TYPES.has(ev.type)) {
                    yield {
                        type: 'ui-step-delta',
                        uiType: UIStepType.STEPS_DISPLAY,
                        stepId: summaryStepId,
                        descriptionDelta: getDeltaEventDeltaText(ev),
                        triggerName: StreamTriggerName.SEARCH_SUMMARY,
                    };
                }
                yield ev;
            }
        } catch (e) {
            console.warn('[AISearchAgent] Suggest follow-up questions failed; leaving empty.', e);
            this.agentResult.suggestedFollowUpQuestions = [];
        }
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
        return combined.length > EVIDENCE_HINT_MAX_CHARS
            ? combined.slice(0, EVIDENCE_HINT_MAX_CHARS) + '\n...[truncated]'
            : combined;
    }

    /**
     * WARNING: context may change after other agents run
     */
    private buildDashboardUpdateContext(oneGenerationContext?: OneGenerationContext): AISearchUpdateContext {
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
