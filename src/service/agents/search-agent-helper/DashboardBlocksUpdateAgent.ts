import { Experimental_Agent as Agent, stepCountIs } from 'ai';
import { AIServiceManager } from '@/service/chat/service-manager';
import { LLMStreamEvent, StreamTriggerName, UIStepType } from '@/core/providers/types';
import { ErrorRetryInfo, PromptId, type PromptVariables } from '@/service/prompt/PromptId';
import { submitFinalAnswerInputSchema } from '@/core/schemas/tools/submitFinalAnswer';
import { dashboardBlocksUpdateTool, getDashboardBlocksToolFormatGuidance } from './helpers/DashboardUpdateToolBuilder';
import type { AgentTool, ManualToolCallHandler } from '@/service/tools/types';
import { safeAgentTool } from '@/service/tools/types';
import {
    buildPromptTraceDebugEvent,
    streamTransform,
    withRetryStream,
} from '@/core/providers/helpers/stream-helper';
import { RawSearchAgent } from './RawSearchAgent';
import { AgentContextManager, AgentMemoryToolSet } from './AgentContextManager';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import { callAgentTool } from '@/service/tools/call-agent-tool';

const DEFAULT_MAX_STEPS = 18;

type BlocksUpdateToolSet = AgentMemoryToolSet & {
    call_search_agent: AgentTool;
    add_dashboard_blocks: AgentTool;
    read_dashboard_blocks: AgentTool;
}

export interface DashboardBlockVariables {
    agentMemoryMessage: string;
    blockPlan: string[];
    currentDashboardBlocks?: string;
}

/**
 * Agent for updating dashboard blocks. Uses RawSearchAgent (via call_search_agent) for vault search,
 * and search history tools (search_analysis_context, get_analysis_message_by_index) like SummaryAgent.
 */
export class DashboardBlocksUpdateAgent {
    private readonly aiServiceManager: AIServiceManager;
    private readonly context: AgentContextManager;
    private readonly rawSearchAgent: RawSearchAgent;
    /** Store for call_search_agent: execute awaits; manual handler resolves. Per-stream, set in realStreamInternal. */
    private readonly manualCallSearchAgent?: ManualToolCallHandler;

    private agent: Agent<BlocksUpdateToolSet>;

    constructor(
        params: {
            aiServiceManager: AIServiceManager;
            context: AgentContextManager;
            rawSearchAgent: RawSearchAgent;
        }
    ) {
        this.aiServiceManager = params.aiServiceManager;
        this.context = params.context;

        this.rawSearchAgent = params.rawSearchAgent;

        const tools: BlocksUpdateToolSet = {
            ...this.context.getAgentMemoryTool(),
            call_search_agent: callAgentTool('search'),
            read_dashboard_blocks: safeAgentTool({
                description: 'Read current dashboard blocks. usefull when you forget what blocks you have already added.',
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
            stopWhen: [stepCountIs(DEFAULT_MAX_STEPS)],
        });

        this.manualCallSearchAgent = {
            toolName: 'call_search_agent',
            triggerName: StreamTriggerName.SEARCH_INSPECTOR_AGENT,
            handle: this.rawSearchAgent.manualToolCallHandle.bind(this.rawSearchAgent),
            outputGetter: (resultCollector) => resultCollector.searchResultChunks,
        }
    }

    public async *stream(blockPlan: string[], stepId?: string): AsyncGenerator<LLMStreamEvent> {
        yield* withRetryStream({}, (_, retryCtx) => this.realStreamInternal(blockPlan, retryCtx, stepId));
    }

    private async *realStreamInternal(
        blockPlan: string[],
        errorRetryInfo?: ErrorRetryInfo,
        stepId?: string
    ): AsyncGenerator<LLMStreamEvent> {
        const promptInfo = await this.aiServiceManager.getPromptInfo(PromptId.AiAnalysisDashboardUpdateBlocks);
        const system = await this.aiServiceManager.renderPrompt(promptInfo.systemPromptId!, {});
        const hasDashboardBlocks = this.context.getAgentResult().dashboardBlocks?.length ?? 0 > 0;
        const promptVars: PromptVariables[typeof PromptId.AiAnalysisDashboardUpdateBlocks] = {
            blockPlan,
            agentMemoryMessage: this.context.getLatestMessageText(),
            currentDashboardBlocks: hasDashboardBlocks ? JSON.stringify(this.context.getAgentResult().dashboardBlocks) : undefined,
            ...(errorRetryInfo ? { errorRetryInfo } : {}),
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
            triggerName: StreamTriggerName.SEARCH_DASHBOARD_AGENT,
        }
        yield buildPromptTraceDebugEvent(
            StreamTriggerName.SEARCH_DASHBOARD_UPDATE_AGENT,
            system,
            prompt
        );

        const self = this;
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
            manualToolCallHandlers: {
                call_search_agent: self.manualCallSearchAgent!,
            },
        });
    }
}
