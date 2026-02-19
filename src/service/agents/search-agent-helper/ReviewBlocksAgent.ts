import { Experimental_Agent as Agent, stepCountIs } from 'ai';
import { AIServiceManager } from '@/service/chat/service-manager';
import { LLMStreamEvent, StreamTriggerName } from '@/core/providers/types';
import { PromptId, type PromptVariables } from '@/service/prompt/PromptId';
import { AISearchUpdateContext, InnerAgentContext, type AnalysisMode } from '../AISearchAgent';
import { dashboardBlocksUpdateTool, getDashboardBlocksToolFormatGuidance } from './helpers/DashboardUpdateToolBuilder';
import { searchMemoryStoreTool } from '@/service/tools/search-memory-store';
import type { AgentTool } from '@/service/tools/types';
import { RESULT_UPDATE_TOOL_NAMES } from '../AISearchAgent';
import { buildPromptTraceDebugEvent, streamTransform, withRetryStream } from '@/core/providers/helpers/stream-helper';

const DEFAULT_MAX_STEPS = 8;

type ReviewToolSet = {
	search_analysis_context: AgentTool;
	organize_dashboard_blocks: AgentTool;
};

/**
 * Agent that reviews dashboard blocks: dedupe, merge, remove (by block.id), reorder; cap 6–8 blocks.
 * Uses getModelForPrompt(AiAnalysisReviewBlocks).
 */
export class ReviewBlocksAgent {
	private readonly aiServiceManager: AIServiceManager;
	private readonly options: { analysisMode: AnalysisMode };
	private readonly context: InnerAgentContext;

	private agent: Agent<ReviewToolSet>;

	constructor(params: {
		aiServiceManager: AIServiceManager;
		options: { analysisMode: AnalysisMode };
		context: InnerAgentContext;
	}) {
		this.aiServiceManager = params.aiServiceManager;
		this.options = { analysisMode: params.options.analysisMode };
		this.context = params.context;
		const { provider, modelId } = this.aiServiceManager.getModelForPrompt(PromptId.AiAnalysisReviewBlocks);
		const { getResult, searchHistory } = this.context;

		const tools: ReviewToolSet = {
			search_analysis_context: searchMemoryStoreTool(searchHistory, {
				description: 'Search the analysis session history for context. Use to confirm current blocks and evidence.',
			}),
			organize_dashboard_blocks: dashboardBlocksUpdateTool(getResult),
		};

		this.agent = new Agent<ReviewToolSet>({
			model: this.aiServiceManager.getMultiChat()
				.getProviderService(provider)
				.modelClient(modelId),
			tools,
			stopWhen: [stepCountIs(DEFAULT_MAX_STEPS)],
		});
	}

	public async *stream(variables: AISearchUpdateContext): AsyncGenerator<LLMStreamEvent> {
		yield* withRetryStream(variables, (vars) => this.realStreamInternal(vars));
	}

	private async *realStreamInternal(
		variables: AISearchUpdateContext,
	): AsyncGenerator<LLMStreamEvent> {
		const promptInfo = await this.aiServiceManager.getPromptInfo(PromptId.AiAnalysisReviewBlocks);
		const system = await this.aiServiceManager.renderPrompt(promptInfo.systemPromptId!, {});
		const prompt = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisReviewBlocks, {
			...variables,
			toolFormatGuidance: getDashboardBlocksToolFormatGuidance(),
		} as PromptVariables[typeof PromptId.AiAnalysisReviewBlocks]);

		yield buildPromptTraceDebugEvent('review-blocks-prompt', StreamTriggerName.SEARCH_REVIEW_BLOCKS, system, prompt);
		const result = this.agent.stream({ system, prompt });
		yield* streamTransform(result.fullStream, StreamTriggerName.SEARCH_REVIEW_BLOCKS, {
			yieldEventPostProcessor: (chunk: any) => {
				return RESULT_UPDATE_TOOL_NAMES.has(chunk.toolName)
					? { extra: { currentResult: this.context.getResult() } }
					: {};
			},
		});
	}
}
