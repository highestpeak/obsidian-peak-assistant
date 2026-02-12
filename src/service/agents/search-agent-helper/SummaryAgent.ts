import { AIServiceManager } from '@/service/chat/service-manager';
import { LLMStreamEvent, StreamTriggerName } from '@/core/providers/types';
import { PromptId } from '@/service/prompt/PromptId';
import type { DashboardUpdateContext, InnerAgentContext, SearchAgentResult } from '../AISearchAgent';
import type { AgentMemory } from './AgentMemoryManager';
import type { AISearchAgentOptions } from '../AISearchAgent';
import { Experimental_Agent as Agent } from 'ai';
import { AgentTool } from '@/service/tools/types';
import { searchMemoryStoreTool } from '@/service/tools/search-memory-store';
import { submitFinalAnswerTool } from '@/service/tools/submit-final-answer';
import { streamTransform } from '@/core/providers/helpers/stream-helper';

type SummaryToolSet = {
    search_analysis_context: AgentTool;
    submit_final_answer: AgentTool;
};

export interface SummaryAgentContext {
    getResult: () => SearchAgentResult;
    getMemory: () => AgentMemory;
    options: AISearchAgentOptions;
    setSummary: (summary: string) => void;
    searchHistory: (query: string, options?: { maxChars?: number }) => string;
}

/**
 * Agent for producing the comprehensive synthesis summary.
 */
export class SummaryAgent {
    private readonly aiServiceManager: AIServiceManager;
    private readonly options: { provider: string; model: string, enableWebSearch?: boolean; enableLocalSearch?: boolean };
    private readonly context: InnerAgentContext;

    private agent: Agent<SummaryToolSet>;

    constructor(params: {
        aiServiceManager: AIServiceManager,
        options: { provider: string; model: string, enableWebSearch?: boolean; enableLocalSearch?: boolean },
        context: InnerAgentContext,
    }) {
        this.aiServiceManager = params.aiServiceManager;
        this.options = params.options;
        this.context = params.context;
        const {  searchHistory } = this.context;

        const tools: SummaryToolSet = {
            search_analysis_context: searchMemoryStoreTool(searchHistory, {
                description: 'Search the analysis session history for relevant context. Use to look up search tool results, prior steps, and evidence traces.',
            }),
            submit_final_answer: submitFinalAnswerTool(),
        };

        this.agent = new Agent<SummaryToolSet>({
            model: this.aiServiceManager.getMultiChat()
                .getProviderService(this.options.provider)
                .modelClient(this.options.model),
            tools,
        });
    }

    /**
     * Stream summary generation.
     *
     * Uses chatWithPromptStream so that UI can receive prompt-stream-delta / prompt-stream-result
     * events (real streaming summary), while still updating SearchAgentResult.summary at the end.
     */
    public async *stream(variables: DashboardUpdateContext): AsyncGenerator<LLMStreamEvent> {
        const promptInfo = await this.aiServiceManager.getPromptInfo(PromptId.AiAnalysisSummary);
        const system = await this.aiServiceManager.renderPrompt(promptInfo.systemPromptId!, {});
        const prompt = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisSummary, {
            ...variables,
        });

        const result = this.agent.stream({
            system: system,
            prompt,
        });
        let summaryCollector: string[] = [];
        yield* streamTransform(result.fullStream, StreamTriggerName.SEARCH_SUMMARY, {
            yieldEventPostProcessor: (chunk: any) => {
                if (chunk.type === 'text-delta') {
                    summaryCollector.push(chunk.text ?? '');
                }
                return chunk;
            },
            
        });
        this.context.getResult().summary = summaryCollector.join('');
    }
}
