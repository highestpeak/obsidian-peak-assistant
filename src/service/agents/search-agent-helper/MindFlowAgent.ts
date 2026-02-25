/**
 * MindFlow Agent: drives thinking-tree Mermaid, progress, and continue/stop decision.
 * Emits GraphPatch via ui-signal; updates agentResult.graph.
 */

import { Experimental_Agent as Agent, hasToolCall, stepCountIs } from 'ai';
import {
	mindflowMermaidInputSchema,
	mindflowProgressInputSchema,
	mindflowTraceInputSchema,
} from '@/core/schemas/agents';
import { AIServiceManager } from '@/service/chat/service-manager';
import { LLMStreamEvent, StreamTriggerName, UIStepType, UISignalChannel, UISignalKind, LLMRequestMessage } from '@/core/providers/types';
import { ErrorRetryInfo, PromptId } from '@/service/prompt/PromptId';
import { safeAgentTool } from '@/service/tools/types';
import type { AgentTool } from '@/service/tools/types';
import { buildPromptTraceDebugEvent, streamTransform, withRetryStream, type RetryContext } from '@/core/providers/helpers/stream-helper';
import { MINDFLOW_STATE_SYNTAX } from './mindflow/types';
import { AgentContextManager, AgentMemoryToolSet } from './AgentContextManager';
import { convertMessagesToText } from '@/core/providers/adapter/ai-sdk-adapter';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';

const DEFAULT_MAX_STEPS = 15;
const MINDFLOW_PROGRESS_UI_ITERATION = 5;

const MINDFLOW_TOOL_NAMES = new Set(['submit_mindflow_mermaid', 'submit_mindflow_trace', 'submit_mindflow_progress']);

/** Phase indicates when MindFlowAgent is called relative to ThoughtAgent. */
export type MindFlowPhase = 'pre-thought' | 'post-thought';

export interface MindflowProgress {
	estimatedCompleteness: number;
	statusLabel: string;
	goalAlignment?: string;
	critique?: string;
	decision?: 'continue' | 'stop';
}

type MindFlowToolSet = AgentMemoryToolSet & {
	submit_mindflow_mermaid: AgentTool;
	submit_mindflow_trace: AgentTool;
	submit_mindflow_progress: AgentTool;
};

export interface MindFlowVariables {
	phase: MindFlowPhase;
	/** User's search question; the thinking tree must be about this, not about tools. */
	userQuery: string;
	/**
	 * history contains progress and thought activities.
	 */
	agentMemoryMessage: string;
	previousMindflowMermaid?: string;
}

/** Creates MindFlow tools and agent. */
export class MindFlowAgent {
	private readonly aiServiceManager: AIServiceManager;
	private readonly context: AgentContextManager;
	private agent: Agent<MindFlowToolSet>;
	private prevMermaid: string | null = null;

	constructor(params: {
		aiServiceManager: AIServiceManager;
		context: AgentContextManager;
	}) {
		this.aiServiceManager = params.aiServiceManager;
		this.context = params.context;

		const { provider, modelId } = this.aiServiceManager.getModelForPrompt(PromptId.AiAnalysisMindflowAgent);
		const tools: MindFlowToolSet = {
			...this.context.getAgentMemoryTool(),
			/**
			 * submit the current thinking tree as constrained flowchart TD Mermaid.
			 * consumers: Graph UI, subsequent readers of agentResult.graph.
			 */
			submit_mindflow_mermaid: this.buildMermaidTool(),
			/**
			 * submit a short text describing what you are doing or planning to do next.
			 * consumers: UI step description, ThoughtAgent prompt context.
			 */
			submit_mindflow_trace: this.buildTraceTool(),
			/**
			 * submit structured progress and "continue/stop" decision. 
			 * consumers: orchestration layer (decide whether to continue ThoughtAgent loop), CompletionJudgeAgent, UI progress display.
			 */
			submit_mindflow_progress: this.buildProgressTool(),
		};

		this.agent = new Agent<MindFlowToolSet>({
			model: this.aiServiceManager.getMultiChat()
				.getProviderService(provider)
				.modelClient(modelId),
			tools,
			stopWhen: [
				stepCountIs(DEFAULT_MAX_STEPS),
				hasToolCall('submit_mindflow_progress'),
			],
		});
	}

	private buildMermaidTool(): AgentTool {
		return safeAgentTool({
			description: `Submit the current thinking tree as constrained flowchart TD Mermaid. Use nodes with :::${MINDFLOW_STATE_SYNTAX} and edges A -->|"main: supports"| B.`,
			inputSchema: mindflowMermaidInputSchema,
			execute: async (input) => {
				const raw = (input?.code ?? '').trim();
				return {
					mermaid: raw
				};
			},
		});
	}

	private buildTraceTool(): AgentTool {
		const self = this;
		return safeAgentTool({
			description: 'Submit a short trace of what you are doing or planning to correct next.',
			inputSchema: mindflowTraceInputSchema,
			execute: async (input) => {
				const text = (input?.text ?? '').trim();
				const trace = text || 'Thinking…';
				self.context.appendMindflowTrace(trace);
				return { trace };
			},
		});
	}

	private buildProgressTool(): AgentTool {
		const self = this;
		return safeAgentTool({
			description: 'Submit progress: completeness, status, goal alignment, critique, and continue/stop decision.',
			inputSchema: mindflowProgressInputSchema,
			execute: async (input) => {
				const p: MindflowProgress = {
					estimatedCompleteness: input?.estimatedCompleteness ?? 0,
					statusLabel: input?.statusLabel ?? '',
					goalAlignment: input?.goalAlignment,
					critique: input?.critique,
					decision: input?.decision ?? 'continue',
				};
				self.context.appendMindflowProgress(p);
				return { progress: p };
			},
		});
	}

	/** Reset per-session state (call at start of new search). */
	public resetSessionState(): void {
		this.prevMermaid = null;
	}

	public async *stream(
		opts?: { stepId?: string; phase?: MindFlowPhase },
	): AsyncGenerator<LLMStreamEvent> {
		yield* withRetryStream(
			{},
			(_, retryCtx) => this.realStreamInternal(retryCtx, opts?.stepId, opts?.phase),
		);
	}

	private async *realStreamInternal(
		retryCtx?: ErrorRetryInfo | RetryContext,
		stepId?: string,
		phase?: MindFlowPhase,
	): AsyncGenerator<LLMStreamEvent> {
		// we can get the whole ReAct chain of messages from the agent memory.
		let agentMemoryMessage: any[] = [];
		for await (const chunk of this.context.buildCurrentPrompt((prompt: LLMRequestMessage[]) => {
			agentMemoryMessage.push(prompt);
		})) {
			yield chunk;
		}

		// build prompts
		const promptInfo = await this.aiServiceManager.getPromptInfo(PromptId.AiAnalysisMindflowAgent);
		const system = await this.aiServiceManager.renderPrompt(promptInfo.systemPromptId!, {});
		const prompt = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisMindflowAgent, {
			phase: phase ?? 'pre-thought',
			userQuery: this.context.getInitialPrompt(),
			agentMemoryMessage: convertMessagesToText(agentMemoryMessage[0] as LLMRequestMessage[]),
			previousMindflowMermaid: this.prevMermaid ?? undefined,
			...(retryCtx && {
				attemptTimes: retryCtx?.attemptTimes,
				lastAttemptErrorMessages: !retryCtx ? undefined
					: ('lastAttemptErrorMessages' in retryCtx ? retryCtx.lastAttemptErrorMessages : (retryCtx as RetryContext).lastRetryText)
			}),
		});
		yield buildPromptTraceDebugEvent(StreamTriggerName.SEARCH_MINDFLOW_AGENT, system, prompt);

		// call agent
		const result = this.agent.stream({ system, prompt });
		// Accumulate latest mermaid + progress; emit one combined ui-signal when MindFlow agent finishes (avoids UI crash from many rapid updates)
		let lastMermaid = '';
		let lastProgress: MindflowProgress | null = null;
		const self = this;
		yield* streamTransform(result.fullStream, StreamTriggerName.SEARCH_MINDFLOW_AGENT, {
			yieldEventPostProcessor: (chunk: any) => {
				return MINDFLOW_TOOL_NAMES.has(chunk.toolName)
					? { extra: { currentResult: self.context.getAgentResult() } }
					: {};
			},
			yieldExtraAfterEvent: !stepId ? undefined : (chunk: any) => {
				if (chunk.type === 'tool-result') {
					const toolName = chunk.toolName;
					const output = chunk.output ?? {};
					const res = output.result ?? output;
					if (toolName === 'submit_mindflow_mermaid' && res && typeof res.mermaid === 'string') {
						lastMermaid = res.mermaid.trim();
						return undefined;
					}
					if (toolName === 'submit_mindflow_progress' && res?.progress) {
						lastProgress = res.progress as MindflowProgress;
						return undefined;
					}
					if (toolName === 'submit_mindflow_trace' && res?.trace) {
						return {
							type: 'ui-step-delta',
							uiType: UIStepType.STEPS_DISPLAY,
							stepId,
							descriptionDelta: res.trace,
						};
					}
					return undefined;
				}
				if (chunk.type === 'finish') {
					self.prevMermaid = lastMermaid;
					self.context.setLastMermaid(lastMermaid);
					return {
						type: 'ui-signal',
						id: `sig-mindflow-snapshot-${Date.now()}`,
						channel: UISignalChannel.MINDFLOW_MERMAID,
						kind: UISignalKind.STAGE,
						entityId: stepId,
						payload: { mermaid: lastMermaid, progress: lastProgress },
					};
				}
				return undefined;
			}
		});
	}

	public async *checkMindFlowProgreeDecision(
		iterationCount: number,
		lastProgress: MindflowProgress | undefined,
		setShouldBreak: (shouldBreak: boolean) => void,
	): AsyncGenerator<LLMStreamEvent> {
		if (iterationCount < MINDFLOW_PROGRESS_UI_ITERATION) {
			setShouldBreak(false);
			return;
		}
		if (lastProgress) {
			yield {
				type: 'ui-signal' as const,
				id: `sig-mindflow-progress-ui-${Date.now()}`,
				channel: UISignalChannel.MINDFLOW_PROGRESS,
				kind: UISignalKind.PROGRESS,
				entityId: generateUuidWithoutHyphens(),
				payload: lastProgress,
			};
		}
		if (lastProgress?.decision === 'stop') {
			yield {
				type: 'pk-debug',
				debugName: 'mindflow-stop',
				triggerName: StreamTriggerName.SEARCH_COMPLETION_JUDGE,
				extra: { reason: 'MindFlow decided to stop', progress: lastProgress },
			};
			setShouldBreak(true);
			return;
		}
		setShouldBreak(false);
	}
}
