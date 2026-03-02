/**
 * KnowledgeAgent: compresses EvidencePacks into a structured Knowledge Panel
 * (clusters, conflicts, open_questions). Used when Planner decides REQUEST_COMPRESSION.
 */

import { Experimental_Agent as Agent, hasToolCall } from 'ai';
import type { LanguageModel } from 'ai';
import { AIServiceManager } from '@/service/chat/service-manager';
import { AgentTool, safeAgentTool } from '@/service/tools/types';
import { LLMStreamEvent, StreamTriggerName, UIStepType } from '@/core/providers/types';
import { PromptId } from '@/service/prompt/PromptId';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import { submitKnowledgePanelInputSchema } from '@/core/schemas/agents/search-agent-schemas';
import type { KnowledgePanel } from '@/core/schemas/agents/search-agent-schemas';
import { streamTransform } from '@/core/providers/helpers/stream-helper';
import { AgentContextManager } from './AgentContextManager';

type KnowledgeToolSet = {
	submit_knowledge_panel: AgentTool;
};

export interface KnowledgeAgentVariables {
	/** Fact lines (claim + path + quote snippet) from non-superseded EvidencePacks. */
	evidenceSummary: string;
	/** Newline-separated path_or_url list. */
	sourceMap: string;
	/** Optional last RawSearch loop delta for context. */
	lastRawSearchDelta?: string;
	/** User's initial query (goal). */
	userQuery: string;
}

export class KnowledgeAgent {
	private readonly agent: Agent<KnowledgeToolSet>;
	private readonly aiServiceManager: AIServiceManager;
	private readonly context: AgentContextManager;

	constructor(params: { aiServiceManager: AIServiceManager; context: AgentContextManager }) {
		this.aiServiceManager = params.aiServiceManager;
		this.context = params.context;

		const { provider, modelId } = this.aiServiceManager.getModelForPrompt(PromptId.AiAnalysisKnowledgeAgent);
		const model = this.aiServiceManager.getMultiChat().getProviderService(provider).modelClient(modelId);

		this.agent = new Agent<KnowledgeToolSet>({
			model: model as LanguageModel,
			tools: { submit_knowledge_panel: this.buildSubmitKnowledgePanelTool() },
			stopWhen: [hasToolCall('submit_knowledge_panel')],
			temperature: 0.3,
			maxOutputTokens: 4096,
		});
	}

	private buildSubmitKnowledgePanelTool(): AgentTool {
		const self = this;
		return safeAgentTool({
			description:
				'Submit the structured Knowledge Panel: clusters (thematic groups with summary, paths, key_claims), conflicts (topic + conflicting_claims + evidence_paths), open_questions, and panel_stats (fact_count, pack_count, source_count, condensed). Call exactly once per run.',
			inputSchema: submitKnowledgePanelInputSchema,
			execute: async (rawInput: unknown) => {
				const parsed = submitKnowledgePanelInputSchema.safeParse(rawInput);
				if (parsed.success) {
					const panel: KnowledgePanel = {
						clusters: parsed.data.clusters,
						conflicts: parsed.data.conflicts,
						open_questions: parsed.data.open_questions,
						panel_stats: parsed.data.panel_stats,
					};
					self.context.addKnowledgePanel(panel);
				}
			},
		});
	}

	/** Stream one run: read evidence from context, produce Knowledge Panel, write to context. */
	public async *stream(variables: KnowledgeAgentVariables): AsyncGenerator<LLMStreamEvent> {
		const systemPromptId = PromptId.AiAnalysisKnowledgeAgentSystem;
		const system = await this.aiServiceManager.renderPrompt(systemPromptId, {});
		const userPrompt = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisKnowledgeAgent, variables);

		const result = this.agent.stream({ system, prompt: userPrompt });
		const stepId = generateUuidWithoutHyphens();

		yield {
			type: 'ui-step',
			uiType: UIStepType.STEPS_DISPLAY,
			stepId,
			title: 'Compressing evidence into Knowledge Panel…',
			triggerName: StreamTriggerName.SEARCH_KNOWLEDGE_AGENT,
		};

		yield* streamTransform(result.fullStream, StreamTriggerName.SEARCH_KNOWLEDGE_AGENT, {
			yieldUIStep: {
				uiType: UIStepType.STEPS_DISPLAY,
				stepId,
				uiEventGenerator: (chunk) => {
					if (chunk.type === 'finish') {
						return {
							type: 'ui-step',
							uiType: UIStepType.STEPS_DISPLAY,
							stepId,
							title: 'Knowledge Panel ready',
							description: 'Evidence compressed into structured panel.',
						};
					}
				},
			},
		});
	}
}
