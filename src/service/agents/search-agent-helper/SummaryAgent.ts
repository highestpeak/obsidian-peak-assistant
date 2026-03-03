import { Experimental_Agent as Agent, type LanguageModel, type ModelMessage, type PrepareStepResult, type StepResult } from 'ai';
import { AIServiceManager } from '@/service/chat/service-manager';
import { LLMStreamEvent, StreamTriggerName, UIStepType } from '@/core/providers/types';
import { PromptId } from '@/service/prompt/PromptId';
import type { AgentContextManager, AgentMemoryToolSet } from './AgentContextManager';
import { buildPromptTraceDebugEvent, streamTransform } from '@/core/providers/helpers/stream-helper';
import { AgentTool, safeAgentTool } from '@/service/tools/types';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import { MermaidOverviewAgent } from './MermaidOverviewAgent';
import { DocumentLoaderManager } from '@/core/document/loader/helper/DocumentLoaderManager';
import type { DashboardBlock } from '../AISearchAgent';
import { z } from 'zod/v3';

/** Min character length for collected summary text to consider "enough" and skip prepareStep injection. */
const MIN_SUMMARY_LENGTH = 200;

type SummaryToolSet = AgentMemoryToolSet & {
    get_full_content: AgentTool;
    read_block_content: AgentTool;
    get_thought_history: AgentTool;
};

export interface AiSummaryVariables {
    originalQuery: string;
    summary: string;
}

/**
 * Produces the comprehensive synthesis summary. Uses an Agent with tools to fetch
 * dashboard state, thought history, and block content before writing the summary.
 */
export class SummaryAgent {
    private readonly aiServiceManager: AIServiceManager;
    private readonly context: AgentContextManager;
    private summaryAgent: Agent<SummaryToolSet>;
    private mermaidOverviewAgent: MermaidOverviewAgent;

    /** Accumulated summary text from stream; length used by prepareStep to decide if more output is needed. */
    private _summaryCollector: string[] = [];

    constructor(params: {
        aiServiceManager: AIServiceManager;
        context: AgentContextManager;
    }) {
        this.aiServiceManager = params.aiServiceManager;
        this.context = params.context;
        this.mermaidOverviewAgent = new MermaidOverviewAgent(params);

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
                        'Read full content of a path from Source Map. Use when: (1) snippet is cut off or has [REDACTED], or (2) data (e.g. %, amount, legal) lacks context (time range, applicable object). Max 3 calls per run. Do not use for new discovery.',
                    inputSchema: z.object({ path: z.string().describe('Vault-relative path from the dossier Source Map') }),
                    execute: async ({ path }) => {
                        const p = (path ?? '').trim();
                        const allowed = self.context.getVerifiedPaths();
                        if (!p || !allowed.has(p)) {
                            return { content: 'Path not in dossier or verified list. Use only paths from the Source Map.' };
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
                        'Read one dashboard block by id. Use to align Summary with what Blocks already show (e.g. Mermaid, risk list). Required at least once so Summary acts as navigator linking blocks into one narrative.',
                    inputSchema: z.object({ blockId: z.string().describe('Block id, e.g. block:xxx from current dashboard') }),
                    execute: async ({ blockId }) => {
                        const blocks: DashboardBlock[] = self.context.getAgentResult().dashboardBlocks ?? [];
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
                get_thought_history: safeAgentTool({
                    description:
                        'Get coverage context: confirmed facts and gaps from the slot/dossier. Use to surface uncertainty or missing dimensions in the Summary.',
                    inputSchema: z.object({
                        stepIndex: z.number().optional().describe('Unused; kept for schema compatibility'),
                    }),
                    execute: async () => {
                        const d = self.context.getDossierForSummary();
                        const lines: string[] = [];
                        if (d.confirmedFacts?.length) lines.push('Confirmed facts: ' + d.confirmedFacts.join('; '));
                        if (d.gaps?.length) lines.push('Gaps (missing or partial): ' + d.gaps.join('; '));
                        return { content: lines.length ? lines.join('\n') : 'No thought history. Use verified fact sheet and source map.' };
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
     * Generate and set agentResult.title (used for save filename, recent list, folder suggestion).
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
            summary: this.context.getDossierForSummary().verifiedFactSheet?.slice(0, 500) ?? '',
        });
        for await (const chunk of stream) {
            if (chunk.type === 'prompt-stream-result') {
                this.context.getAgentResult().title = String(chunk.output ?? '').trim() || undefined;
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
        yield {
            type: 'ui-step',
            uiType: UIStepType.STEPS_DISPLAY,
            stepId,
            title: 'Summarizing the analysis...',
            triggerName: StreamTriggerName.SEARCH_SUMMARY,
        };

        this._summaryCollector = [];
        const promptInfo = await this.aiServiceManager.getPromptInfo(PromptId.AiAnalysisSummary);
        const originalQuery = this.context.getInitialPrompt() ?? '';
        const dossierForSummary = this.context.getDossierForSummary();
        const dashboardBlocks = this.context.getAgentResult().dashboardBlocks ?? [];
        const dashboardBlockIds = dashboardBlocks.length > 0
            ? dashboardBlocks.map((b) => b.id).filter(Boolean).join(', ')
            : undefined;
        const system = await this.aiServiceManager.renderPrompt(promptInfo.systemPromptId!, {});
        const prompt = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisSummary, {
            originalQuery,
            summary: '',
            verifiedFactSheet: dossierForSummary.verifiedFactSheet,
            sourceMap: dossierForSummary.sourceMap,
            lastDecision: dossierForSummary.lastDecision,
            dashboardBlockIds,
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

        this.context.getAgentResult().summary = this._summaryCollector.join('');
    }

    public async *streamMermaidOverview(
        opts?: { stepId?: string }
    ): AsyncGenerator<LLMStreamEvent> {
        yield* this.mermaidOverviewAgent.stream(
            opts
        );
    }
}
