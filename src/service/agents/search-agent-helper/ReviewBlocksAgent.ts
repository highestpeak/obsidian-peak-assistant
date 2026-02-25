import { Experimental_Agent as Agent, stepCountIs } from 'ai';
import { AIServiceManager } from '@/service/chat/service-manager';
import { LLMStreamEvent, StreamTriggerName, UIStepType } from '@/core/providers/types';
import { needMoreDashboardBlocksInputSchema } from '@/core/schemas/agents';
import { ErrorRetryInfo, PromptId, type PromptVariables } from '@/service/prompt/PromptId';
import { dashboardBlocksUpdateTool, getDashboardBlocksToolFormatGuidance } from './helpers/DashboardUpdateToolBuilder';
import { safeAgentTool, type AgentTool } from '@/service/tools/types';
import { buildPromptTraceDebugEvent, streamTransform, withRetryStream } from '@/core/providers/helpers/stream-helper';
import { AgentContextManager, AgentMemoryToolSet } from './AgentContextManager';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import { DashboardBlock } from '../AISearchAgent';

type ReviewToolSet = AgentMemoryToolSet & {
	organize_dashboard_blocks: AgentTool;
	need_more_dashboard_blocks: AgentTool;
};

export interface ReviewBlocksVariables {
	agentMemoryMessage: string;
	/** JSON string of current dashboard blocks for prompt display. */
	currentBlocksSnapshot: string;
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
				description: 'If you think we need more dashboard blocks/or if they are not good enough, you should call this tool to mark it. if good enough, you should not call this tool.',
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

	public async *stream(stepId: string): AsyncGenerator<LLMStreamEvent> {
		yield* withRetryStream({}, (_, retryCtx) => this.realStreamInternal(retryCtx, stepId));
	}

	private async *realStreamInternal(
		errorRetryInfo?: ErrorRetryInfo,
		stepId?: string,
	): AsyncGenerator<LLMStreamEvent> {
		const promptInfo = await this.aiServiceManager.getPromptInfo(PromptId.AiAnalysisReviewBlocks);
		const system = await this.aiServiceManager.renderPrompt(promptInfo.systemPromptId!, {});
		const dashboardBlocks = this.context.getAgentResult().dashboardBlocks ?? [];
		const prompt = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisReviewBlocks, {
			agentMemoryMessage: this.context.getLatestMessageText(),
			currentBlocksSnapshot: JSON.stringify(dashboardBlocks),
			...(errorRetryInfo ? { errorRetryInfo } : {}),
			toolFormatGuidance: getDashboardBlocksToolFormatGuidance(),
		} as PromptVariables[typeof PromptId.AiAnalysisReviewBlocks]);

		stepId = stepId ?? generateUuidWithoutHyphens();
		yield {
			type: 'ui-step',
			uiType: UIStepType.STEPS_DISPLAY,
			stepId,
			title: 'Reviewing and consolidating dashboard blocks',
			description: 'Reviewing dashboard blocks',
			triggerName: StreamTriggerName.SEARCH_REVIEW_BLOCKS,
		}
		yield buildPromptTraceDebugEvent(StreamTriggerName.SEARCH_REVIEW_BLOCKS, system, prompt);
		const result = this.agent.stream({ system, prompt });
		yield* streamTransform(result.fullStream, StreamTriggerName.SEARCH_REVIEW_BLOCKS, {
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
