import { streamObject } from 'ai';
import { z } from 'zod/v3';
import { LLMStreamEvent, LLMUsage, StreamTriggerName, UIStepType } from '@/core/providers/types';
import { DELTA_EVENT_TYPES, getDeltaEventDeltaText } from '@/core/providers/helpers/stream-helper';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { PromptId } from '@/service/prompt/PromptId';
import { AISearchUpdateContext, InnerAgentContext, SearchAgentResult, type AnalysisMode } from '../AISearchAgent';
import { TopicsUpdateAgent } from './TopicsUpdateAgent';
import { GraphUpdateAgent } from './GraphUpdateAgent';
import { SourcesUpdateAgent } from './SourcesUpdateAgent';
import { DashboardBlocksUpdateAgent } from './DashboardBlocksUpdateAgent';
import { ReviewBlocksAgent } from './ReviewBlocksAgent';
import { getFileNameFromPath, normalizeFilePath } from '@/core/utils/file-utils';
import { GraphPatch } from '@/core/providers/ui-events/graph';
import type { AISearchEdge, AISearchGraph, AISearchNode } from '../AISearchAgent';
import { addConceptLinksBySimilarity } from './helpers/conceptLinkBySimilarity';
import { AppContext } from '@/app/context/AppContext';

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

const dashboardUpdatePlanSchema = z.object({
    topicsPlan: z.array(z.string()).optional().describe('Instructions for topics agent'),
    sourcesPlan: z.array(z.string()).optional().describe('Instructions for sources agent'),
    graphPlan: z.array(z.string()).optional().describe('Instructions for graph agent'),
    blockPlan: z.array(z.string()).optional().describe('Instructions for blocks agent'),
    note: z.string().optional(),
});

export type DashboardUpdatePlan = z.infer<typeof dashboardUpdatePlanSchema>;

export type DashboardUpdateOptions = {
    aiServiceManager: AIServiceManager;
    options: { enableWebSearch?: boolean; enableLocalSearch?: boolean; analysisMode: AnalysisMode };
    context: InnerAgentContext;
};

const STREAMING_SOURCE_TOP_K = 20;

/**
 * Central orchestrator for dashboard update flow: topics, sources, graph, blocks, review.
 * Consolidates logic so AISearchAgent only needs this single entry point.
 */
export class DashboardUpdateAgent {
    private readonly topicsAgent: TopicsUpdateAgent;
    private readonly graphAgent: GraphUpdateAgent;
    private readonly sourcesAgent: SourcesUpdateAgent;
    private readonly blocksAgent: DashboardBlocksUpdateAgent;
    private readonly reviewAgent: ReviewBlocksAgent;
    private readonly context: InnerAgentContext;
    private readonly aiServiceManager: AIServiceManager;
    private readonly options: DashboardUpdateOptions['options'];
    private readonly onTokenUsage?: (usage: LLMUsage) => void;

    /** Per-session flags: force at least one output of topics/sources/graph before planner can skip. */
    private hasOutputTopicsOnce = false;
    private hasOutputSourcesOnce = false;
    private hasOutputGraphOnce = false;

    constructor(params: DashboardUpdateOptions & { onTokenUsage?: (usage: LLMUsage) => void }) {
        const { aiServiceManager, options, context, onTokenUsage } = params;
        this.context = context;
        this.aiServiceManager = aiServiceManager;
        this.options = options;
        const createParams = { aiServiceManager, options, context };
        this.topicsAgent = new TopicsUpdateAgent(createParams);
        this.graphAgent = new GraphUpdateAgent(createParams);
        this.sourcesAgent = new SourcesUpdateAgent(createParams);
        this.blocksAgent = new DashboardBlocksUpdateAgent(createParams);
        this.reviewAgent = new ReviewBlocksAgent(createParams);
        this.onTokenUsage = onTokenUsage;
    }

    /** Reset session flags. Call when starting a new search. */
    public resetSessionState(): void {
        this.hasOutputTopicsOnce = false;
        this.hasOutputSourcesOnce = false;
        this.hasOutputGraphOnce = false;
    }

    /** 
     * Emit placeholder sources and single-node graph patches for newly verified paths during search stream. 
     * */
    public async *emitStreamingSourcesAndGraphFromVerifiedPaths(
        emittedSourcePaths: Set<string>,
    ): AsyncGenerator<LLMStreamEvent> {
        const existingGraphPathsSet = new Set(
            this.context.getResult().graph.nodes.map(n => (n.path ?? '').toLowerCase()).filter(Boolean)
        );
        const existingGraphIdsSet = new Set(
            this.context.getResult().graph.nodes.map(n => (n.id ?? '').toLowerCase()).filter(Boolean)
        );
        const existingSourcesPathsSet = new Set(
            this.context.getResult().sources.map(s => (s.path ?? '').toLowerCase()).filter(Boolean)
        );

        const newPaths = Array.from(this.context.getVerifiedPaths())
            .filter((p) => !emittedSourcePaths.has(p))
            .slice(0, STREAMING_SOURCE_TOP_K);

        for (const path of newPaths) {
            const normPath = normalizeFilePath(path.trim());
            if (!normPath) continue;
            const lowerPath = normPath.toLowerCase();
            const title = getFileNameFromPath(normPath);

            emittedSourcePaths.add(path);

            // add sources
            if (!existingSourcesPathsSet.has(lowerPath)) {
                this.hasOutputSourcesOnce = true;
                existingSourcesPathsSet.add(lowerPath);
                this.context.getResult().sources.push({
                    id: `src:stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    title: title,
                    path: normPath,
                    // placeholder reasoning. will be replaced by the actual reasoning from refine agent
                    reasoning: 'From evidence during search (streaming).',
                    badges: [],
                    score: { average: 0, physical: 0, semantic: 0 },
                });
            }

            // add graph node
            const fileNodeId = `file:${normalizeSpecialKey(normPath)}`;
            // check if the path already exists in the graph
            const existingPath = existingGraphPathsSet.has(lowerPath);
            const existingId = existingGraphIdsSet.has(fileNodeId.toLowerCase());
            if (!existingPath && !existingId) {
                this.hasOutputGraphOnce = true;
                existingGraphPathsSet.add(lowerPath);
                existingGraphIdsSet.add(fileNodeId.toLowerCase());
                this.context.getResult().graph.nodes.push({
                    id: fileNodeId,
                    type: 'file',
                    title,
                    path: normPath,
                    attributes: {},
                });
                const patch: GraphPatch = {
                    upsertNodes: [{ id: fileNodeId, label: title, type: 'file', path: normPath }],
                    upsertEdges: [],
                    meta: { toolName: 'streaming_source', label: 'From evidence' },
                };
                yield {
                    type: 'ui-signal',
                    id: `sig-${Date.now()}-${fileNodeId}`,
                    channel: 'graph',
                    kind: 'patch',
                    entityId: 'streaming_source',
                    payload: { patch, overlayText: 'Adding node…', effect: undefined },
                };
            }
        }

        // the later refine agent may not add edges to the existing nodes.
        // so we first try to add edges to the existing nodes by vector similarity
        const result = this.context.getResult();
        const { newEdges, newNodes } = await this.addConceptLinks(result.graph);
        if (newEdges.length > 0 || newNodes.length > 0) {
            result.graph.edges.push(...newEdges);
            // newNodes are already pushed in addConceptLinksBySimilarity; we only need them for the patch
            const patch: GraphPatch = {
                upsertNodes: newNodes.map((n) => ({
                    id: n.id,
                    label: n.title ?? n.id,
                    type: n.type,
                    ...(n.path ? { path: n.path } : {}),
                })),
                upsertEdges: newEdges.map((e) => ({
                    from_node_id: e.source,
                    to_node_id: e.target,
                    kind: e.type,
                    ...(typeof e.attributes?.weight === 'number' ? { weight: e.attributes.weight } : {}),
                })),
                meta: { toolName: 'concept_link', label: 'Linking concepts by similarity' },
            };
            yield {
                type: 'ui-signal',
                id: `sig-concept-link-${Date.now()}`,
                channel: 'graph',
                kind: 'patch',
                entityId: 'concept_link',
                payload: { patch, overlayText: 'Linking concepts…', effect: undefined },
            };
        }

        // update sources
        yield {
            type: 'tool-result',
            id: `update_sources-${generateUuidWithoutHyphens()}`,
            toolName: 'update_sources',
            input: {},
            output: this.context.getResult(),
            triggerName: StreamTriggerName.SEARCH_SOURCES_AGENT,
            extra: { currentResult: this.context.getResult() },
        };
    }

    private async addConceptLinks(graph: AISearchGraph): Promise<{ newEdges: AISearchEdge[]; newNodes: AISearchNode[] }> {
        const appCtx = AppContext.getInstance();
        const embeddingModel = appCtx.settings.search.chunking.embeddingModel;
        if (!embeddingModel) {
            return { newEdges: [], newNodes: [] };
        }
        return addConceptLinksBySimilarity(graph, {
            generateEmbeddings: (texts) =>
                this.aiServiceManager.getMultiChat().generateEmbeddings(texts, embeddingModel.modelId, embeddingModel.provider),
        });
    }

    /**
     * Full dashboard update run: plan construction, stream, hasOutput* updates.
     * Caller passes context builder; agent owns session flags.
     */
    public async *runDashboardUpdate(params: {
        updateContext: AISearchUpdateContext;
        isInitialCall: boolean;
        buildChangeDesc: () => string;
    }): AsyncGenerator<LLMStreamEvent> {
        const { updateContext, isInitialCall, buildChangeDesc } = params;

        const stepId = generateUuidWithoutHyphens();
        yield this.uiStep(stepId, 'Trying to update dashboard', 'Generating plan...', StreamTriggerName.SEARCH_DASHBOARD_AGENT);

        try {
            // build plan
            let plan: DashboardUpdatePlan;
            if (isInitialCall) {
                plan = { topicsPlan: ['Add initial topics from evidence'], sourcesPlan: [], graphPlan: [], blockPlan: [] };
            } else {
                let planFromStream: DashboardUpdatePlan | undefined;
                for await (const ev of this.getPlanStream(updateContext, { setPlan: (p) => { planFromStream = p; }, stepId })) {
                    if (ev.type === 'on-step-finish') {
                        this.onTokenUsage?.(ev.usage);
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
                plan = planFromStream ?? { topicsPlan: [], sourcesPlan: [], graphPlan: [], blockPlan: [] };
                if (!this.hasOutputTopicsOnce && (plan.topicsPlan?.length ?? 0) === 0) {
                    plan = { ...plan, topicsPlan: ['Add topics from evidence'] };
                }
                plan = { ...plan, sourcesPlan: [], graphPlan: plan.graphPlan ?? [] };
                if (!this.hasOutputGraphOnce && (plan.graphPlan?.length ?? 0) === 0) {
                    plan = { ...plan, graphPlan: ['Add nodes and edges from evidence'] };
                }
            }
            yield this.uiStep(stepId, 'Dashboard Update Plan.', '\nDashboard Update Plan: ' + JSON.stringify(plan, null, 2), StreamTriggerName.SEARCH_DASHBOARD_AGENT);

            // stream
            for await (const ev of this.stream(updateContext, plan, { stepId })) {
                yield ev;
            }

            // update flags
            const result = this.context.getResult();
            this.hasOutputTopicsOnce = result.topics.length > 0;
            this.hasOutputSourcesOnce = result.sources.length > 0;
            this.hasOutputGraphOnce = result.graph.nodes.length > 0 || result.graph.edges.length > 0;
        } catch (e) {
            yield {
                type: 'pk-debug',
                debugName: 'dashboard-update-agent-error',
                triggerName: StreamTriggerName.SEARCH_DASHBOARD_AGENT,
                extra: { error: String(e) },
            } as LLMStreamEvent;
        } finally {
            yield this.uiStep(stepId, 'Dashboard Updated. ' + buildChangeDesc(), 'Dashboard Updated', StreamTriggerName.SEARCH_DASHBOARD_AGENT);
        }
    }

    /**
     * Stream structured plan using AI SDK streamObject. Yields text-delta and on-step-finish.
     * Call setPlan when done to receive the final plan.
     */
    private async *getPlanStream(
        variables: AISearchUpdateContext,
        opts?: { setPlan?: (plan: DashboardUpdatePlan) => void; stepId?: string }
    ): AsyncGenerator<LLMStreamEvent> {
        const triggerName = StreamTriggerName.SEARCH_DASHBOARD_AGENT;

        const promptInfo = await this.aiServiceManager.getPromptInfo(PromptId.AiAnalysisDashboardUpdatePlan);
        const system = await this.aiServiceManager.renderPrompt(promptInfo.systemPromptId!, {});
        const prompt = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisDashboardUpdatePlan, variables);

        const { provider, modelId } = this.aiServiceManager.getModelForPrompt(PromptId.AiAnalysisDashboardUpdatePlan);
        const model = this.aiServiceManager.getMultiChat()
            .getProviderService(provider)
            .modelClient(modelId);

        const result = streamObject({
            model,
            schema: dashboardUpdatePlanSchema,
            schemaName: 'DashboardUpdatePlan',
            schemaDescription: 'String arrays as instructions for each agent.',
            system,
            prompt,
        });

        for await (const part of result.fullStream) {
            if (part.type === 'text-delta') {
                yield { type: 'text-delta', text: part.textDelta, triggerName };
            }
            if (part.type === 'finish') {
                const plan = (await result.object) as DashboardUpdatePlan;
                opts?.setPlan?.(plan);
                yield { type: 'on-step-finish', text: '', finishReason: part.finishReason, usage: part.usage, triggerName };
            }
        }
    }

    /**
     * Run dashboard update phases in order based on plan.
     * Runs each agent when the corresponding plan array is non-empty.
     */
    private async *stream(
        variables: AISearchUpdateContext,
        plan: DashboardUpdatePlan,
        opts?: { stepId?: string }
    ): AsyncGenerator<LLMStreamEvent> {
        const stepId = opts?.stepId ?? generateUuidWithoutHyphens();
        const contextWithPlan: AISearchUpdateContext = { ...variables, plan };

        if ((plan.topicsPlan?.length ?? 0) > 0) {
            yield this.uiStep(stepId, 'Updating topics...', 'Updating topics', StreamTriggerName.SEARCH_TOPICS_AGENT);
            for await (const ev of this.topicsAgent.stream(contextWithPlan)) {
                yield* this.processEvent(ev, stepId, StreamTriggerName.SEARCH_TOPICS_AGENT);
            }
        }

        if ((plan.sourcesPlan?.length ?? 0) > 0) {
            yield this.uiStep(stepId, 'Updating sources...', 'Updating sources', StreamTriggerName.SEARCH_SOURCES_AGENT);
            for await (const ev of this.sourcesAgent.stream(contextWithPlan)) {
                yield* this.processEvent(ev, stepId, StreamTriggerName.SEARCH_SOURCES_AGENT);
            }
        }

        if ((plan.graphPlan?.length ?? 0) > 0) {
            yield this.uiStep(stepId, 'Updating graph...', 'Updating graph', StreamTriggerName.SEARCH_GRAPH_AGENT);
            yield this.graphStageSignal(stepId, 'start');
            ensureSourcePathsAsGraphFileNodes(this.context.getResult());
            for await (const ev of this.graphAgent.stream(contextWithPlan, { stepId })) {
                yield* this.processEvent(ev, stepId, StreamTriggerName.SEARCH_GRAPH_AGENT);
            }
            yield this.graphStageSignal(stepId, 'finish');
        }

        if ((plan.blockPlan?.length ?? 0) > 0) {
            yield this.uiStep(stepId, 'Updating dashboard blocks...', 'Updating dashboard blocks', StreamTriggerName.SEARCH_DASHBOARD_AGENT);
            for await (const ev of this.blocksAgent.stream(contextWithPlan)) {
                yield* this.processEvent(ev, stepId, StreamTriggerName.SEARCH_DASHBOARD_AGENT);
            }
        }
    }

    /** Run review phase only. Used in ReAct loop and finish phase. */
    public async *streamReview(
        variables: AISearchUpdateContext,
        opts?: { stepId?: string }
    ): AsyncGenerator<LLMStreamEvent> {
        const stepId = opts?.stepId ?? generateUuidWithoutHyphens();
        yield this.uiStep(stepId, 'Reviewing and consolidating dashboard blocks', 'Reviewing dashboard blocks', StreamTriggerName.SEARCH_REVIEW_BLOCKS);
        for await (const ev of this.reviewAgent.stream(variables)) {
            yield* this.processEvent(ev, stepId, StreamTriggerName.SEARCH_REVIEW_BLOCKS);
        }
    }

    private *processEvent(
        ev: LLMStreamEvent,
        stepId: string,
        triggerName: StreamTriggerName
    ): Generator<LLMStreamEvent> {
        if (ev.type === 'on-step-finish' && ev.usage) {
            this.onTokenUsage?.(ev.usage);
        }
        if (DELTA_EVENT_TYPES.has(ev.type)) {
            yield {
                type: 'ui-step-delta',
                uiType: UIStepType.STEPS_DISPLAY,
                stepId,
                descriptionDelta: getDeltaEventDeltaText(ev),
                triggerName,
            };
        }
        yield ev;
    }

    private uiStep(stepId: string, title: string, description: string, triggerName: StreamTriggerName): LLMStreamEvent {
        return {
            type: 'ui-step',
            uiType: UIStepType.STEPS_DISPLAY,
            stepId,
            title,
            description,
            triggerName,
        };
    }

    private graphStageSignal(stepId: string, stage: 'start' | 'finish'): LLMStreamEvent {
        return {
            type: 'ui-signal',
            id: `sig-${Date.now()}`,
            channel: 'graph',
            kind: 'stage',
            entityId: stepId,
            payload: stage === 'start'
                ? { stage: 'start', overlayText: 'Updating graph…', effect: { type: 'scan', intensity: 1 } }
                : { stage: 'finish' },
        };
    }
}
