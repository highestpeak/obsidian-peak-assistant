import { Experimental_Agent as Agent, stepCountIs } from 'ai';
import { AIServiceManager } from '@/service/chat/service-manager';
import { LLMStreamEvent, StreamTriggerName } from '@/core/providers/types';
import { ErrorRetryInfo, PromptId } from '@/service/prompt/PromptId';
import { AISearchUpdateContext, InnerAgentContext } from '../AISearchAgent';
import { sourcesUpdateTool, getSourcesToolFormatGuidance } from './helpers/DashboardUpdateToolBuilder';
import { searchMemoryStoreTool } from '@/service/tools/search-memory-store';
import type { AgentTool } from '@/service/tools/types';
import { RESULT_UPDATE_TOOL_NAMES } from '../AISearchAgent';
import { buildPromptTraceDebugEvent, streamTransform, withRetryStream } from '@/core/providers/helpers/stream-helper';

const DEFAULT_MAX_STEPS = 18;

type SourcesUpdateToolSet = {
    search_analysis_context: AgentTool;
    update_sources: AgentTool;
};

/** Uses getModelForPrompt(AiAnalysisDashboardUpdateSources). */
export class SourcesUpdateAgent {
    private readonly aiServiceManager: AIServiceManager;
    private readonly options: { enableWebSearch?: boolean; enableLocalSearch?: boolean };
    private readonly context: InnerAgentContext;

    private agent: Agent<SourcesUpdateToolSet>;

    constructor(
        params: {
            aiServiceManager: AIServiceManager,
            options: { provider?: string; model?: string; enableWebSearch?: boolean; enableLocalSearch?: boolean },
            context: InnerAgentContext,
        }
    ) {
        this.aiServiceManager = params.aiServiceManager;
        this.options = { enableWebSearch: params.options.enableWebSearch, enableLocalSearch: params.options.enableLocalSearch };
        this.context = params.context;
        const { provider, modelId } = this.aiServiceManager.getModelForPrompt(PromptId.AiAnalysisDashboardUpdateSources);
        const { getResult, getVerifiedPaths, searchHistory } = this.context;

        const tools: SourcesUpdateToolSet = {
            search_analysis_context: searchMemoryStoreTool(searchHistory, {
                description: 'Search the analysis session history for relevant context. Use to look up search tool results, prior steps, and evidence traces.',
            }),
            update_sources: sourcesUpdateTool(getResult, getVerifiedPaths),
        };

        this.agent = new Agent<SourcesUpdateToolSet>({
            model: this.aiServiceManager.getMultiChat()
                .getProviderService(provider)
                .modelClient(modelId),
            tools,
            stopWhen: [
                stepCountIs(DEFAULT_MAX_STEPS),
            ],
        });
    }

    public async *stream(
        variables: AISearchUpdateContext
    ): AsyncGenerator<LLMStreamEvent> {
        yield* withRetryStream(
            variables,
            (vars, retryCtx) => this.realStreamInterlal(vars, retryCtx),
        );
    }

    private async *realStreamInterlal(
        variables: AISearchUpdateContext,
        errorRetryInfo?: ErrorRetryInfo,
    ): AsyncGenerator<LLMStreamEvent> {
        const promptInfo = await this.aiServiceManager.getPromptInfo(PromptId.AiAnalysisDashboardUpdateSources);
        const system = await this.aiServiceManager.renderPrompt(promptInfo.systemPromptId!, {});
        const prompt = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisDashboardUpdateSources, {
            ...variables,
            ...(errorRetryInfo ? { errorRetryInfo } : {}),
            toolFormatGuidance: getSourcesToolFormatGuidance(),
        });

        yield buildPromptTraceDebugEvent('sources-update-prompt', StreamTriggerName.SEARCH_SOURCES_AGENT, system, prompt);
        const result = this.agent.stream({ system, prompt });
        yield* streamTransform(result.fullStream, StreamTriggerName.SEARCH_SOURCES_AGENT, {
            yieldEventPostProcessor: (chunk: any) => {
                return RESULT_UPDATE_TOOL_NAMES.has(chunk.toolName)
                    ? { extra: { currentResult: this.context.getResult() } }
                    : {};
            },
        });
    }
}
