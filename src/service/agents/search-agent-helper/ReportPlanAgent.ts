import { Experimental_Agent as Agent } from 'ai';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { LLMStreamEvent, StreamTriggerName, UIStepType } from '@/core/providers/types';
import { buildPromptTraceDebugEvent, streamTransform } from '@/core/providers/helpers/stream-helper';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import { PromptId } from '@/service/prompt/PromptId';
import { AgentTool, safeAgentTool } from '@/service/tools/types';
import {
	REPORT_PLAN_PHASE_IDS,
	REPORT_PLAN_PHASE_REQUIREMENTS,
	REPORT_PLAN_BODY_PHASE_IDS,
	submitReportPhaseInputSchema,
	type ReportPlanPhaseId,
	type ReportPlan,
	type BodyBlockSpec,
	type AppendicesBlockSpec,
} from '@/core/schemas/agents/search-agent-schemas';
import type { AgentContextManager, AgentMemoryToolSet } from './AgentContextManager';
import { VisualBlueprintAgent } from './VisualBlueprintAgent';
import { weaveReportBlockBlueprintItems } from './helpers/report-block-plan-weaver';
import { uiStageSignal } from './helpers/search-ui-events';

export type ReportPlanAgentToolSet = AgentMemoryToolSet & {
	submit_phase_and_get_next_to_plan: AgentTool;
};

/**
 * Section-by-section report planner. Uses one tool: submit_phase_and_get_next_to_plan.
 * Accumulates phase plans and builds ReportPlan for the orchestrator.
 */
export class ReportPlanAgent {

	private textPlanAgent: Agent<ReportPlanAgentToolSet>;

	private readonly visualBlueprintAgent: VisualBlueprintAgent;

	private phasePlans: Array<{ phaseId: string; planMarkdown: string }> = [];

	/** Set to true when submit_phase_and_get_next_to_plan returns done: true (all phases completed). Used by stopWhen. */
	private allPhasesCompleted = false;

	constructor(
		private readonly aiServiceManager: AIServiceManager,
		private readonly context: AgentContextManager,
	) {
		const { provider, modelId } = this.aiServiceManager.getModelForPrompt(PromptId.AiAnalysisReportPlan);
		this.textPlanAgent = new Agent<ReportPlanAgentToolSet>({
			model: this.aiServiceManager.getMultiChat().getProviderService(provider).modelClient(modelId),
			tools: {
				...this.context.getAgentMemoryTool(),
				submit_phase_and_get_next_to_plan: this.submitPhaseAndGetNextToPlan(),
			},
			stopWhen: [() => this.allPhasesCompleted]
		});
		this.visualBlueprintAgent = new VisualBlueprintAgent(aiServiceManager, context);
	}

	private submitPhaseAndGetNextToPlan(): AgentTool {
		return safeAgentTool({
			description:
				'Submit one page of the current section (phase). Use status "draft" to add more pages for the same phase, "final" to finish the phase and get the next. Call in phase order.',
			inputSchema: submitReportPhaseInputSchema,
			execute: async (input) => {
				let phaseId = (input?.phaseId ?? '').trim();
				const planMarkdown = (input?.planMarkdown ?? '').trim();
				const status = (input?.status ?? 'final') as 'draft' | 'final';
				if (phaseId && planMarkdown) {
					this.phasePlans.push({ phaseId, planMarkdown });
					// self.context.appendAnalysisHistory('Evidence', `[ReportPlan] ${phaseId}: ${planMarkdown.slice(0, 200)}...`, {
					// 	blockIds: [phaseId],
					// });
				}

				/** Build next phase id and requirements after a phase page is submitted. When status is "draft", same phase again (more pages). */
				phaseId = phaseId || 'intent_insight';
				if (status === 'draft') {
					const req = REPORT_PLAN_PHASE_REQUIREMENTS[phaseId as ReportPlanPhaseId] ?? `Plan the section: ${phaseId}.`;
					return { nextPhaseId: phaseId, nextRequirementsMarkdown: req, done: false };
				}
				const idx = REPORT_PLAN_PHASE_IDS.findIndex((p) => p === phaseId);
				const nextIdx = idx < 0 ? REPORT_PLAN_PHASE_IDS.length : idx + 1;
				const nextPhaseId: ReportPlanPhaseId | null = nextIdx < REPORT_PLAN_PHASE_IDS.length ? REPORT_PLAN_PHASE_IDS[nextIdx] : null;
				const nextRequirementsMarkdown = nextPhaseId ? REPORT_PLAN_PHASE_REQUIREMENTS[nextPhaseId] ?? `Plan the section: ${nextPhaseId}.` : '';
				const done = nextPhaseId === null;
				if (done) this.allPhasesCompleted = true;
				return {
					nextPhaseId,
					nextRequirementsMarkdown,
					done,
				};
			},
		});
	}

	public async *streamPlan(opts?: { stepId?: string }): AsyncGenerator<LLMStreamEvent> {
		this.phasePlans = [];
		this.allPhasesCompleted = false;
		const stepId = opts?.stepId ?? generateUuidWithoutHyphens();
		const reportPlanMeta = { runStepId: stepId, stage: 'reportPlan' as const, agent: 'ReportPlanAgent' };
		yield uiStageSignal(reportPlanMeta, { status: 'start', triggerName: StreamTriggerName.SEARCH_REPORT_PLAN_AGENT });
		yield {
			type: 'ui-step',
			uiType: UIStepType.STEPS_DISPLAY,
			stepId,
			title: 'Planning report sections…',
			description: 'Report plan',
			triggerName: StreamTriggerName.SEARCH_REPORT_PLAN_AGENT,
		};

		yield* this.streamTextPlan({ stepId });

		yield* this.visualBlueprintAgent.streamBlueprint(opts);

		// After both plan and visual prescriptions are ready, weave them into final structured block blueprint items.
		const plan = this.context.getReportPlan();
		if (plan) {
			const blueprint = this.context.getReportVisualBlueprint();
			const items = weaveReportBlockBlueprintItems(plan, blueprint);
			this.context.setReportBlockBlueprintItems(items);
		}
		yield uiStageSignal(reportPlanMeta, { status: 'complete', triggerName: StreamTriggerName.SEARCH_REPORT_PLAN_AGENT });
	}

	/**
	 * Stream the report plan agent; yields LLM events and writes reportPlan to context on completion.
	 */
	private async *streamTextPlan(opts?: { stepId?: string }): AsyncGenerator<LLMStreamEvent> {
		const stepId = opts?.stepId ?? generateUuidWithoutHyphens();

		const system = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisReportPlanSystem, {});
		const prompt = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisReportPlan, {
			originalQuery: this.context.getInitialPrompt() ?? '',
			evidenceTaskGroups: this.context.getRecallEvidenceTaskGroups(),
			verifiedFactSheet: this.context.getVerifiedFactSheet(),
			overviewMermaid: this.context.getEvidenceWeavedMermaidOverview(),
		});

		yield buildPromptTraceDebugEvent(StreamTriggerName.SEARCH_REPORT_PLAN_AGENT, system, prompt);

		const reportPlanMeta = { runStepId: stepId, stage: 'reportPlan' as const, agent: 'ReportPlanAgent' };
		const result = this.textPlanAgent.stream({ system, prompt });
		yield* streamTransform(result.fullStream, StreamTriggerName.SEARCH_REPORT_PLAN_AGENT, {
			yieldUIStep: { uiType: UIStepType.STEPS_DISPLAY, stepId },
			yieldExtraAfterEvent: (chunk) => {
				if (chunk.type === 'tool-result' && (chunk as { toolName?: string }).toolName === 'submit_phase_and_get_next_to_plan') {
					const input = (chunk as { input?: { phaseId?: string } }).input;
					return uiStageSignal(reportPlanMeta, {
						status: 'progress',
						payload: {
							phaseId: input?.phaseId,
							index: this.phasePlans.length,
							total: REPORT_PLAN_PHASE_IDS.length,
						},
						triggerName: StreamTriggerName.SEARCH_REPORT_PLAN_AGENT,
					});
				}
			},
		});

		const reportPlan = this.buildReportPlanFromPhases();
		this.context.setReportPlan(reportPlan);
		yield {
			type: 'pk-debug',
			debugName: 'report-plan-complete',
			triggerName: StreamTriggerName.SEARCH_REPORT_PLAN_AGENT,
			extra: { reportPlan, phaseCount: this.phasePlans.length },
		};
	}

	/** Build ReportPlan from accumulated phase submissions (multiple pages per phase when status was "draft"). */
	private buildReportPlanFromPhases(): ReportPlan {
		const byPhase = new Map<string, string[]>();
		for (const { phaseId, planMarkdown } of this.phasePlans) {
			const list = byPhase.get(phaseId) ?? [];
			list.push(planMarkdown);
			byPhase.set(phaseId, list);
		}

		const get = (id: ReportPlanPhaseId): string | undefined => {
			const pages = byPhase.get(id);
			return pages?.length ? pages.join('\n\n') : undefined;
		};

		const bodyBlocksSpec: BodyBlockSpec[] = [];
		for (const pid of REPORT_PLAN_BODY_PHASE_IDS) {
			const pages = byPhase.get(pid) ?? [];
			const baseBlockId = pid.replace('body_', 'report_body_');
			const blockIdPrefix = baseBlockId.startsWith('report_') ? baseBlockId : `report_${baseBlockId}`;
			const titleBase = pid.replace(/_/g, ' ');
			for (let i = 0; i < pages.length; i++) {
				const blockId = pages.length === 1 ? blockIdPrefix : `${blockIdPrefix}_${i + 1}`;
				const title = pages.length === 1 ? titleBase : `${titleBase} ${i + 1}`;
				bodyBlocksSpec.push({
					blockId,
					title,
					role: pid,
					paragraphSkeleton: pages[i],
					evidenceBinding: null,
					chartOrTableShape: null,
					risksUncertaintyHint: null,
					wordTarget: null,
				});
			}
		}

		const appendicesBlocksSpec: AppendicesBlockSpec[] = [];
		const appendicesPages = byPhase.get('appendices') ?? [];
		for (let i = 0; i < appendicesPages.length; i++) {
			const blockId = appendicesPages.length === 1 ? 'report_appendices' : `report_appendices_${i + 1}`;
			const title = appendicesPages.length === 1 ? 'Appendices' : `Appendices ${i + 1}`;
			appendicesBlocksSpec.push({
				blockId,
				title,
				role: 'appendices',
				contentHint: appendicesPages[i],
			});
		}

		return {
			intentInsight: get('intent_insight') ?? null,
			summarySpec: get('summary_spec') ?? null,
			overviewMermaidSpec: get('overview_mermaid') ?? null,
			topicsSpec: get('topics') ?? null,
			bodyBlocksSpec,
			appendicesBlocksSpec,
			actionItemsSpec: get('actions_todo_list') ?? null,
			followupQuestionsSpec: get('actions_followup_questions') ?? null,
			sourcesViewsSpec: null,
		};
	}
}
