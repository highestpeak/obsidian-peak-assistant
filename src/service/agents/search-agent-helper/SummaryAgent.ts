import { AIServiceManager } from '@/service/chat/service-manager';
import { LLMStreamEvent, StreamTriggerName } from '@/core/providers/types';
import { PromptId } from '@/service/prompt/PromptId';
import type { AISearchUpdateContext, InnerAgentContext, SearchAgentResult } from '../AISearchAgent';
import type { AgentMemory } from './AgentMemoryManager';
import type { AISearchAgentOptions } from '../AISearchAgent';
import { Experimental_Agent as Agent } from 'ai';
import { AgentTool } from '@/service/tools/types';
import { searchMemoryStoreTool } from '@/service/tools/search-memory-store';
import { submitFinalAnswerTool } from '@/service/tools/submit-final-answer';
import { buildPromptTraceDebugEvent, streamTransform } from '@/core/providers/helpers/stream-helper';

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
 * Uses getModelForPrompt for AiAnalysisDiagnosisJson and AiAnalysisSummary.
 */
export class SummaryAgent {
    private readonly aiServiceManager: AIServiceManager;
    private readonly options: { enableWebSearch?: boolean; enableLocalSearch?: boolean };
    private readonly context: InnerAgentContext;

    private agent: Agent<SummaryToolSet>;

    constructor(params: {
        aiServiceManager: AIServiceManager,
        options: { enableWebSearch?: boolean; enableLocalSearch?: boolean },
        context: InnerAgentContext,
    }) {
        this.aiServiceManager = params.aiServiceManager;
        this.options = { enableWebSearch: params.options.enableWebSearch, enableLocalSearch: params.options.enableLocalSearch };
        this.context = params.context;
        const {  searchHistory } = this.context;

        const tools: SummaryToolSet = {
            search_analysis_context: searchMemoryStoreTool(searchHistory, {
                description: 'Search the analysis session history for relevant context. Use to look up search tool results, prior steps, and evidence traces.',
            }),
            submit_final_answer: submitFinalAnswerTool(),
        };

        const { provider, modelId } = this.aiServiceManager.getModelForPrompt(PromptId.AiAnalysisSummary);
        const outputControl = this.aiServiceManager.getSettings?.()?.defaultOutputControl;
        const temperature = outputControl?.temperature ?? 0.6;
        const maxOutputTokens = outputControl?.maxOutputTokens ?? 4096;

        this.agent = new Agent<SummaryToolSet>({
            model: this.aiServiceManager.getMultiChat()
                .getProviderService(provider)
                .modelClient(modelId),
            tools,
            temperature,
            maxOutputTokens,
        });
    }

    /**
     * Stream summary generation.
     * In full mode: runs Step-A (diagnosis JSON) then Step-B (markdown synthesis). In simple mode: Step-B only.
     */
    public async *stream(variables: AISearchUpdateContext): AsyncGenerator<LLMStreamEvent> {
        let diagnosisJson: string | undefined;
        const analysisMode = variables.analysisMode;
        const snapshotForDiagnosis = variables.currentResultSnapshotForSummary ?? variables.currentResultSnapshot;

        if (analysisMode === 'vaultFull') {
            try {
                const diagModel = this.aiServiceManager.getModelForPrompt(PromptId.AiAnalysisDiagnosisJson);
                const diagnosisRaw = await this.aiServiceManager.chatWithPrompt(
                    PromptId.AiAnalysisDiagnosisJson,
                    {
                        originalQuery: variables.originalQuery ?? '',
                        recentEvidenceHint: variables.recentEvidenceHint ?? '',
                        currentResultSnapshot: snapshotForDiagnosis,
                    },
                    diagModel.provider,
                    diagModel.modelId,
                );
                const trimmed = (diagnosisRaw ?? '').trim();
                if (trimmed.length > 0) {
                    diagnosisJson = trimmed;
                }
            } catch {
                diagnosisJson = undefined;
            }
        }

        const promptInfo = await this.aiServiceManager.getPromptInfo(PromptId.AiAnalysisSummary);
        const system = await this.aiServiceManager.renderPrompt(promptInfo.systemPromptId!, {});
        const prompt = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisSummary, {
            ...variables,
            diagnosisJson,
        });

        yield buildPromptTraceDebugEvent('summary-prompt', StreamTriggerName.SEARCH_SUMMARY, system, prompt);
        const result = this.agent.stream({
            system: system,
            prompt,
        });
        const summaryCollector: string[] = [];
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
