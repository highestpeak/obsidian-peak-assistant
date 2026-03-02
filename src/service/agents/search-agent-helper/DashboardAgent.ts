import { Experimental_Agent as Agent } from 'ai';
import {
    submitBlocksPlanInputSchema,
    submitTopicsPlanInputSchema,
} from '@/core/schemas/agents';
import { LLMStreamEvent, StreamTriggerName, UIStepType } from '@/core/providers/types';
import { buildPromptTraceDebugEvent, streamTransform } from '@/core/providers/helpers/stream-helper';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { PromptId } from '@/service/prompt/PromptId';
import { TopicsUpdateAgent } from './TopicsUpdateAgent';
import { DashboardBlocksAgent } from './DashboardBlocksAgent';
import { ReviewBlocksAgent } from './ReviewBlocksAgent';
import { getFileNameFromPath, normalizeFilePath } from '@/core/utils/file-utils';
import { AgentContextManager } from './AgentContextManager';
import { RawSearchAgent } from './RawSearchAgent';
import { FollowUpQuestionAgent } from './FollowUpQuestionAgent';
import { AgentTool, safeAgentTool } from '@/service/tools/types';

export type DashboardUpdatePlan = {
    topicsPlan: string[];
    blockPlan: string[];
};

const STREAMING_SOURCE_TOP_K = 20;

/** Plan agent has no search/memory tools—only plan submission. Search is delegated to Blocks agent. */
export type BlockPlanAgentToolSet = {
    submit_topics_plan: AgentTool;
    submit_blocks_plan: AgentTool;
};

export type DashboardUpdateContext = {
    /** User's original query; plan instructions must be in the same language. */
    originalQuery: string;
    verifiedPaths: string[];
    /** Numbered confirmed facts (Fact #1, #2, ...) for evidence binding in blockPlan. */
    confirmedFacts?: string;
    /** When present, planner must address this gap in the next plan (from Review agent). */
    lastReviewGapMessage?: string;
    /** Current dashboard blocks JSON; used for gap-first diff against confirmedFacts. */
    currentDashboardBlocks?: string;
};

/**
 * Central orchestrator for dashboard update flow: topics, sources, graph, blocks, review.
 * Consolidates logic so AISearchAgent only needs this single entry point.
 */
export class DashboardAgent {
    private readonly blockPlanAgent: Agent<BlockPlanAgentToolSet>;
    private readonly topicsAgent: TopicsUpdateAgent;
    private readonly blocksAgent: DashboardBlocksAgent;
    private readonly reviewAgent: ReviewBlocksAgent;
    private readonly followUpQuestionAgent: FollowUpQuestionAgent;

    private readonly context: AgentContextManager;
    private readonly aiServiceManager: AIServiceManager;

    /** Last plan from runDashboardUpdate; passed to streamReview so review can reference blockPlan. */
    private lastPlan: DashboardUpdatePlan = { topicsPlan: [], blockPlan: [] };
    /** Review agent feedback from previous round when we are in a retry loop. */
    private lastReviewGapMessage: string | undefined;
    /** Fallback plan when planner returns empty arrays. */
    private static readonly FALLBACK_PLAN: DashboardUpdatePlan = {
        topicsPlan: ['Add at least 10 topics from full session evidence'],
        blockPlan: [
            'Add a synthesis block: conclusions, tradeoffs, and recommendations (MARKDOWN)',
            'Add an action/TODO block: concrete next steps or experiments (ACTION_GROUP or TILE)',
            'Add a Mermaid diagram block if evidence has structure (flow, comparison, hierarchy)',
        ],
    };

    constructor(params: {
        aiServiceManager: AIServiceManager;
        context: AgentContextManager;
        rawSearchAgent: RawSearchAgent;
    }) {
        const { aiServiceManager, context } = params;
        this.context = context;
        this.aiServiceManager = aiServiceManager;

        const { provider, modelId } = this.aiServiceManager.getModelForPrompt(PromptId.AiAnalysisDashboardUpdatePlan);
        const self = this;
        this.blockPlanAgent = new Agent<BlockPlanAgentToolSet>({
            model: this.aiServiceManager.getMultiChat()
                .getProviderService(provider)
                .modelClient(modelId),
            tools: {
                submit_topics_plan: safeAgentTool({
                    description: 'Submit the topics update plan.',
                    inputSchema: submitTopicsPlanInputSchema,
                    execute: async (input) => {
                        self.lastPlan.topicsPlan.push(...(input?.plan ?? []));
                    },
                }),
                submit_blocks_plan: safeAgentTool({
                    description: 'Submit the blocks update plan. Each plan item MUST reference Confirmed Facts by index (e.g. "Based on Fact #3 and #5") and, when applicable, include the data source path or vault path so the Blocks agent knows where to call_search_agent.',
                    inputSchema: submitBlocksPlanInputSchema,
                    execute: async (input) => {
                        self.lastPlan.blockPlan.push(...(input?.plan ?? []));
                    },
                }),
            },
        });

        this.topicsAgent = new TopicsUpdateAgent({ aiServiceManager, context });
        this.blocksAgent = new DashboardBlocksAgent({ aiServiceManager, context, rawSearchAgent: params.rawSearchAgent });
        this.reviewAgent = new ReviewBlocksAgent({ aiServiceManager, context });
        this.followUpQuestionAgent = new FollowUpQuestionAgent(params);
    }

    /** 
     * Emit placeholder sources and single-node graph patches for newly verified paths during search stream. 
     * */
    public async *emitStreamingSourcesFromVerifiedPaths(triggerName?: StreamTriggerName): AsyncGenerator<LLMStreamEvent> {
        const emittedSourcePaths = this.context.getEmittedSourcePaths();
        const existingSourcesPathsSet = new Set(
            this.context.getAgentResult().sources.map(s => (s.path ?? '').toLowerCase()).filter(Boolean)
        );

        const newPaths = Array.from(this.context.getVerifiedPaths())
            .filter((p) => !emittedSourcePaths.has(p))
            .slice(0, STREAMING_SOURCE_TOP_K);

        for (const path of newPaths) {
            const normPath = normalizeFilePath(path.trim());
            if (!normPath) continue;
            const lowerPath = normPath.toLowerCase();
            const title = getFileNameFromPath(normPath);

            emittedSourcePaths.add(path);

            // add sources
            if (!existingSourcesPathsSet.has(lowerPath)) {
                existingSourcesPathsSet.add(lowerPath);
                this.context.getAgentResult().sources.push({
                    id: `src:stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    title: title,
                    path: normPath,
                    // placeholder reasoning. will be replaced by the actual reasoning from refine agent
                    reasoning: 'From evidence during search (streaming).',
                    badges: [],
                    score: { average: 0, physical: 0, semantic: 0 },
                });
            }
        }

        // update sources
        yield {
            type: 'tool-result',
            id: `update_sources-${generateUuidWithoutHyphens()}`,
            toolName: 'update_sources',
            triggerName: triggerName ?? StreamTriggerName.SEARCH_SOURCES_FROM_VERIFIED_PATHS,
            ...this.context.yieldAgentResult(),
        };
    }

    /**
     * Dashboard update: plan (topicsPlan, sourcePlan, blockPlan), then stream topics + blocks.
     * Review is done by AISearchAgent.streamFullAnalysis.
     */
    public async *runDashboardUpdate(): AsyncGenerator<LLMStreamEvent> {
        const stepId = generateUuidWithoutHyphens();
        let needMoreDashboardBlocks = undefined;
        let generatingTimes = 0;
        this.lastReviewGapMessage = undefined;
        try {
            do {
                generatingTimes++;

                // plan (on retry, lastReviewGapMessage was set by previous review)
                yield* this.streamDashboardPlan(stepId);

                // topic
                if ((this.lastPlan.topicsPlan?.length ?? 0) > 0) {
                    yield* this.topicsAgent.stream(this.lastPlan.topicsPlan, stepId);
                } else {
                    // this should not happen
                    yield {
                        type: 'pk-debug',
                        debugName: 'no-topics-plan-found',
                        triggerName: StreamTriggerName.SEARCH_DASHBOARD_UPDATE_AGENT,
                    }
                }

                // block (pass review feedback on retry so Blocks agent fixes the same issues)
                if ((this.lastPlan.blockPlan?.length ?? 0) > 0) {
                    yield* this.blocksAgent.stream(
                        this.lastPlan.blockPlan,
                        stepId,
                        generatingTimes > 1 ? this.lastReviewGapMessage : undefined,
                    );
                } else {
                    // this should not happen
                    yield {
                        type: 'pk-debug',
                        debugName: 'no-blocks-plan-found',
                        triggerName: StreamTriggerName.SEARCH_DASHBOARD_UPDATE_AGENT,
                    }
                }

                // review blocks
                yield* this.reviewAgent.stream(stepId);
                needMoreDashboardBlocks = this.reviewAgent.getNeedMoreDashboardBlocksAndReset();
                this.lastReviewGapMessage = needMoreDashboardBlocks ?? undefined;

                // if need more dashboard blocks, we should generate again. but not more than 3 times.
            } while (needMoreDashboardBlocks && generatingTimes < 3);

            yield* this.streamFollowUpQuestions(stepId);
        } catch (e) {
            yield {
                type: 'pk-debug',
                debugName: 'dashboard-update-agent-error',
                triggerName: StreamTriggerName.SEARCH_DASHBOARD_UPDATE_AGENT,
                extra: { error: String(e) },
            } as LLMStreamEvent;
        } finally {
            yield this.uiStep(stepId, 'Dashboard Updated. ', 'Dashboard Updated', StreamTriggerName.SEARCH_DASHBOARD_UPDATE_AGENT);
        }
    }

    /**
     * Stream structured plan. Yields text-delta and on-step-finish.
     * Slim input: only originalQuery, verifiedPaths, confirmedFacts, lastReviewGapMessage, currentDashboardBlocks
     * (no full agentMemoryMessage / search process). When lastReviewGapMessage is set (retry), planner must address it.
     */
    private async *streamDashboardPlan(
        stepId: string,
    ): AsyncGenerator<LLMStreamEvent> {
        this.lastPlan = { topicsPlan: [], blockPlan: [] };
        yield this.uiStep(stepId, 'Updating dashboard (final)', 'Generating plan...', StreamTriggerName.SEARCH_DASHBOARD_UPDATE_AGENT);
        const promptInfo = await this.aiServiceManager.getPromptInfo(PromptId.AiAnalysisDashboardUpdatePlan);
        const originalQuery = this.context.getInitialPrompt() ?? '';
        const system = await this.aiServiceManager.renderPrompt(promptInfo.systemPromptId!, {});
        const dossier = this.context.getDossierForSummary();
        const confirmedFactsList = dossier.confirmedFacts ?? [];
        const confirmedFactsText = confirmedFactsList.length
            ? confirmedFactsList.map((f, i) => `${i + 1}. ${f}`).join('\n')
            : '';
        const currentBlocks = this.context.getAgentResult().dashboardBlocks;
        const currentDashboardBlocks =
            currentBlocks?.length ? JSON.stringify(currentBlocks) : undefined;
        const prompt = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisDashboardUpdatePlan, {
            originalQuery,
            verifiedPaths: Array.from(this.context.getVerifiedPaths()),
            confirmedFacts: confirmedFactsText || undefined,
            lastReviewGapMessage: this.lastReviewGapMessage,
            currentDashboardBlocks,
        });
        yield buildPromptTraceDebugEvent(StreamTriggerName.SEARCH_DASHBOARD_UPDATE_AGENT, system, prompt);
        const result = this.blockPlanAgent.stream({
            system, prompt,
        });
        yield* streamTransform(result.fullStream, StreamTriggerName.SEARCH_DASHBOARD_UPDATE_AGENT, {
            yieldUIStep: { uiType: UIStepType.STEPS_DISPLAY, stepId: stepId },
        });
        this.fillFallbackPlanIfNeed();
        yield this.uiStep(stepId, 'Dashboard Update Plan', '\nPlan: ' + JSON.stringify(this.lastPlan, null, 2), StreamTriggerName.SEARCH_DASHBOARD_UPDATE_AGENT);
    }

    private fillFallbackPlanIfNeed() {
        if (this.lastPlan.topicsPlan.length <= 0) {
            this.lastPlan.topicsPlan = DashboardAgent.FALLBACK_PLAN.topicsPlan;
        }
        if (this.lastPlan.blockPlan.length <= 0) {
            this.lastPlan.blockPlan = DashboardAgent.FALLBACK_PLAN.blockPlan;
        }
    }

    private uiStep(stepId: string, title: string, description: string, triggerName: StreamTriggerName): LLMStreamEvent {
        return {
            type: 'ui-step',
            uiType: UIStepType.STEPS_DISPLAY,
            stepId,
            title,
            description,
            triggerName,
        };
    }

    public async *streamFollowUpQuestions(
        stepId: string,
    ): AsyncGenerator<LLMStreamEvent> {
        stepId = stepId ?? generateUuidWithoutHyphens();
        try {
            yield* this.followUpQuestionAgent.stream(stepId);
        } catch (e) {
            console.warn('[AISearchAgent] Suggest follow-up questions failed; leaving empty.', e);
            this.context.getAgentResult().suggestedFollowUpQuestions = [];
        }
    }
}
