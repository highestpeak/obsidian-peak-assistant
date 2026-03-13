/**
 * Agent for recon-only overview: has content_reader and inspect_note_context so the model
 * can enrich the logic model from the vault. Submits the result via submit_overview_logic_model tool.
 */

import { AIServiceManager } from '@/service/chat/service-manager';
import { Experimental_Agent as Agent, hasToolCall } from 'ai';
import type { AgentTool } from '@/service/tools/types';
import { safeAgentTool } from '@/service/tools/types';
import { contentReaderTool } from '@/service/tools/content-reader';
import { inspectNoteContextTool } from '@/service/tools/search-graph-inspector';
import { submitOverviewLogicModelInputSchema } from '@/core/schemas/tools/submitOverviewLogicModel';
import type { OverviewLogicModel } from '@/core/schemas/agents/search-agent-schemas';
import { PromptId } from '@/service/prompt/PromptId';
import { buildPromptTraceDebugEvent } from '@/core/providers/helpers/stream-helper';
import { streamTransform } from '@/core/providers/helpers/stream-helper';
import { LLMStreamEvent, StreamTriggerName, UIStepType } from '@/core/providers/types';
import type { AgentContextManager } from './AgentContextManager';
import type { ReconSynthesisBundle } from './helpers/recon-synthesis-helper';
import { makeStepId, uiStageSignal } from './helpers/search-ui-events';
import { buildToolCallUIEvent } from './helpers/tool-call-ui';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';

type ReconOverviewTools = {
	content_reader: AgentTool;
	inspect_note_context: AgentTool;
	submit_overview_logic_model: AgentTool;
};

/** Ref to hold the submitted logic model after the agent calls the tool. */
interface ModelRef {
	current: OverviewLogicModel | null;
}

function makeSubmitOverviewLogicModelTool(ref: ModelRef): AgentTool {
	return safeAgentTool({
		description:
			'Call this when the overview logic model is ready. Pass the full logic model JSON (nucleus, nodes, edges, optional clusters/timeline). Use this exactly once to submit the final model.',
		inputSchema: submitOverviewLogicModelInputSchema,
		execute: async (input: { logicModel: OverviewLogicModel }) => {
			ref.current = input.logicModel;
			return { submitted: true };
		},
	});
}

/** Recon bundle has reports only; no graph. Return empty summary for prompt compatibility. */
export function buildReconGraphSummary(_bundle: ReconSynthesisBundle): string {
	return '';
}

export class ReconOverviewWeaveAgent {
	private readonly agent: Agent<ReconOverviewTools>;

	constructor(
		private readonly aiServiceManager: AIServiceManager,
		private readonly context: AgentContextManager,
	) {
		const modelRef: ModelRef = { current: null };
		const tm = this.aiServiceManager.getTemplateManager?.();
		const { provider, modelId } = this.aiServiceManager.getModelForPrompt(PromptId.AiAnalysisOverviewLogicModelFromRecon);
		const temperature = this.aiServiceManager.getSettings?.()?.defaultOutputControl?.temperature ?? 0.3;

		this.agent = new Agent<ReconOverviewTools>({
			model: this.aiServiceManager.getMultiChat().getProviderService(provider).modelClient(modelId),
			tools: {
				content_reader: contentReaderTool(),
				inspect_note_context: inspectNoteContextTool(tm),
				submit_overview_logic_model: makeSubmitOverviewLogicModelTool(modelRef),
			},
			stopWhen: [hasToolCall('submit_overview_logic_model')],
			temperature,
		});
		(this as unknown as { _modelRef: ModelRef })._modelRef = modelRef;
	}

	private getModelRef(): ModelRef {
		return (this as unknown as { _modelRef: ModelRef })._modelRef;
	}

	/**
	 * Runs the agent with recon bundle prompt vars; yields stream events. After the stream,
	 * the submitted logic model (if any) is in the ref passed to the constructor. Caller should
	 * read ref.current after consuming the generator.
	 */
	async *stream(
		bundle: ReconSynthesisBundle,
		stepId: string,
	): AsyncGenerator<LLMStreamEvent> {
		const overviewMeta = { runStepId: stepId, stage: 'overview' as const, agent: 'ReconOverviewWeaveAgent' };
		yield uiStageSignal(overviewMeta, { status: 'start', triggerName: StreamTriggerName.SEARCH_OVERVIEW_MERMAID });

		const userQuery = this.context.getInitialPrompt() ?? '';
		const reconReports = bundle.reports.map((r) => ({
			dimension: r.dimension,
			tactical_summary: r.tactical_summary ?? null,
			discovered_leads: r.discovered_leads ?? [],
		}));
		const reconGraphSummary = buildReconGraphSummary(bundle);

		const system = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisOverviewLogicModelFromReconSystem, {});
		const prompt = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisOverviewLogicModelFromRecon, {
			userQuery,
			reconReports,
			reconGraphSummary,
		});
		yield buildPromptTraceDebugEvent(StreamTriggerName.SEARCH_OVERVIEW_MERMAID, system, prompt);

		const result = this.agent.stream({ system, prompt });
		const stepIdUi = makeStepId(overviewMeta);

		yield* streamTransform(result.fullStream, StreamTriggerName.SEARCH_OVERVIEW_MERMAID, {
			yieldUIStep: {
				uiType: UIStepType.STEPS_DISPLAY,
				stepId: stepIdUi,
				uiEventGenerator: (chunk: { type?: string; toolName?: string }) => {
					if (chunk.type === 'tool-call') {
						return buildToolCallUIEvent(chunk, stepIdUi);
					}
					return undefined;
				},
			},
		});
	}

	/** Returns the submitted logic model after stream() has run (or null if not submitted). */
	getSubmittedModel(): OverviewLogicModel | null {
		return this.getModelRef().current;
	}
}
