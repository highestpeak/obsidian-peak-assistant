import { Experimental_Agent as Agent } from 'ai';
import { AIServiceManager } from '@/service/chat/service-manager';
import { LLMStreamEvent, StreamTriggerName, UIStepType } from '@/core/providers/types';
import { needMoreDashboardBlocksInputSchema } from '@/core/schemas/agents';
import { ErrorRetryInfo, PromptId, type PromptVariables } from '@/service/prompt/PromptId';
import { dashboardBlocksUpdateTool, getDashboardBlocksToolFormatGuidance } from './helpers/DashboardUpdateToolBuilder';
import { safeAgentTool, type AgentTool } from '@/service/tools/types';
import { buildErrorRetryInfo, buildPromptTraceDebugEvent, streamTransform, withRetryStream, type RetryContext } from '@/core/providers/helpers/stream-helper';
import { validateAnalysisData, validationReportToPromptText } from '@/core/utils/analysis-data-validator';
import { AgentContextManager, AgentMemoryToolSet } from './AgentContextManager';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';

type ReviewToolSet = AgentMemoryToolSet & {
	organize_dashboard_blocks: AgentTool;
	need_more_dashboard_blocks: AgentTool;
};

export interface ReviewBlocksVariables {
	/** User's original query; output must use the same language. */
	originalQuery: string;
	/** JSON string of current dashboard blocks for prompt display. */
	currentBlocksSnapshot: string;
	/** Gold standard: numbered confirmed facts. Every block claim must be traceable to these. */
	confirmedFacts?: string;
}

/**
 * Agent that reviews dashboard blocks: dedupe, merge, remove (by block.id), reorder; cap 6–8 blocks.
 * Uses getModelForPrompt(AiAnalysisReviewBlocks).
 */
export class ReviewBlocksAgent {
	private readonly aiServiceManager: AIServiceManager;
	private readonly context: AgentContextManager;

	private agent: Agent<ReviewToolSet>;

	private needMoreDashboardBlocks?: string;

	constructor(params: {
		aiServiceManager: AIServiceManager;
		context: AgentContextManager;
	}) {
		this.aiServiceManager = params.aiServiceManager;
		this.context = params.context;
		const { provider, modelId } = this.aiServiceManager.getModelForPrompt(PromptId.AiAnalysisReviewBlocks);
		const tools: ReviewToolSet = {
			...this.context.getAgentMemoryTool(),
			organize_dashboard_blocks: dashboardBlocksUpdateTool(),
			need_more_dashboard_blocks: safeAgentTool({
				description:
					'Call when blocks are insufficient or a high-value Confirmed Fact is missing from all blocks. You MUST provide a concrete reason in format: "Missing Fact: #N (theme); Recommendation: <what block type to add>." Never output vague text like "not detailed enough".',
				inputSchema: needMoreDashboardBlocksInputSchema,
				execute: async (input) => {
					this.needMoreDashboardBlocks = input.reason;
				},
			}),
		};

		this.agent = new Agent<ReviewToolSet>({
			model: this.aiServiceManager.getMultiChat()
				.getProviderService(provider)
				.modelClient(modelId),
			tools,
		});
	}

	public getNeedMoreDashboardBlocksAndReset(): string | undefined {
		const needMoreDashboardBlocks = this.needMoreDashboardBlocks;
		this.needMoreDashboardBlocks = undefined;
		return needMoreDashboardBlocks;
	}

	/**
	 * Stream review of dashboard blocks. Retries on tool/stream error or when post-stream validation fails (blocks/overview mermaid), up to 3 generations.
	 */
	public async *stream(stepId: string): AsyncGenerator<LLMStreamEvent> {
		let validResult = true;
		let generationCount = 0;
		let lastValidationError: string | undefined;
		const self = this;

		do {
			generationCount++;
			const validationRetryCtx: RetryContext | undefined = lastValidationError
				? { attemptTimes: generationCount, lastRetryText: lastValidationError }
				: undefined;

			yield* withRetryStream(
				{},
				(_, retryCtx) => self.realStreamInternal(retryCtx ?? validationRetryCtx, stepId),
				{ maxRetries: 2, triggerName: StreamTriggerName.SEARCH_DASHBOARD_UPDATE_AGENT },
			);

			const result = self.context.getAgentResult();
			const report = await validateAnalysisData(result);
			const hasErrors =
				(report.blockErrors?.length ?? 0) > 0 ||
				(report.mermaidBlockErrors?.length ?? 0) > 0 ||
				!!report.overviewMermaidError;
			if (hasErrors) {
				validResult = false;
				lastValidationError = validationReportToPromptText(report);
				yield {
					type: 'pk-debug',
					debugName: 'review_blocks_validation_failed',
					triggerName: StreamTriggerName.SEARCH_DASHBOARD_UPDATE_AGENT,
					extra: { report, error: lastValidationError },
				};
			}
		} while (!validResult && generationCount < 3);
	}

	private async *realStreamInternal(
		retryCtx?: ErrorRetryInfo | RetryContext,
		stepId?: string,
	): AsyncGenerator<LLMStreamEvent> {
		const promptInfo = await this.aiServiceManager.getPromptInfo(PromptId.AiAnalysisReviewBlocks);
		const originalQuery = this.context.getInitialPrompt() ?? '';
		const system = await this.aiServiceManager.renderPrompt(promptInfo.systemPromptId!, {});
        const dashboardBlocks = this.context.getDashboardBlocks();
		const confirmedFactsList = this.context.getConfirmedFacts();
		const confirmedFacts =
			confirmedFactsList.length > 0
				? confirmedFactsList.map((f, i) => `Fact #${i + 1}: ${f}`).join('\n')
				: undefined;
		const prompt = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisReviewBlocks, {
			originalQuery,
			currentBlocksSnapshot: JSON.stringify(dashboardBlocks),
			confirmedFacts,
			...buildErrorRetryInfo(retryCtx) ?? {},
			toolFormatGuidance: getDashboardBlocksToolFormatGuidance(),
		} as PromptVariables[typeof PromptId.AiAnalysisReviewBlocks]);

		stepId = stepId ?? generateUuidWithoutHyphens();
		yield {
			type: 'ui-step',
			uiType: UIStepType.STEPS_DISPLAY,
			stepId,
			title: 'Reviewing and consolidating dashboard blocks',
			description: 'Reviewing dashboard blocks',
			triggerName: StreamTriggerName.SEARCH_DASHBOARD_UPDATE_AGENT,
		}
		yield buildPromptTraceDebugEvent(StreamTriggerName.SEARCH_DASHBOARD_UPDATE_AGENT, system, prompt);
		const result = this.agent.stream({ system, prompt });
		yield* streamTransform(result.fullStream, StreamTriggerName.SEARCH_DASHBOARD_UPDATE_AGENT, {
			yieldUIStep: { uiType: UIStepType.STEPS_DISPLAY, stepId: stepId },
			yieldEventPostProcessor: (chunk: any) => {
				if (chunk.type === 'tool-result') {
					if (chunk.toolName === 'organize_dashboard_blocks') {
						return { extra: { currentResult: this.context.getAgentResult() } };
					}
				}
				return {};
			},
		});
	}
}
