import { Experimental_Agent as Agent } from 'ai';
import { AIServiceManager } from '@/service/chat/service-manager';
import { LLMStreamEvent, StreamTriggerName, UIStepType } from '@/core/providers/types';
import { ErrorRetryInfo, PromptId, type PromptVariables } from '@/service/prompt/PromptId';
import type { UserPersonaConfig } from './AgentContextManager';
import { dashboardBlocksUpdateTool, getDashboardBlocksToolFormatGuidance } from './helpers/DashboardUpdateToolBuilder';
import type { AgentTool } from '@/service/tools/types';
import {
    buildPromptTraceDebugEvent,
    streamTransform,
    withRetryStream,
} from '@/core/providers/helpers/stream-helper';
import { AgentContextManager, AgentMemoryToolSet } from './AgentContextManager';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import { AgentTemplateId } from '@/core/template/TemplateRegistry';
import type { ReportBlockBlueprintItem } from './helpers/report-block-plan-weaver';
import { uiStageSignal, uiStepStart } from './helpers/search-ui-events';

type BlocksUpdateToolSet = AgentMemoryToolSet & {
    add_dashboard_blocks: AgentTool;
}

export interface DashboardBlockVariables {
    /** User's original query; output must use the same language. */
    originalQuery: string;
    /** Raw confirmed facts list; template formats as Fact #N. */
    confirmedFactsList: string[];
    blockPlan: string[];
}

/**
 * Agent for updating dashboard blocks. Translator mode: follows blockPlan strictly.
 * Allowed tools: search_analysis_context + content_reader (both from AgentContextManager) + add_dashboard_blocks.
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
     * @param promptOverride When provided (e.g. report body/appendices), use these prompts instead of AiAnalysisDashboardUpdateBlocks.
     */
    public async *stream(
        blockPlan: string[],
        stepId?: string,
        reviewFeedback?: string,
        promptOverride?: { promptId: PromptId; systemPromptId: PromptId },
    ): AsyncGenerator<LLMStreamEvent> {
        yield* withRetryStream(
            {},
            (_, retryCtx) =>
                this.realStreamInternal(blockPlan, retryCtx, stepId, reviewFeedback, promptOverride),
            { triggerName: StreamTriggerName.SEARCH_DASHBOARD_UPDATE_AGENT },
        );
    }

    /**
     * Stream one report block from a blueprint item. Renders the item to a single plan line internally, then runs the block writer.
     */
    public async *streamOneReportBlock(
        item: ReportBlockBlueprintItem,
        stepId?: string,
        reviewFeedback?: string,
        promptOverride?: { promptId: PromptId; systemPromptId: PromptId },
        runStepId?: string,
        blockId?: string,
    ): AsyncGenerator<LLMStreamEvent> {
        const blockMeta = runStepId && blockId != null
            ? { runStepId, stage: 'reportBlock' as const, lane: { laneType: 'block' as const, laneId: blockId }, agent: 'DashboardBlocksAgent' as const }
            : null;
        if (blockMeta) {
            yield uiStepStart(blockMeta, {
                title: `Report block: ${blockId}`,
                description: ('spec' in item && item.spec?.title) ? item.spec.title : blockId,
                triggerName: StreamTriggerName.SEARCH_DASHBOARD_UPDATE_AGENT,
            });
            yield uiStageSignal(blockMeta, { status: 'start', payload: { blockId }, triggerName: StreamTriggerName.SEARCH_DASHBOARD_UPDATE_AGENT });
        }
        const templateManager = this.aiServiceManager.getTemplateManager();
        let planLine: string;
        if (templateManager) {
            planLine = await templateManager.render(AgentTemplateId.ReportBlockBlueprintLine, { item });
        } else {
            planLine = JSON.stringify(item, null, 2);
        }
        const blockPlan = [planLine];
        yield* withRetryStream(
            {},
            (_, retryCtx) =>
                this.realStreamInternal(blockPlan, retryCtx, stepId, reviewFeedback, promptOverride),
            { triggerName: StreamTriggerName.SEARCH_DASHBOARD_UPDATE_AGENT },
        );
        if (blockMeta) {
            yield uiStageSignal(blockMeta, { status: 'complete', payload: { blockId: blockId! }, triggerName: StreamTriggerName.SEARCH_DASHBOARD_UPDATE_AGENT });
        }
    }

    /**
     * Stream one block from a single plan line (e.g. for DashboardAgent per-line execution).
     */
    public async *streamOnePlanLine(
        planLine: string,
        stepId?: string,
        reviewFeedback?: string,
    ): AsyncGenerator<LLMStreamEvent> {
        yield* withRetryStream(
            {},
            (_, retryCtx) =>
                this.realStreamInternal([planLine], retryCtx, stepId, reviewFeedback, undefined),
            { triggerName: StreamTriggerName.SEARCH_DASHBOARD_UPDATE_AGENT },
        );
    }

    private async *realStreamInternal(
        blockPlan: string[],
        errorRetryInfo?: ErrorRetryInfo,
        stepId?: string,
        reviewFeedback?: string,
        promptOverride?: { promptId: PromptId; systemPromptId: PromptId },
    ): AsyncGenerator<LLMStreamEvent> {
        const promptId = promptOverride?.promptId ?? PromptId.AiAnalysisDashboardUpdateBlocks;
        const promptInfo = await this.aiServiceManager.getPromptInfo(promptId);
        const systemPromptId = promptOverride?.systemPromptId ?? promptInfo.systemPromptId!;

        const effectiveRetryInfo =
            errorRetryInfo ??
            (reviewFeedback
                ? { attemptTimes: 1, lastAttemptErrorMessages: reviewFeedback }
                : undefined);
        const system = await this.aiServiceManager.renderPrompt(systemPromptId, {});
        const prompt = await this.aiServiceManager.renderPrompt(
            promptId,
            {
                originalQuery: this.context.getInitialPrompt() ?? '',
                confirmedFactsList: this.context.getConfirmedFacts(),
                blockPlan,
                ...(effectiveRetryInfo ? { errorRetryInfo: effectiveRetryInfo } : {}),
                toolFormatGuidance: getDashboardBlocksToolFormatGuidance(),
                userPersonaConfig: this.context.getUserPersonaConfig() ?? undefined
            }
        );

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
