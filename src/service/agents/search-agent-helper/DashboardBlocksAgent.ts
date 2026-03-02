import { Experimental_Agent as Agent, LanguageModel, ModelMessage, PrepareStepResult, StepResult } from 'ai';
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
import { CALL_SEARCH_AGENT_OPTIONS } from '@/service/agents/search-agent-helper/RawSearchAgent';

type BlocksUpdateToolSet = AgentMemoryToolSet & {
    call_search_agent: AgentTool;
    add_dashboard_blocks: AgentTool;
    read_dashboard_blocks: AgentTool;
}

export interface DashboardBlockVariables {
    /** User's original query; output must use the same language. */
    originalQuery: string;
    /** Numbered confirmed facts (Fact #1, #2, ...). Only evidence source besides call_search_agent results. */
    confirmedFacts: string;
    blockPlan: string[];
    currentDashboardBlocks?: string;
}

/**
 * Agent for updating dashboard blocks. Uses RawSearchAgent (via call_search_agent) for vault search,
 * and search history tools (search_analysis_context, get_analysis_message_by_index) like SummaryAgent.
 */
/** Per-stream storage for call_search_agent results so prepareStep can inject them into agent messages. */
interface BlocksGenerationContext {
    toolResults: string[];
}

export class DashboardBlocksAgent {
    private readonly aiServiceManager: AIServiceManager;
    private readonly context: AgentContextManager;
    private readonly rawSearchAgent: RawSearchAgent;
    private readonly manualCallSearchAgent: ManualToolCallHandler;
    private agent: Agent<BlocksUpdateToolSet>;
    /** Accumulates call_search_agent results per stream; reset at start of realStreamInternal. */
    private blocksGenerationContext: BlocksGenerationContext = { toolResults: [] };

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
        const self = this;

        const tools: BlocksUpdateToolSet = {
            ...this.context.getAgentMemoryTool(),
            call_search_agent: callAgentTool('search', CALL_SEARCH_AGENT_OPTIONS),
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
            prepareStep: (options) => self.injectLastSearchResultIntoMessages(options),
        });

        this.manualCallSearchAgent = {
            toolName: 'call_search_agent',
            triggerName: StreamTriggerName.SEARCH_DASHBOARD_UPDATE_AGENT,
            handle: (chunkInput, resultCollector) =>
                this.rawSearchAgent.manualToolCallHandle(
                    {
                        prompt: chunkInput?.prompt ?? '',
                        userOriginalQuery: this.context.getInitialPrompt() ?? '',
                        currentThoughtInstruction: 'Dashboard blocks generation: gather evidence for the block plan.',
                        currentRawSearchCallReason: chunkInput?.reasoning_before_call,
                        existing_facts: this.context.getExistingFactClaimsForRawSearch().join('\n'),
                    },
                    resultCollector
                ),
            outputGetter: (resultCollector) => {
                const chunks = resultCollector.searchResultChunks;
                const str = chunks ? JSON.stringify(chunks) : '{}';
                this.blocksGenerationContext.toolResults.push(str);
                return str;
            },
        };
    }

    /**
     * Before each step (after the first), inject manual call_search_agent results into messages
     * so the model sees real raw search output instead of placeholders from callAgentTool execute().
     * Replaces each call_search_agent tool-result in order with toolResults[0], toolResults[1], ...
     */
    private injectLastSearchResultIntoMessages(options: {
        steps: Array<StepResult<BlocksUpdateToolSet>>;
        stepNumber: number;
        model: LanguageModel;
        messages: Array<ModelMessage>;
    }): PrepareStepResult<BlocksUpdateToolSet> {
        if (options.stepNumber < 1 || this.blocksGenerationContext.toolResults.length === 0) {
            return { ...options };
        }
        const results = this.blocksGenerationContext.toolResults;
        const messages = options.messages as Array<{ role: string; content?: unknown[] }>;
        let resultIndex = 0;
        const out = messages.map((m) => {
            if (m?.role !== 'tool' || !Array.isArray(m.content)) return m;
            const content = [...m.content];
            for (let i = 0; i < content.length && resultIndex < results.length; i++) {
                const p = content[i] as { type?: string; toolName?: string; output?: unknown };
                if (p?.type === 'tool-result' && p?.toolName === 'call_search_agent') {
                    content[i] = { ...p, output: results[resultIndex] };
                    resultIndex++;
                }
            }
            return { ...m, content };
        });
        return { ...options, messages: out as Array<ModelMessage> };
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
        this.blocksGenerationContext = { toolResults: [] };
        const promptInfo = await this.aiServiceManager.getPromptInfo(PromptId.AiAnalysisDashboardUpdateBlocks);
        const originalQuery = this.context.getInitialPrompt() ?? '';
        const system = await this.aiServiceManager.renderPrompt(promptInfo.systemPromptId!, {});
        const hasDashboardBlocks = this.context.getAgentResult().dashboardBlocks?.length ?? 0 > 0;
        const dossier = this.context.getDossierForSummary();
        const confirmedFactsList = dossier.confirmedFacts ?? [];
        const confirmedFacts = confirmedFactsList.length
            ? confirmedFactsList.map((f, i) => `Fact #${i + 1}: ${f}`).join('\n')
            : '(No confirmed facts yet; use search_analysis_context and call_search_agent to gather evidence.)';
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
                call_search_agent: self.manualCallSearchAgent,
            },
        });
    }
}
