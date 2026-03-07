import { Experimental_Agent as Agent } from 'ai';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { LLMStreamEvent, StreamTriggerName, UIStepType } from '@/core/providers/types';
import { buildPromptTraceDebugEvent, streamTransform } from '@/core/providers/helpers/stream-helper';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import { PromptId } from '@/service/prompt/PromptId';
import { AgentTool, safeAgentTool } from '@/service/tools/types';
import {
	submitPrescriptionInputSchema,
	visualPrescriptionSchema,
	type SubmitPrescriptionOutput,
	type ReportVisualBlueprint,
	type VisualPrescription,
} from '@/core/schemas/agents/search-agent-schemas';
import type { AgentContextManager } from './AgentContextManager';
import { uiStageSignal } from './helpers/search-ui-events';

export type VisualBlueprintAgentToolSet = {
	submit_prescription_and_get_next: AgentTool;
};

/**
 * Visual Architect: after ReportPlan, prescribes per-block diagram type and Mermaid directive.
 * Streams tool calls and writes reportVisualBlueprint to context on completion.
 */
export class VisualBlueprintAgent {
	private readonly visualBlueprintAgent: Agent<VisualBlueprintAgentToolSet>;

	private currentVisualProgressIndex = 0;
	private prescriptions: VisualPrescription[] = [];

	constructor(
		private readonly aiServiceManager: AIServiceManager,
		private readonly context: AgentContextManager,
	) {
		const { provider, modelId } = this.aiServiceManager.getModelForPrompt(PromptId.AiAnalysisVisualBlueprint);
		this.visualBlueprintAgent = new Agent<VisualBlueprintAgentToolSet>({
			model: this.aiServiceManager.getMultiChat().getProviderService(provider).modelClient(modelId),
			tools: {
				submit_prescription_and_get_next: this.submitPrescriptionAndGetNext(),
			},
		});
	}

	private submitPrescriptionAndGetNext(): AgentTool {
		return safeAgentTool({
			description:
				'Submit the visual prescription for the current block. Use status "draft" to add more for the same block, "final" to finish and get the next block. Call in block order.',
			inputSchema: submitPrescriptionInputSchema,
			execute: async (input) => {
				const blockId = (input?.blockId ?? '').trim();
				const title = (input?.title ?? '').trim() || blockId;
				const status = (input?.status ?? 'final') as 'draft' | 'final';

				// if prescription, parse it
				let prescription: VisualPrescription | undefined;
				if (input?.prescription) {
					const parsed = visualPrescriptionSchema.safeParse(input.prescription);
					if (parsed.success) prescription = parsed.data;
				}

				// if no prescription, create a fallback prescription
				if (!prescription && blockId) {
					prescription = {
						blockId,
						title,
						needVisual: false,
					};
					if (input?.prescriptionMarkdown) {
						prescription.warnings = [input.prescriptionMarkdown];
					}
				}

				if (prescription) this.prescriptions.push(prescription);

				// get next block id and requirements markdown
				return this.getNext(status === 'final');
			},
		});
	}

	private getNext(advance: boolean): SubmitPrescriptionOutput {
		const plan = this.context.getReportPlan();
		if (!plan) {
			console.warn('[VisualBlueprintAgent] No report plan found');
			return { nextBlockId: null, nextRequirementsMarkdown: '', done: true };
		}

		// next block
		if (advance) 
			this.currentVisualProgressIndex++;

		const body = plan.bodyBlocksSpec ?? [];
		const appendices = plan.appendicesBlocksSpec ?? [];
		const allBlocksLen = body.length + appendices.length;
		if (this.currentVisualProgressIndex >= allBlocksLen) {
			return { nextBlockId: null, nextRequirementsMarkdown: '', done: true };
		}

		if (this.currentVisualProgressIndex < body.length) {
			const b = body[this.currentVisualProgressIndex];
			return {
				nextBlockId: b.blockId,
				nextRequirementsMarkdown: `Prescribe visual for block "${b.title ?? b.blockId}" (${b.role}). Consider: ${b.chartOrTableShape ?? 'narrative + optional chart'}.`,
				done: false,
			};
		}
		else {
			const a = appendices[this.currentVisualProgressIndex - body.length];
			return {
				nextBlockId: a.blockId,
				nextRequirementsMarkdown: `Prescribe visual for appendix "${a.title ?? a.blockId}" (${a.role}). Prefer detailed tables or network graphs where appropriate.`,
				done: false,
			};
		}
	}

	/**
	 * Stream the visual blueprint agent; yields LLM events and writes reportVisualBlueprint to context on completion.
	 * No-op if reportPlan is missing or has no body/appendices blocks.
	 */
	public async *streamBlueprint(opts?: { stepId?: string }): AsyncGenerator<LLMStreamEvent> {
		this.prescriptions = [];
		this.currentVisualProgressIndex = 0;
		const stepId = opts?.stepId ?? generateUuidWithoutHyphens();

		const plan = this.context.getReportPlan();
		const blockPlanCounts = (plan?.bodyBlocksSpec?.length ?? 0) + (plan?.appendicesBlocksSpec?.length ?? 0);
		if (!plan || blockPlanCounts === 0) {
			this.context.setReportVisualBlueprint({ blocks: [], globalStyleNotes: undefined });
			yield {
				type: 'pk-debug',
				debugName: 'visual-blueprint-skipped',
				triggerName: StreamTriggerName.SEARCH_VISUAL_BLUEPRINT_AGENT,
				extra: { reason: plan ? 'no body or appendices blocks' : 'no report plan' },
			};
			return;
		}

		const originalQuery = this.context.getInitialPrompt() ?? '';
		const confirmedFacts = this.context.getConfirmedFacts();
		const first = this.getNext(false);
		const firstBlockId = first?.nextBlockId ?? undefined;
		const firstBlockRequirements = first?.nextRequirementsMarkdown ?? undefined;

		const system = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisVisualBlueprintSystem, {});
		const prompt = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisVisualBlueprint, {
			originalQuery,
			overviewMermaid: this.context.getEvidenceWeavedMermaidOverview(),
			confirmedFacts,
			firstBlockId,
			firstBlockRequirements,
		});

		yield uiStageSignal(
			{ runStepId: stepId, stage: 'visualBlueprint', agent: 'VisualBlueprintAgent' },
			{ status: 'start', triggerName: StreamTriggerName.SEARCH_VISUAL_BLUEPRINT_AGENT },
		);
		yield {
			type: 'ui-step',
			uiType: UIStepType.STEPS_DISPLAY,
			stepId,
			title: 'Planning visuals…',
			description: 'Visual blueprint',
			triggerName: StreamTriggerName.SEARCH_VISUAL_BLUEPRINT_AGENT,
		};
		yield buildPromptTraceDebugEvent(StreamTriggerName.SEARCH_VISUAL_BLUEPRINT_AGENT, system, prompt);

		const result = this.visualBlueprintAgent.stream({ system, prompt });
		yield* streamTransform(result.fullStream, StreamTriggerName.SEARCH_VISUAL_BLUEPRINT_AGENT, {
			yieldUIStep: { uiType: UIStepType.STEPS_DISPLAY, stepId },
		});

		const blueprint: ReportVisualBlueprint = {
			blocks: this.prescriptions,
			globalStyleNotes: undefined,
		};
		this.context.setReportVisualBlueprint(blueprint);
		yield uiStageSignal(
			{ runStepId: stepId, stage: 'visualBlueprint', agent: 'VisualBlueprintAgent' },
			{ status: 'complete', triggerName: StreamTriggerName.SEARCH_VISUAL_BLUEPRINT_AGENT },
		);
	}
}
