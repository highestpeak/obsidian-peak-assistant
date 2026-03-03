import { Experimental_Agent as Agent } from 'ai';
import { AIServiceManager } from '@/service/chat/service-manager';
import { LLMStreamEvent, StreamTriggerName, UIStepType } from '@/core/providers/types';
import { ErrorRetryInfo, PromptId, type PromptVariables } from '@/service/prompt/PromptId';
import { submitFinalAnswerInputSchema } from '@/core/schemas/tools/submitFinalAnswer';
import { dashboardBlocksUpdateTool, getDashboardBlocksToolFormatGuidance } from './helpers/DashboardUpdateToolBuilder';
import type { AgentTool } from '@/service/tools/types';
import { safeAgentTool } from '@/service/tools/types';
import {
    buildPromptTraceDebugEvent,
    streamTransform,
    withRetryStream,
} from '@/core/providers/helpers/stream-helper';
import { AgentContextManager, AgentMemoryToolSet } from './AgentContextManager';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';

type BlocksUpdateToolSet = AgentMemoryToolSet & {
    add_dashboard_blocks: AgentTool;
    read_dashboard_blocks: AgentTool;
}

export interface DashboardBlockVariables {
    /** User's original query; output must use the same language. */
    originalQuery: string;
    /** Numbered confirmed facts (Fact #1, #2, ...) from slot/dossier. */
    confirmedFacts: string;
    blockPlan: string[];
    currentDashboardBlocks?: string;
}

/**
 * Agent for updating dashboard blocks. Uses slot/dossier confirmed facts and search_analysis_context, get_full_content.
 */
export class DashboardBlocksAgent {
    private readonly aiServiceManager: AIServiceManager;
    private readonly context: AgentContextManager;
    private agent: Agent<BlocksUpdateToolSet>;

    constructor(params: {
        aiServiceManager: AIServiceManager;
        context: AgentContextManager;
    }) {
        this.aiServiceManager = params.aiServiceManager;
        this.context = params.context;

        const tools: BlocksUpdateToolSet = {
            ...this.context.getAgentMemoryTool(),
            read_dashboard_blocks: safeAgentTool({
                description: 'Read current dashboard blocks. Useful when you forget what blocks you have already added.',
                inputSchema: submitFinalAnswerInputSchema,
                execute: async () => {
                    return this.context.getAgentResult().dashboardBlocks;
                },
            }),
            add_dashboard_blocks: dashboardBlocksUpdateTool(),
        };

        const { provider, modelId } = this.aiServiceManager.getModelForPrompt(PromptId.AiAnalysisDashboardUpdateBlocks);
        this.agent = new Agent<BlocksUpdateToolSet>({
            model: this.aiServiceManager.getMultiChat().getProviderService(provider).modelClient(modelId),
            tools,
        });
    }

    /**
     * @param reviewFeedback When present (e.g. from previous Review agent run), injected as lastAttemptErrorMessages so this run addresses the gap.
     */
    public async *stream(
        blockPlan: string[],
        stepId?: string,
        reviewFeedback?: string,
    ): AsyncGenerator<LLMStreamEvent> {
        yield* withRetryStream(
            {},
            (_, retryCtx) =>
                this.realStreamInternal(blockPlan, retryCtx, stepId, reviewFeedback),
            { triggerName: StreamTriggerName.SEARCH_DASHBOARD_UPDATE_AGENT },
        );
    }

    private async *realStreamInternal(
        blockPlan: string[],
        errorRetryInfo?: ErrorRetryInfo,
        stepId?: string,
        reviewFeedback?: string,
    ): AsyncGenerator<LLMStreamEvent> {
        const promptInfo = await this.aiServiceManager.getPromptInfo(PromptId.AiAnalysisDashboardUpdateBlocks);
        const originalQuery = this.context.getInitialPrompt() ?? '';
        const system = await this.aiServiceManager.renderPrompt(promptInfo.systemPromptId!, {});
        const hasDashboardBlocks = this.context.getAgentResult().dashboardBlocks?.length ?? 0 > 0;
        const dossier = this.context.getDossierForSummary();
        const confirmedFactsList = dossier.confirmedFacts ?? [];
        const confirmedFacts = confirmedFactsList.length
            ? confirmedFactsList.map((f, i) => `Fact #${i + 1}: ${f}`).join('\n')
            : '(No confirmed facts yet; use search_analysis_context and get_full_content with source map paths.)';
        const effectiveRetryInfo =
            errorRetryInfo ??
            (reviewFeedback
                ? { attemptTimes: 1, lastAttemptErrorMessages: reviewFeedback }
                : undefined);
        const promptVars: PromptVariables[typeof PromptId.AiAnalysisDashboardUpdateBlocks] = {
            originalQuery,
            blockPlan,
            confirmedFacts,
            currentDashboardBlocks: hasDashboardBlocks ? JSON.stringify(this.context.getAgentResult().dashboardBlocks) : undefined,
            ...(effectiveRetryInfo ? { errorRetryInfo: effectiveRetryInfo } : {}),
            toolFormatGuidance: getDashboardBlocksToolFormatGuidance(),
        } as PromptVariables[typeof PromptId.AiAnalysisDashboardUpdateBlocks];

        const prompt = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisDashboardUpdateBlocks, promptVars);

        stepId = stepId ?? generateUuidWithoutHyphens();
        yield {
            type: 'ui-step',
            uiType: UIStepType.STEPS_DISPLAY,
            stepId,
            title: 'Updating dashboard blocks...',
            description: 'Updating dashboard blocks',
            triggerName: StreamTriggerName.SEARCH_DASHBOARD_UPDATE_AGENT,
        }
        yield buildPromptTraceDebugEvent(
            StreamTriggerName.SEARCH_DASHBOARD_UPDATE_AGENT,
            system,
            prompt
        );

        const result = this.agent.stream({ system, prompt });
        yield* streamTransform(result.fullStream, StreamTriggerName.SEARCH_DASHBOARD_UPDATE_AGENT, {
            yieldUIStep: { uiType: UIStepType.STEPS_DISPLAY, stepId: stepId },
            yieldEventPostProcessor: (chunk: any) => {
                if (chunk.type === 'tool-result') {
                    if (chunk.toolName === 'add_dashboard_blocks') {
                        return this.context.yieldAgentResult();
                    }
                }
                return {};
            },
        });
    }
}
