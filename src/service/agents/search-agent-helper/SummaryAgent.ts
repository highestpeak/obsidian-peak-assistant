import { Experimental_Agent as Agent, type LanguageModel, type ModelMessage, type PrepareStepResult, type StepResult } from 'ai';
import { AIServiceManager } from '@/service/chat/service-manager';
import { LLMStreamEvent, StreamTriggerName, UIStepType } from '@/core/providers/types';
import { PromptId } from '@/service/prompt/PromptId';
import type { AgentContextManager, AgentMemoryToolSet } from './AgentContextManager';
import { buildPromptTraceDebugEvent, streamTransform } from '@/core/providers/helpers/stream-helper';
import { AgentTool, safeAgentTool } from '@/service/tools/types';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import { EvidenceMermaidOverviewWeaveAgent } from './EvidenceMermaidOverviewWeaveAgent';
import { uiStageSignal } from './helpers/search-ui-events';
import { DocumentLoaderManager } from '@/core/document/loader/helper/DocumentLoaderManager';
import type { DashboardBlock } from '../AISearchAgent';
import { z } from 'zod/v3';

/** Min character length for collected summary text to consider "enough" and skip prepareStep injection. */
const MIN_SUMMARY_LENGTH = 200;

type SummaryToolSet = AgentMemoryToolSet & {
    get_full_content: AgentTool;
    read_block_content: AgentTool;
};

export interface AiSummaryVariables {
    originalQuery: string;
    /** User query to answer (may equal originalQuery; keep naming consistent with other prompts). */
    userQuery: string;
    /** Optional Mermaid overview (high-level map) to guide narrative. */
    mermaidOverview?: string;
    /** Optional dashboard/report plan so Summary knows upcoming blocks and can reference them naturally. */
    dashboardBlockPlan?: string;
}

/**
 * Produces the comprehensive synthesis summary. Uses an Agent with tools to fetch
 * dashboard state, thought history, and block content before writing the summary.
 */
export class SummaryAgent {
    private readonly aiServiceManager: AIServiceManager;
    private readonly context: AgentContextManager;
    private summaryAgent: Agent<SummaryToolSet>;
    private mermaidOverviewAgent: EvidenceMermaidOverviewWeaveAgent;

    /** Accumulated summary text from stream; length used by prepareStep to decide if more output is needed. */
    private _summaryCollector: string[] = [];

    constructor(params: {
        aiServiceManager: AIServiceManager;
        context: AgentContextManager;
    }) {
        this.aiServiceManager = params.aiServiceManager;
        this.context = params.context;
        this.mermaidOverviewAgent = new EvidenceMermaidOverviewWeaveAgent(params);

        const { provider, modelId } = this.aiServiceManager.getModelForPrompt(PromptId.AiAnalysisSummary);
        const model = this.aiServiceManager.getMultiChat().getProviderService(provider).modelClient(modelId);
        const self = this;
        this.summaryAgent = new Agent<SummaryToolSet>({
            model,
            prepareStep: (options: { steps: StepResult<SummaryToolSet>[]; stepNumber: number; model: LanguageModel; messages: ModelMessage[] }): PrepareStepResult<SummaryToolSet> => {
                const totalLen = self._summaryCollector.reduce((sum, s) => sum + (s?.length ?? 0), 0);
                if (totalLen >= MIN_SUMMARY_LENGTH) return { ...options };
                const requireOutput: ModelMessage = {
                    role: 'user',
                    content:
                        'Before ending, you must eventually output a full summary in natural language (so we have a report if the session is interrupted). Keep using tools to enrich the content when needed; do not finish with only tool calls—write the detailed report in a future turn.',
                };
                return { ...options, messages: [...options.messages, requireOutput] };
            },
            tools: {
                ...this.context.getAgentMemoryTool(),
                get_full_content: safeAgentTool({
                    description:
                        'Read full content of a verified path (from the dossier). Use only when: (1) snippet is cut off or has [REDACTED], or (2) data lacks critical context (time range, object). Max 3 calls. Do not use for new discovery.',
                    inputSchema: z.object({ path: z.string().describe('Vault-relative path already present in Verified Fact Sheet as [[path]]') }),
                    execute: async ({ path }) => {
                        const p = (path ?? '').trim();
                        const allowed = self.context.getVerifiedPaths();
                        if (!p || !allowed.has(p)) {
                            return { content: 'Path not verified. Use only paths already present in the Verified Fact Sheet.' };
                        }
                        try {
                            const doc = await DocumentLoaderManager.getInstance().readByPath(p, true);
                            const content = doc?.cacheFileInfo?.content ?? doc?.sourceFileInfo?.content ?? '';
                            return { content: typeof content === 'string' ? content : String(content) };
                        } catch (e) {
                            return { content: `Error reading path: ${e instanceof Error ? e.message : String(e)}` };
                        }
                    },
                }),
                read_block_content: safeAgentTool({
                    description:
                        'Read one dashboard block by id. Use when you need details to cite or to create a jump link (Summary should act as navigator).',
                    inputSchema: z.object({ blockId: z.string().describe('Block id, e.g. block:xxx from current dashboard') }),
                    execute: async ({ blockId }) => {
                        const blocks: DashboardBlock[] = self.context.getDashboardBlocks();
                        const block = blocks.find((b) => b.id === blockId || b.id?.endsWith?.(blockId));
                        if (!block) {
                            return {
                                content: `Block not found: ${blockId}. Current block ids: ${blocks.map((b) => b.id).join(', ') || '(none)'}.`,
                            };
                        }
                        const parts: string[] = [`Title: ${block.title ?? '(untitled)'}`, `Engine: ${block.renderEngine ?? 'MARKDOWN'}`];
                        if (block.markdown) parts.push(`Content:\n${block.markdown}`);
                        if (block.mermaidCode) parts.push(`Mermaid:\n${block.mermaidCode}`);
                        if (block.items?.length) parts.push(`Items: ${block.items.map((i) => i.title ?? i.id).join('; ')}`);
                        return { content: parts.join('\n\n') };
                    },
                }),
            },
        });
    }

    public async *streamMultiStep(
        opts: {
            streamTitle?: boolean;
            streamSummary?: boolean;
            streamMermaidOverview?: boolean;
        }
    ): AsyncGenerator<LLMStreamEvent> {
        const stepId = generateUuidWithoutHyphens();
        if (opts.streamTitle) {
            yield* this.streamTitle({ stepId });
        }
        if (opts.streamSummary) {
            yield* this.streamSummary({ stepId });
        }
        if (opts.streamMermaidOverview) {
            yield* this.streamMermaidOverview({ stepId });
        }
    }

    /**
     * Generate and set context title (used for save filename, recent list, folder suggestion).
     */
    public async *streamTitle(
        opts?: { stepId?: string }
    ): AsyncGenerator<LLMStreamEvent> {
        const stepId = opts?.stepId ?? generateUuidWithoutHyphens();
        yield {
            type: 'ui-step',
            uiType: UIStepType.STEPS_DISPLAY,
            stepId,
            title: 'Summarizing the analysis...',
            triggerName: StreamTriggerName.SEARCH_TITLE,
        };

        const stream = this.aiServiceManager.chatWithPromptStream(PromptId.AiAnalysisTitle, {
            query: this.context.getInitialPrompt() ?? '',
            summary: this.context.getVerifiedFactSheet().join('\n').slice(0, 500) ?? '',
        });
        for await (const chunk of stream) {
            if (chunk.type === 'prompt-stream-result') {
                this.context.setTitle(String(chunk.output ?? '').trim() || undefined);
            }
            yield { ...chunk, triggerName: StreamTriggerName.SEARCH_TITLE };
        }
    }

    /**
     * Run summary agent with tools; collect all text-delta as the final summary.
     */
    public async *streamSummary(
        opts?: { stepId?: string }
    ): AsyncGenerator<LLMStreamEvent> {
        const stepId = opts?.stepId ?? generateUuidWithoutHyphens();
        const summaryMeta = { runStepId: stepId, stage: 'summary' as const, agent: 'SummaryAgent' };
        yield uiStageSignal(summaryMeta, { status: 'start', triggerName: StreamTriggerName.SEARCH_SUMMARY });
        yield {
            type: 'ui-step',
            uiType: UIStepType.STEPS_DISPLAY,
            stepId,
            title: 'Summarizing the analysis...',
            triggerName: StreamTriggerName.SEARCH_SUMMARY,
        };

        this._summaryCollector = [];
        const promptInfo = await this.aiServiceManager.getPromptInfo(PromptId.AiAnalysisSummary);
        const system = await this.aiServiceManager.renderPrompt(promptInfo.systemPromptId!, {});
        const prompt = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisSummary, {
            originalQuery: this.context.getInitialPrompt() ?? '',
            userQuery: this.context.getInitialPrompt() ?? '',
            mermaidOverview: this.context.getEvidenceWeavedMermaidOverview() || undefined,
            dashboardBlockPlan: this.context.buildDashboardBlockPlanMarkdown(),
            verifiedFactSheet: this.context.getVerifiedFactSheet().join('\n'),
            dashboardBlockIds: this.context.getDashboardBlocks().map((b) => b.id).filter(Boolean).join(', '),
            userPersonaConfig: this.context.getUserPersonaConfig() ?? undefined,
        });

        yield buildPromptTraceDebugEvent(StreamTriggerName.SEARCH_SUMMARY, system, prompt);

        const result = this.summaryAgent.stream({ system, prompt });
        yield* streamTransform(result.fullStream, StreamTriggerName.SEARCH_SUMMARY, {
            yieldUIStep: { uiType: UIStepType.STEPS_DISPLAY, stepId },
            yieldEventPostProcessor: (chunk: any) => {
                if (chunk.type === 'text-delta') {
                    this._summaryCollector.push(chunk.text ?? (chunk as any).textDelta ?? '');
                }
                return chunk;
            },
        });

        this.context.setSummary(this._summaryCollector.join(''));
        yield uiStageSignal(summaryMeta, { status: 'complete', triggerName: StreamTriggerName.SEARCH_SUMMARY });
    }

    public async *streamMermaidOverview(
        opts?: { stepId?: string }
    ): AsyncGenerator<LLMStreamEvent> {
        yield* this.mermaidOverviewAgent.stream(
            opts
        );
    }
}
