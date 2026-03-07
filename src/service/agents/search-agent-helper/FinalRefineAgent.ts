import { Experimental_Agent as Agent } from 'ai';
import { AIServiceManager } from '@/service/chat/service-manager';
import { LLMStreamEvent, StreamTriggerName, UIStepType } from '@/core/providers/types';
import { PromptId } from '@/service/prompt/PromptId';
import type { AISearchSource, AnalysisMode } from '../AISearchAgent';
import {
    sourcesUpdateTool,
    updateSourceScoresTool,
    getSourcesToolFormatGuidance,
    getGraphToolFormatGuidance,
} from './helpers/DashboardUpdateToolBuilder';
import type { AgentTool } from '@/service/tools/types';
import { buildPromptTraceDebugEvent, streamTransform } from '@/core/providers/helpers/stream-helper';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import { AgentContextManager, AgentMemoryToolSet } from './AgentContextManager';

/**
 * Refine modes for FinalRefineAgent.
 * - sources_scores_only: Batch update scores without reasoning.
 * - sources_full_only: Full source refinement with reasoning (top sources by score).
 * - full: Both sources and graph refinement.
 */
export enum RefineMode {
    SOURCES_SCORES_ONLY = 'sources_scores_only',
    SOURCES_FULL_ONLY = 'sources_full_only',
    FULL = 'full',
}

/** Number of refine rounds for sources + graph. */
export const REFINE_ROUNDS = 1;

/** Batch size for sources refinement. */
export const REFINE_SOURCES_BATCH_SIZE = 12;

/** Score threshold calculation methods for selecting high-value sources. */
export type ScoreThresholdMethod = 'median' | 'mean' | 'percentile';

/**
 * Calculate score threshold using specified method.
 * Sources with score >= threshold will be selected for full refinement.
 */
export function calculateScoreThreshold(
    scores: number[],
    method: ScoreThresholdMethod = 'median',
    percentile: number = 50,
): number {
    if (scores.length === 0) return 0;
    const sorted = [...scores].sort((a, b) => a - b);

    switch (method) {
        case 'median': {
            const mid = Math.floor(sorted.length / 2);
            return sorted.length % 2 === 0
                ? (sorted[mid - 1] + sorted[mid]) / 2
                : sorted[mid];
        }
        case 'mean': {
            return scores.reduce((sum, s) => sum + s, 0) / scores.length;
        }
        case 'percentile': {
            const idx = Math.ceil((percentile / 100) * sorted.length) - 1;
            return sorted[Math.max(0, idx)];
        }
        default:
            return sorted[Math.floor(sorted.length / 2)];
    }
}

type FinalRefineToolSet = AgentMemoryToolSet & {
    search_analysis_context: AgentTool;
    update_sources?: AgentTool;
    update_source_scores?: AgentTool;
};

export type FinalSourcesScoreRefineContext = {
    sources: string;
}

export type FinalSourcesReasonRefineContext = {
    sources: string;
}

export type FinalRefineContext = (FinalSourcesScoreRefineContext | FinalSourcesReasonRefineContext) & {
    analysisMode: AnalysisMode;
    originalQuery: string;
    /** Verified fact sheet (evidence pack) for scoring/refining sources; from context.getVerifiedFactSheet(). */
    evidencePack: string;
};

/**
 * Single LLM pass to refine sources (reorder, add reasoning) and graph (add concept/tag nodes and edges).
 * Emits graph updates as one-patch-per-node so the UI can animate node-by-node.
 * Uses getModelForPrompt(AiAnalysisFinalRefine).
 * @deprecated
 */
export class FinalRefineAgent {
    private readonly aiServiceManager: AIServiceManager;
    private readonly context: AgentContextManager;

    private sourceScoreAgent: Agent<FinalRefineToolSet>;
    private sourceReasonAgent: Agent<FinalRefineToolSet>;

    constructor(params: {
        aiServiceManager: AIServiceManager;
        context: AgentContextManager;
    }) {
        this.aiServiceManager = params.aiServiceManager;
        this.context = params.context;

        const { provider, modelId } = this.aiServiceManager.getModelForPrompt(PromptId.AiAnalysisFinalRefineSourceScores);
        this.sourceScoreAgent = new Agent<FinalRefineToolSet>({
            model: this.aiServiceManager.getMultiChat()
                .getProviderService(provider)
                .modelClient(modelId),
            tools: {
                ...this.context.getAgentMemoryTool(),
                update_source_scores: updateSourceScoresTool(),
            },
        });

        const { provider: provider2, modelId: modelId2 } = this.aiServiceManager.getModelForPrompt(PromptId.AiAnalysisFinalRefineSources);
        this.sourceReasonAgent = new Agent<FinalRefineToolSet>({
            model: this.aiServiceManager.getMultiChat()
                .getProviderService(provider2)
                .modelClient(modelId2),
            tools: {
                ...this.context.getAgentMemoryTool(),
                update_sources: sourcesUpdateTool(),
            },
        });
    }

    /**
     * Stream a single refine step.
     * @param refineMode Which mode to use.
     */
    public async *stream(
        variables: FinalRefineContext,
        opts?: {
            stepId?: string;
            refineMode?: RefineMode;
        }
    ): AsyncGenerator<LLMStreamEvent> {
        const stepId = opts?.stepId ?? generateUuidWithoutHyphens();
        const refineMode = opts?.refineMode ?? RefineMode.FULL;

        const { systemPromptId, promptId, promptVars, agent } = this.getRefinePromptConfig(refineMode, variables);
        const promptInfo = await this.aiServiceManager.getPromptInfo(promptId);
        const system = await this.aiServiceManager.renderPrompt(promptInfo.systemPromptId ?? systemPromptId, {});
        const prompt = await this.aiServiceManager.renderPrompt(promptId, promptVars as any);

        yield buildPromptTraceDebugEvent(
            StreamTriggerName.SEARCH_FINAL_REFINE_AGENT,
            system,
            prompt
        );

        const result = agent.stream({ system, prompt });

        yield* streamTransform(result.fullStream, StreamTriggerName.SEARCH_FINAL_REFINE_AGENT, {
            yieldUIStep: { uiType: UIStepType.STEPS_DISPLAY, stepId },
            yieldEventPostProcessor: (chunk: any) => {
                if (chunk.type === 'tool-result') {
                    if (chunk.toolName === 'update_sources' || chunk.toolName === 'update_source_scores') {
                        return this.context.yieldAgentResult();
                    }
                }
                return {};
            }
        });
    }

    /** No-op: slot pipeline uses AgentContextManager slot storage for evidence; legacy dossier hole-fill removed. */
    public async *streamHoleFill(_opts?: { analysisMode?: AnalysisMode }): AsyncGenerator<LLMStreamEvent> {
        const stepId = generateUuidWithoutHyphens();
        yield {
            type: 'ui-step',
            uiType: UIStepType.STEPS_DISPLAY,
            stepId,
            title: 'Filling evidence gaps…',
            description: '',
            triggerName: StreamTriggerName.SEARCH_FINAL_REFINE_AGENT,
        };
    }

    /**
     * Multi-round refine: score all sources, then refine top sources (by adaptive threshold).
     * Encapsulates the loop logic previously in AISearchAgent.streamFullAnalysis.
     */
    public async *streamSourcesRefine(
        opts?: {
            scoreThresholdMethod?: ScoreThresholdMethod;
            /** Minimum percentile to include (e.g., 50 = top 50%). Default 50. */
            minPercentile?: number;
            analysisMode?: AnalysisMode;
        },
    ): AsyncGenerator<LLMStreamEvent> {
        const {
            scoreThresholdMethod = 'median',
            minPercentile = 50,
            analysisMode = 'vaultFull',
        } = opts ?? {};
        const stepId = generateUuidWithoutHyphens();
        const evidencePack = this.context.getVerifiedFactSheet().join('\n') || '(No verified facts yet.)';

        const sources = this.context.getSources();
        const totalSources = sources.length;

        // Phase 1: batch source scores (no reasoning)
        if (totalSources > 0) {
            yield* this.streamSingleRefineStep(
                stepId,
                'Scoring sources…',
                RefineMode.SOURCES_SCORES_ONLY,
                {
                    analysisMode,
                    originalQuery: this.context.getInitialPrompt(),
                    sources: JSON.stringify(sources),
                    evidencePack,
                },
            );
        }

        // Get current sources and refine those above the adaptive threshold
        const currentSources = this.context.getSources();
        if (currentSources.length <= 0) {
            return;
        }
        const topSourceIndices = this.selectTopSourceIndices(
            currentSources,
            scoreThresholdMethod,
            minPercentile,
        );
        if (topSourceIndices.length <= 0) {
            return;
        }
        const selectedSources = topSourceIndices
            .map((i) => currentSources[i])
            .filter((s) => (s.score?.average ?? 0) > 0);
        if (selectedSources.length <= 0) {
            return;
        }

        // Phase 2: refine top sources only. We only refine sources that are above the adaptive threshold, which is more efficient and meaningful.
        yield* this.streamSingleRefineStep(
            stepId,
            `Refining ${selectedSources.length} sources…`,
            RefineMode.SOURCES_FULL_ONLY,
            {
                analysisMode,
                originalQuery: this.context.getInitialPrompt(),
                sources: JSON.stringify(selectedSources),
                evidencePack,
            },
        );
    }

    /**
     * Select source indices that are above the adaptive score threshold.
     */
    private selectTopSourceIndices(
        sources: AISearchSource[],
        method: ScoreThresholdMethod,
        minPercentile: number,
    ): number[] {
        const scores = sources.map((s) => s.score?.average ?? 0);
        const threshold = calculateScoreThreshold(scores, method, minPercentile);
        const indices: number[] = [];
        for (let i = 0; i < sources.length; i++) {
            if ((sources[i].score?.average ?? 0) >= threshold) {
                indices.push(i);
            }
        }
        return indices;
    }

    /**
     * Single refine step with UI events.
     */
    private async *streamSingleRefineStep(
        stepId: string,
        stepTitle: string,
        refineMode: RefineMode,
        variables: FinalRefineContext,
    ): AsyncGenerator<LLMStreamEvent> {
        yield {
            type: 'ui-step',
            uiType: UIStepType.STEPS_DISPLAY,
            stepId,
            title: stepTitle,
            description: this.getRefineStepDescription(refineMode),
            triggerName: StreamTriggerName.SEARCH_FINAL_REFINE_AGENT,
        };

        yield* this.stream(variables, { stepId, refineMode });
    }

    private getRefineStepDescription(mode: RefineMode): string {
        switch (mode) {
            case RefineMode.SOURCES_SCORES_ONLY:
                return 'Scoring sources…';
            case RefineMode.SOURCES_FULL_ONLY:
                return 'Refining sources…';
            default:
                return 'Refining results…';
        }
    }

    /** Resolve prompt IDs and variables based on refine mode. */
    private getRefinePromptConfig(
        mode: RefineMode,
        variables: FinalRefineContext,
    ): {
        systemPromptId: PromptId;
        promptId: PromptId;
        promptVars: Record<string, unknown>;
        toolFormatGuidance: string;
        agent: Agent<FinalRefineToolSet>;
    } {
        switch (mode) {
            case RefineMode.SOURCES_SCORES_ONLY:
                return {
                    systemPromptId: PromptId.AiAnalysisFinalRefineSourceScoresSystem,
                    promptId: PromptId.AiAnalysisFinalRefineSourceScores,
                    promptVars: { ...variables },
                    toolFormatGuidance: '',
                    agent: this.sourceScoreAgent,
                };
            case RefineMode.SOURCES_FULL_ONLY:
                return {
                    systemPromptId: PromptId.AiAnalysisFinalRefineSourcesSystem,
                    promptId: PromptId.AiAnalysisFinalRefineSources,
                    promptVars: { ...variables, toolFormatGuidance: getSourcesToolFormatGuidance() },
                    toolFormatGuidance: getSourcesToolFormatGuidance(),
                    agent: this.sourceReasonAgent,
                };
            default: {
                const fullGuidance = [getSourcesToolFormatGuidance(), getGraphToolFormatGuidance()].join('\n\n');
                return {
                    systemPromptId: PromptId.AiAnalysisFinalRefineSystem,
                    promptId: PromptId.AiAnalysisFinalRefine,
                    promptVars: { ...variables, toolFormatGuidance: fullGuidance, refineMode: undefined },
                    toolFormatGuidance: fullGuidance,
                    agent: this.sourceReasonAgent,
                };
            }
        }
    }
}
