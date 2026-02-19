import { Experimental_Agent as Agent, stepCountIs } from 'ai';
import { AIServiceManager } from '@/service/chat/service-manager';
import { LLMStreamEvent, StreamTriggerName } from '@/core/providers/types';
import type { GraphPatch } from '@/core/providers/ui-events/graph';
import { ErrorRetryInfo, PromptId, type PromptVariables } from '@/service/prompt/PromptId';
import { AISearchUpdateContext, InnerAgentContext } from '../AISearchAgent';
import type { AISearchEdge, AISearchNode } from '../AISearchAgent';
import { graphNodesUpdateTool, graphEdgesUpdateTool, getGraphToolFormatGuidance } from './helpers/DashboardUpdateToolBuilder';
import { searchMemoryStoreTool } from '@/service/tools/search-memory-store';
import type { AgentTool } from '@/service/tools/types';
import { RESULT_UPDATE_TOOL_NAMES } from '../AISearchAgent';
import { buildPromptTraceDebugEvent, streamTransform, withRetryStream } from '@/core/providers/helpers/stream-helper';

const DEFAULT_MAX_STEPS = 18;

const GRAPH_UPDATE_TOOL_NAMES = new Set(['update_graph_nodes', 'update_graph_edges']);

type GraphUpdateToolSet = {
    search_analysis_context: AgentTool;
    update_graph_nodes: AgentTool;
    update_graph_edges: AgentTool;
};

/** Uses getModelForPrompt(AiAnalysisDashboardUpdateGraph). */
export class GraphUpdateAgent {
    private readonly aiServiceManager: AIServiceManager;
    private readonly options: { enableWebSearch?: boolean; enableLocalSearch?: boolean };
    private readonly context: InnerAgentContext;

    private agent: Agent<GraphUpdateToolSet>;

    constructor(
        params: {
            aiServiceManager: AIServiceManager,
            options: { enableWebSearch?: boolean; enableLocalSearch?: boolean },
            context: InnerAgentContext,
        }
    ) {
        this.aiServiceManager = params.aiServiceManager;
        this.options = { enableWebSearch: params.options.enableWebSearch, enableLocalSearch: params.options.enableLocalSearch };
        this.context = params.context;
        const { provider, modelId } = this.aiServiceManager.getModelForPrompt(PromptId.AiAnalysisDashboardUpdateGraph);
        const { getResult, getVerifiedPaths, searchHistory } = this.context;

        const tools: GraphUpdateToolSet = {
            search_analysis_context: searchMemoryStoreTool(searchHistory, {
                description: 'Search the analysis session history for relevant context. Use to look up search tool results, prior steps, and evidence traces.',
            }),
            update_graph_nodes: graphNodesUpdateTool(getResult, getVerifiedPaths),
            update_graph_edges: graphEdgesUpdateTool(getResult),
        };

        this.agent = new Agent<GraphUpdateToolSet>({
            model: this.aiServiceManager.getMultiChat()
                .getProviderService(provider)
                .modelClient(modelId),
            tools,
            stopWhen: [
                stepCountIs(DEFAULT_MAX_STEPS),
            ],
        });
    }

    /**
     * @param opts.stepId When set, yields ui-signal(channel='graph', kind='patch') after each graph tool-result (incremental patch).
     */
    public async *stream(
        variables: AISearchUpdateContext,
        opts?: { stepId?: string },
    ): AsyncGenerator<LLMStreamEvent> {
        yield* withRetryStream(
            variables,
            (vars, retryCtx) => this.realStreamInterlal(vars, retryCtx, opts?.stepId),
        );
    }

    private static edgeKey(e: { source: string; type: string; target: string }): string {
        return `${String(e.source)}|${String(e.type)}|${String(e.target)}`;
    }

    /**
     * Build an incremental GraphPatch: only nodes/edges added since the given snapshot.
     * If snapshot is null, returns full graph (fallback).
     */
    private resultGraphToDeltaPatch(snapshot: { nodeIds: Set<string>; edgeKeys: Set<string> } | null): GraphPatch {
        const g = this.context.getResult().graph;
        const toPatchNode = (n: AISearchNode) => ({
            id: n.id,
            label: n.title ?? (n as any).label ?? n.id,
            type: n.type,
            ...(n.path ? { path: n.path } : {}),
            ...(n.attributes && Object.keys(n.attributes).length ? { attributes: n.attributes } : {}),
        });
        const toPatchEdge = (e: AISearchEdge) => ({
            from_node_id: e.source,
            to_node_id: e.target,
            kind: e.type,
            ...(typeof (e.attributes?.weight) === 'number' ? { weight: e.attributes.weight } : {}),
        });
        if (!snapshot) {
            return {
                upsertNodes: g.nodes.map(toPatchNode),
                upsertEdges: g.edges.map(toPatchEdge),
                meta: { toolName: 'graph_update', label: 'Applying graph updates…' },
            };
        }
        const newNodes = g.nodes.filter((n) => !snapshot.nodeIds.has(n.id)).map(toPatchNode);
        const newEdges = g.edges
            .filter((e) => !snapshot.edgeKeys.has(GraphUpdateAgent.edgeKey(e)))
            .map(toPatchEdge);
        return {
            upsertNodes: newNodes,
            upsertEdges: newEdges,
            meta: { toolName: 'graph_update', label: 'Applying graph updates…' },
        };
    }

    private async *realStreamInterlal(
        variables: AISearchUpdateContext,
        errorRetryInfo?: ErrorRetryInfo,
        stepId?: string,
    ): AsyncGenerator<LLMStreamEvent> {
        const promptInfo = await this.aiServiceManager.getPromptInfo(PromptId.AiAnalysisDashboardUpdateGraph);
        const system = await this.aiServiceManager.renderPrompt(promptInfo.systemPromptId!, {});
        const prompt = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisDashboardUpdateGraph, {
            ...variables,
            ...(errorRetryInfo ? { errorRetryInfo } : {}),
            toolFormatGuidance: getGraphToolFormatGuidance(),
        } as PromptVariables[typeof PromptId.AiAnalysisDashboardUpdateGraph]);

        yield buildPromptTraceDebugEvent('graph-update-prompt', StreamTriggerName.SEARCH_DASHBOARD_UPDATE_AGENT, system, prompt);
        const result = this.agent.stream({ system, prompt });
        let graphSnapshotBeforeTool: { nodeIds: Set<string>; edgeKeys: Set<string> } | null = null;
        yield* streamTransform(result.fullStream, StreamTriggerName.SEARCH_DASHBOARD_UPDATE_AGENT, {
            yieldEventPostProcessor: (chunk: any) => {
                return RESULT_UPDATE_TOOL_NAMES.has(chunk.toolName)
                    ? { extra: { currentResult: this.context.getResult() } }
                    : {};
            },
            chunkEventInterceptor: (chunk: any) => {
                if (chunk.type === 'tool-call' && GRAPH_UPDATE_TOOL_NAMES.has(chunk.toolName)) {
                    const g = this.context.getResult().graph;
                    graphSnapshotBeforeTool = {
                        nodeIds: new Set(g.nodes.map((n) => n.id)),
                        edgeKeys: new Set(g.edges.map((e) => GraphUpdateAgent.edgeKey(e))),
                    };
                }
            },
            yieldExtraAfterEvent: stepId
                ? (chunk: any) => {
                    if (chunk.type !== 'tool-result' || !GRAPH_UPDATE_TOOL_NAMES.has(chunk.toolName)) return;
                    const patch = this.resultGraphToDeltaPatch(graphSnapshotBeforeTool);
                    graphSnapshotBeforeTool = null;
                    const focusNodeIds = patch.upsertNodes.length ? patch.upsertNodes.slice(-12).map((n) => n.id) : undefined;
                    return {
                        type: 'ui-signal',
                        id: `sig-${Date.now()}`,
                        channel: 'graph',
                        kind: 'patch',
                        entityId: stepId,
                        payload: {
                            patch,
                            overlayText: patch.meta?.label ?? 'Applying graph updates…',
                            effect: { type: 'filter', intensity: 0.9, focusNodeIds },
                        },
                    };
                }
                : undefined,
        });
    }
}
