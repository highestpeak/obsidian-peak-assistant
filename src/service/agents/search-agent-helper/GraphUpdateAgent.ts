import { Experimental_Agent as Agent, stepCountIs } from 'ai';
import { AIServiceManager } from '@/service/chat/service-manager';
import { LLMStreamEvent, StreamTriggerName } from '@/core/providers/types';
import { ErrorRetryInfo, PromptId } from '@/service/prompt/PromptId';
import { DashboardUpdateContext, InnerAgentContext } from '../AISearchAgent';
import { graphNodesUpdateTool, graphEdgesUpdateTool } from './DashboardUpdateToolBuilder';
import { searchMemoryStoreTool } from '@/service/tools/search-memory-store';
import type { AgentTool } from '@/service/tools/types';
import { RESULT_UPDATE_TOOL_NAMES } from '../AISearchAgent';
import { streamTransform, withRetryStream } from '@/core/providers/helpers/stream-helper';

const DEFAULT_MAX_STEPS = 18;

type GraphUpdateToolSet = {
    search_analysis_context: AgentTool;
    update_graph_nodes: AgentTool;
    update_graph_edges: AgentTool;
};

export class GraphUpdateAgent {
    private readonly aiServiceManager: AIServiceManager;
    private readonly options: { provider: string; model: string, enableWebSearch?: boolean; enableLocalSearch?: boolean };
    private readonly context: InnerAgentContext;

    private agent: Agent<GraphUpdateToolSet>;

    constructor(
        params: {
            aiServiceManager: AIServiceManager,
            options: { provider: string; model: string, enableWebSearch?: boolean; enableLocalSearch?: boolean },
            context: InnerAgentContext,
        }
    ) {
        this.aiServiceManager = params.aiServiceManager;
        this.options = params.options;
        this.context = params.context;
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
                .getProviderService(this.options.provider)
                .modelClient(this.options.model),
            tools,
            stopWhen: [
                stepCountIs(DEFAULT_MAX_STEPS),
            ],
        });
    }

    public async *stream(
        variables: DashboardUpdateContext
    ): AsyncGenerator<LLMStreamEvent> {
        yield* withRetryStream(
            variables,
            (vars, retryCtx) => this.realStreamInterlal(vars, retryCtx),
        );
    }

    private async *realStreamInterlal(
        variables: DashboardUpdateContext,
        errorRetryInfo?: ErrorRetryInfo,
    ): AsyncGenerator<LLMStreamEvent> {
        const promptInfo = await this.aiServiceManager.getPromptInfo(PromptId.AiAnalysisDashboardUpdateGraph);
        const system = await this.aiServiceManager.renderPrompt(promptInfo.systemPromptId!, {});
        const prompt = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisDashboardUpdateGraph, {
            ...variables,
            ...(errorRetryInfo ? { errorRetryInfo } : {}),
        });

        const result = this.agent.stream({ system, prompt });
        yield* streamTransform(result.fullStream, StreamTriggerName.SEARCH_DASHBOARD_UPDATE_AGENT, {
            yieldEventPostProcessor: (chunk: any) => {
                return RESULT_UPDATE_TOOL_NAMES.has(chunk.toolName)
                    ? { extra: { currentResult: this.context.getResult() } }
                    : {};
            },
        });
    }
}
