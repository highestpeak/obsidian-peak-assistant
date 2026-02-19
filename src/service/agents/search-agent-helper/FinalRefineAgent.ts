import { Experimental_Agent as Agent, stepCountIs } from 'ai';
import { AIServiceManager } from '@/service/chat/service-manager';
import { LLMStreamEvent, StreamTriggerName, UIStepType } from '@/core/providers/types';
import type { GraphPatch } from '@/core/providers/ui-events/graph';
import { PromptId, type PromptVariables } from '@/service/prompt/PromptId';
import { AISearchUpdateContext, InnerAgentContext } from '../AISearchAgent';
import type { AISearchEdge, AISearchNode } from '../AISearchAgent';
import {
    sourcesUpdateTool,
    graphNodesUpdateTool,
    graphEdgesUpdateTool,
    getSourcesToolFormatGuidance,
    getGraphToolFormatGuidance,
} from './helpers/DashboardUpdateToolBuilder';
import { searchMemoryStoreTool } from '@/service/tools/search-memory-store';
import type { AgentTool } from '@/service/tools/types';
import { RESULT_UPDATE_TOOL_NAMES } from '../AISearchAgent';
import { buildPromptTraceDebugEvent, checkIfDeltaEvent, streamTransform } from '@/core/providers/helpers/stream-helper';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';

const DEFAULT_MAX_STEPS = 8;

const FINAL_REFINE_GRAPH_TOOLS = new Set(['update_graph_nodes', 'update_graph_edges']);

type FinalRefineToolSet = {
    search_analysis_context: AgentTool;
    update_sources: AgentTool;
    update_graph_nodes: AgentTool;
    update_graph_edges: AgentTool;
};

function edgeKey(e: { from_node_id: string; to_node_id: string; kind?: string }): string {
    return `${String(e.from_node_id)}|${String(e.kind ?? 'link')}|${String(e.to_node_id)}`;
}

/**
 * Split a graph patch into one patch per node (1 node + edges touching that node) for one-by-one UI animation.
 */
function splitPatchIntoSingleNodePatches(patch: GraphPatch): GraphPatch[] {
    const nodes = patch.upsertNodes ?? [];
    const edges = patch.upsertEdges ?? [];
    if (nodes.length === 0) return [];
    const result: GraphPatch[] = [];
    for (const node of nodes) {
        const nodeId = node.id;
        const nodeEdges = edges.filter((e) => e.from_node_id === nodeId || e.to_node_id === nodeId);
        result.push({
            upsertNodes: [node],
            upsertEdges: nodeEdges,
            meta: patch.meta ?? { toolName: 'final_refine', label: 'Refining graph…' },
        });
    }
    return result;
}

/**
 * Build delta patch from snapshot to current graph (same logic as GraphUpdateAgent.resultGraphToDeltaPatch).
 */
function resultGraphToDeltaPatch(
    getResult: () => { graph: { nodes: AISearchNode[]; edges: AISearchEdge[] } },
    snapshot: { nodeIds: Set<string>; edgeKeys: Set<string> } | null
): GraphPatch {
    const g = getResult().graph;
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
            meta: { toolName: 'final_refine', label: 'Refining graph…' },
        };
    }
    const newNodes = g.nodes.filter((n) => !snapshot.nodeIds.has(n.id)).map(toPatchNode);
    const newEdges = g.edges
        .filter((e) => !snapshot.edgeKeys.has(`${e.source}|${e.type}|${e.target}`))
        .map(toPatchEdge);
    return {
        upsertNodes: newNodes,
        upsertEdges: newEdges,
        meta: { toolName: 'final_refine', label: 'Refining graph…' },
    };
}

/**
 * Single LLM pass to refine sources (reorder, add reasoning) and graph (add concept/tag nodes and edges).
 * Emits graph updates as one-patch-per-node so the UI can animate node-by-node.
 * Uses getModelForPrompt(AiAnalysisFinalRefine).
 */
export class FinalRefineAgent {
    private readonly aiServiceManager: AIServiceManager;
    private readonly context: InnerAgentContext;

    private agent: Agent<FinalRefineToolSet>;

    constructor(params: {
        aiServiceManager: AIServiceManager;
        context: InnerAgentContext;
    }) {
        this.aiServiceManager = params.aiServiceManager;
        this.context = params.context;
        const { getResult, getVerifiedPaths, searchHistory } = this.context;

        const tools: FinalRefineToolSet = {
            search_analysis_context: searchMemoryStoreTool(searchHistory, {
                description: 'Search the analysis session history for evidence. Use to justify source reasoning or graph edges.',
            }),
            update_sources: sourcesUpdateTool(getResult, getVerifiedPaths),
            update_graph_nodes: graphNodesUpdateTool(getResult, getVerifiedPaths),
            update_graph_edges: graphEdgesUpdateTool(getResult),
        };

        const { provider, modelId } = this.aiServiceManager.getModelForPrompt(PromptId.AiAnalysisFinalRefine);
        this.agent = new Agent<FinalRefineToolSet>({
            model: this.aiServiceManager.getMultiChat()
                .getProviderService(provider)
                .modelClient(modelId),
            tools,
            stopWhen: [stepCountIs(DEFAULT_MAX_STEPS)],
        });
    }

    /** refineMode: sources only (description), graph only (connections), or full. sourcesBatch: when set, refine only that batch of sources. */
    public async *stream(
        variables: AISearchUpdateContext,
        opts?: {
            stepId?: string;
            refineMode?: 'sources_only' | 'graph_only' | 'full';
            sourcesBatch?: { index: number; start: number; end: number; total: number };
        }
    ): AsyncGenerator<LLMStreamEvent> {
        const stepId = opts?.stepId ?? generateUuidWithoutHyphens();
        const refineMode = opts?.refineMode ?? 'full';
        const sourcesBatch = opts?.sourcesBatch;

        const toolFormatGuidance =
            refineMode === 'graph_only'
                ? getGraphToolFormatGuidance()
                : refineMode === 'sources_only'
                  ? getSourcesToolFormatGuidance()
                  : [getSourcesToolFormatGuidance(), getGraphToolFormatGuidance()].join('\n\n');

        let systemPromptId: PromptId;
        let promptId: PromptId;
        let promptVars: Record<string, unknown>;

        if (refineMode === 'sources_only') {
            systemPromptId = PromptId.AiAnalysisFinalRefineSourcesSystem;
            promptId = PromptId.AiAnalysisFinalRefineSources;
            promptVars = {
                ...variables,
                toolFormatGuidance,
                sourcesBatch: sourcesBatch
                    ? {
                          start: sourcesBatch.start,
                          end: sourcesBatch.end,
                          indexPlusOne: sourcesBatch.index + 1,
                          total: sourcesBatch.total,
                      }
                    : undefined,
            };
        } else if (refineMode === 'graph_only') {
            systemPromptId = PromptId.AiAnalysisFinalRefineGraphSystem;
            promptId = PromptId.AiAnalysisFinalRefineGraph;
            promptVars = { ...variables, toolFormatGuidance };
        } else {
            systemPromptId = PromptId.AiAnalysisFinalRefineSystem;
            promptId = PromptId.AiAnalysisFinalRefine;
            promptVars = { ...variables, toolFormatGuidance, refineMode: undefined };
        }

        const promptInfo = await this.aiServiceManager.getPromptInfo(promptId);
        const system = await this.aiServiceManager.renderPrompt(promptInfo.systemPromptId ?? systemPromptId, {});
        const prompt = await this.aiServiceManager.renderPrompt(promptId, promptVars as any);

        yield buildPromptTraceDebugEvent(
            'final-refine-prompt',
            StreamTriggerName.SEARCH_DASHBOARD_UPDATE_AGENT,
            system,
            prompt
        );

        const result = this.agent.stream({ system, prompt });
        let graphSnapshotBeforeTool: { nodeIds: Set<string>; edgeKeys: Set<string> } | null = null;

        yield* streamTransform(result.fullStream, StreamTriggerName.SEARCH_DASHBOARD_UPDATE_AGENT, {
            yieldEventPostProcessor: (chunk: any) =>
                RESULT_UPDATE_TOOL_NAMES.has(chunk.toolName) ? { extra: { currentResult: this.context.getResult() } } : {},
            chunkEventInterceptor: (chunk: any) => {
                if (chunk.type === 'tool-call' && FINAL_REFINE_GRAPH_TOOLS.has(chunk.toolName)) {
                    const g = this.context.getResult().graph;
                    graphSnapshotBeforeTool = {
                        nodeIds: new Set(g.nodes.map((n) => n.id)),
                        edgeKeys: new Set(g.edges.map((e) => edgeKey({ from_node_id: e.source, to_node_id: e.target, kind: e.type }))),
                    };
                }
            },
            yieldExtraAfterEvent: (chunk: any) => {
                if (checkIfDeltaEvent(chunk)) {
                    return {
                        type: 'ui-step-delta',
                        uiType: UIStepType.STEPS_DISPLAY,
                        stepId,
                        descriptionDelta: (chunk as any).text,
                        triggerName: StreamTriggerName.SEARCH_DASHBOARD_UPDATE_AGENT,
                    };
                }

                if (chunk.type == 'tool-result' && FINAL_REFINE_GRAPH_TOOLS.has(chunk.toolName)) {
                    const patch = resultGraphToDeltaPatch(this.context.getResult, graphSnapshotBeforeTool);
                    graphSnapshotBeforeTool = null;
                    const singleNodePatches = splitPatchIntoSingleNodePatches(patch);
                    return singleNodePatches.map((p, i) => ({
                        type: 'ui-signal' as const,
                        id: `sig-final-refine-${Date.now()}-${i}`,
                        channel: 'graph' as const,
                        kind: 'patch' as const,
                        entityId: stepId ?? 'final-refine',
                        payload: {
                            patch: p,
                            overlayText: p.meta?.label ?? 'Refining graph…',
                            effect: undefined,
                        },
                    }));
                }
            },
        });
    }
}
