import { AIServiceManager } from '@/service/chat/service-manager';
import { LLMStreamEvent, StreamTriggerName, UISignalChannel, UISignalKind, UIStepType } from '@/core/providers/types';
import { PromptId } from '@/service/prompt/PromptId';
import {
	buildPromptTraceDebugEvent,
	streamTransform,
	withRetryStream,
	accumulateTokenUsage,
	type RetryContext,
} from '@/core/providers/helpers/stream-helper';
import type { AgentContextManager } from './AgentContextManager';
import { MermaidFixAgent } from './MermaidFixAgent';
import { streamText, Output } from 'ai';
import { overviewLogicModelSchema, type OverviewLogicModel } from '@/core/schemas/agents/search-agent-schemas';
import { getMermaidInner, sanitizeMermaidOverview } from '@/core/utils/mermaid-utils';
import { validateMermaidCode } from '@/core/utils/analysis-data-validator';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import type { EvidencePack } from '@/core/schemas/agents/search-agent-schemas';
import { makeStepId, uiStageSignal } from './helpers/search-ui-events';
import type { ReconSynthesisBundle } from './helpers/recon-synthesis-helper';
import { ReconOverviewWeaveAgent } from './ReconOverviewWeaveAgent';

export interface MermaidOverviewVariables {
	originalQuery: string;
	agentMemoryMessage: string;
	lastMermaid?: string;
}

/** Output ref for phase1: logic model or parse error. */
type Phase1Out = { model: OverviewLogicModel | null; error: string | null };

/** Output ref for phase2: raw render stream result. */
type Phase2Out = { renderOutput: string };

/**
 * Two-phase overview agent: (1) build logic model from evidence packs (streamObject),
 * (2) render Mermaid, validate/fix, then set overviewMermaid and emit OVERVIEW_MERMAID signal.
 * Used by ReportAgent for the main pipeline and by SummaryAgent for tool-based regeneration.
 */
export class EvidenceMermaidOverviewWeaveAgent {
	private readonly aiServiceManager: AIServiceManager;
	private readonly context: AgentContextManager;
	private readonly mermaidFixAgent: MermaidFixAgent;

	constructor(params: { aiServiceManager: AIServiceManager; context: AgentContextManager }) {
		this.aiServiceManager = params.aiServiceManager;
		this.context = params.context;
		this.mermaidFixAgent = new MermaidFixAgent(params.aiServiceManager);
	}

	/**
	 * Recon-only entry: dedicated agent with content_reader and inspect_note_context builds logic model
	 * from ReconSynthesisBundle (prompt uses reconReports + reconGraphSummary); then phase2 renders Mermaid.
	 */
	public async *streamFromReconBundle(bundle: ReconSynthesisBundle, stepId?: string): AsyncGenerator<LLMStreamEvent> {
		const id = stepId ?? generateUuidWithoutHyphens();
		if (bundle.reports.length === 0) {
			this.context.setEvidenceWeavedMermaidOverviewAgent('');
			return;
		}

		const reconAgent = new ReconOverviewWeaveAgent(this.aiServiceManager, this.context);
		yield* reconAgent.stream(bundle, id);

		const logicModel = reconAgent.getSubmittedModel();
		if (!logicModel) {
			this.context.setEvidenceWeavedMermaidOverviewAgent('');
			yield uiStageSignal(
				{ runStepId: id, stage: 'overview', agent: 'EvidenceMermaidOverviewWeaveAgent' },
				{ status: 'error', payload: { error: 'No logic model submitted by recon overview agent.' }, triggerName: StreamTriggerName.SEARCH_OVERVIEW_MERMAID },
			);
			return;
		}

		const overviewMeta = { runStepId: id, stage: 'overview' as const, agent: 'EvidenceMermaidOverviewWeaveAgent' };
		const phase2Out: Phase2Out = { renderOutput: '' };
		yield* this.phase2StreamRender(id, logicModel, phase2Out);

		let mermaid = getMermaidInner(phase2Out.renderOutput).trim();
		if (!mermaid) {
			this.context.setEvidenceWeavedMermaidOverviewAgent('');
			return;
		}
		mermaid = sanitizeMermaidOverview(mermaid);

		const validation = await validateMermaidCode(mermaid);
		if (!validation.valid) {
			yield* this.mermaidFixAgent.ifInvalidThenFix(mermaid, (fixed) => {
				this.context.setEvidenceWeavedMermaidOverviewAgent(fixed);
			});
		} else {
			this.context.setEvidenceWeavedMermaidOverviewAgent(mermaid);
		}

		const finalOverview = this.context.getEvidenceWeavedMermaidOverview();
		if (finalOverview) {
			yield uiStageSignal(overviewMeta, { status: 'complete', triggerName: StreamTriggerName.SEARCH_OVERVIEW_MERMAID });
			yield {
				type: 'pk-debug',
				debugName: 'agent-result',
				triggerName: StreamTriggerName.SEARCH_OVERVIEW_MERMAID,
				...this.context.yieldAgentResult(),
			};
			yield {
				type: 'ui-signal',
				channel: UISignalChannel.OVERVIEW_MERMAID,
				kind: UISignalKind.COMPLETE,
				entityId: 'overview-mermaid',
				payload: { mermaid: finalOverview },
			};
		}

		yield* this.mermaidFixAgent.ifInvalidThenFix(this.context.getEvidenceWeavedMermaidOverview(), (fixed) => {
			this.context.setEvidenceWeavedMermaidOverviewAgent(fixed);
		});
	}

	/**
	 * Entry: retry wrapper then optional Mermaid validation fix. Actual two-phase logic lives in realStreamInternal.
	 */
	public async *stream(opts?: { stepId?: string }): AsyncGenerator<LLMStreamEvent> {
		const stepId = opts?.stepId ?? generateUuidWithoutHyphens();
		const packs = this.context.getRecallEvidencePacks();
		if (packs.length === 0) {
			this.context.setEvidenceWeavedMermaidOverviewAgent('');
			return;
		}

		const self = this;
		yield* withRetryStream(
			{ stepId },
			async function* (vars: { stepId: string }, retryCtx?: RetryContext) {
				yield* self.realStreamInternal(vars.stepId, retryCtx);
			},
			{ maxRetries: 2, triggerName: StreamTriggerName.SEARCH_OVERVIEW_MERMAID },
		);

		yield* this.mermaidFixAgent.ifInvalidThenFix(this.context.getEvidenceWeavedMermaidOverview(), (fixed) => {
			this.context.setEvidenceWeavedMermaidOverviewAgent(fixed);
		});
	}

	/**
	 * Orchestrates two phases and post-processing: phase1 → check → phase2 → validate/fix → emit signal.
	 */
	private async *realStreamInternal(
		stepId: string,
		retryCtx?: RetryContext,
	): AsyncGenerator<LLMStreamEvent> {
		const overviewMeta = { runStepId: stepId, stage: 'overview' as const, agent: 'EvidenceMermaidOverviewWeaveAgent' };
		yield uiStageSignal(overviewMeta, { status: 'start', triggerName: StreamTriggerName.SEARCH_OVERVIEW_MERMAID });

		const packs = this.context.getRecallEvidencePacks();
		const phase1Out: Phase1Out = { model: null, error: null };

		yield* this.phase1StreamLogicModel(stepId, packs, retryCtx, phase1Out);

		const logicModel = phase1Out.model;
		if (!logicModel) {
			this.context.setEvidenceWeavedMermaidOverviewAgent('');
			yield uiStageSignal(overviewMeta, {
				status: 'error',
				payload: { error: phase1Out.error },
				triggerName: StreamTriggerName.SEARCH_OVERVIEW_MERMAID,
			});
			yield {
				type: 'pk-debug',
				debugName: 'overview_logic_model_failed',
				triggerName: StreamTriggerName.SEARCH_OVERVIEW_MERMAID,
				extra: { error: phase1Out.error },
			};
			return;
		}

		yield {
			type: 'pk-debug',
			debugName: 'overview_logic_model',
			triggerName: StreamTriggerName.SEARCH_OVERVIEW_MERMAID,
			extra: { logicModel },
		};

		const phase2Out: Phase2Out = { renderOutput: '' };
		yield* this.phase2StreamRender(stepId, logicModel, phase2Out);

		let mermaid = getMermaidInner(phase2Out.renderOutput).trim();
		if (!mermaid) {
			this.context.setEvidenceWeavedMermaidOverviewAgent('');
			return;
		}
		mermaid = sanitizeMermaidOverview(mermaid);

		const validation = await validateMermaidCode(mermaid);
		if (!validation.valid) {
			yield* this.mermaidFixAgent.ifInvalidThenFix(mermaid, (fixed) => {
				this.context.setEvidenceWeavedMermaidOverviewAgent(fixed);
			});
		} else {
			this.context.setEvidenceWeavedMermaidOverviewAgent(mermaid);
		}

		const finalOverview = this.context.getEvidenceWeavedMermaidOverview();
		if (finalOverview) {
			yield uiStageSignal(overviewMeta, { status: 'complete', triggerName: StreamTriggerName.SEARCH_OVERVIEW_MERMAID });
			yield {
				type: 'pk-debug',
				debugName: 'agent-result',
				triggerName: StreamTriggerName.SEARCH_OVERVIEW_MERMAID,
				...this.context.yieldAgentResult(),
			};
			yield {
				type: 'ui-signal',
				channel: UISignalChannel.OVERVIEW_MERMAID,
				kind: UISignalKind.COMPLETE,
				entityId: 'overview-mermaid',
				payload: { mermaid: finalOverview },
			};
		}
	}

	/**
	 * Phase 1: stream logic model from evidence packs (withRetryStream + streamObject). Writes result to out.
	 */
	private async *phase1StreamLogicModel(
		stepId: string,
		packs: EvidencePack[],
		retryCtx: RetryContext | undefined,
		out: Phase1Out,
	): AsyncGenerator<LLMStreamEvent> {
		yield {
			type: 'ui-step',
			uiType: UIStepType.STEPS_DISPLAY,
			stepId,
			title: 'Modeling overview logic…',
			triggerName: StreamTriggerName.SEARCH_OVERVIEW_MERMAID,
		};

		type Phase1Vars = { userQuery: string; evidencePacks: EvidencePack[]; repairHint?: string };
		const userQuery = this.context.getInitialPrompt() ?? '';

		yield* withRetryStream(
			{ userQuery, evidencePacks: packs, repairHint: retryCtx?.lastRetryText as string | undefined },
			async function* (vars: Phase1Vars, innerRetryCtx?: RetryContext) {
				out.model = null;
				out.error = null;
				const repairHint = innerRetryCtx?.lastRetryText ?? vars.repairHint;
				const system = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisOverviewLogicModelSystem, {});
				const prompt = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisOverviewLogicModel, {
					userQuery: vars.userQuery,
					evidencePacks: vars.evidencePacks,
					repairHint,
				});
				yield buildPromptTraceDebugEvent(StreamTriggerName.SEARCH_OVERVIEW_MERMAID, system, prompt);

				const { provider, modelId } = this.aiServiceManager.getModelForPrompt(PromptId.AiAnalysisOverviewLogicModel);
				const model = this.aiServiceManager.getMultiChat().getProviderService(provider).modelClient(modelId);
				const result = streamText({
					model,
					system,
					prompt,
					experimental_output: Output.object({
						schema: overviewLogicModelSchema,
					}),
				});

				yield* streamTransform(result.fullStream, StreamTriggerName.SEARCH_OVERVIEW_MERMAID, {
					yieldUIStep: { uiType: UIStepType.STEPS_DISPLAY, stepId },
				});
				const text = await result.text;
				const parsed = overviewLogicModelSchema.safeParse(JSON.parse(text));
				if (parsed.success) {
					out.model = parsed.data;
					out.error = null;
				} else {
					out.error = parsed.error.message;
				}
			}.bind(this),
			{
				maxRetries: 1,
				triggerName: StreamTriggerName.SEARCH_OVERVIEW_MERMAID,
				postStreamRetryCheckFn: () => {
					if (out.error) return { shouldRetry: true, retryText: out.error };
					if (!out.model) return { shouldRetry: true, retryText: 'No logic model produced.' };
					const hasCF = out.model.edges.some((e) => e.relation === 'conflict' || e.relation === 'feedback');
					if (!hasCF) return { shouldRetry: true, retryText: 'At least one edge must have relation conflict or feedback.' };
					return { shouldRetry: false, retryText: '' };
				},
			},
		);
	}

	/**
	 * Phase 2: stream Mermaid render from logic model; accumulates raw output into out.renderOutput.
	 * Uses streamText + streamTransform (same as phase1); fallback to result.reasoningText when result.text is empty.
	 */
	private async *phase2StreamRender(
		stepId: string,
		logicModel: OverviewLogicModel,
		out: Phase2Out,
	): AsyncGenerator<LLMStreamEvent> {
		const triggerName = StreamTriggerName.SEARCH_OVERVIEW_MERMAID;
		const overviewMeta = { runStepId: stepId, stage: 'overview' as const, agent: 'EvidenceMermaidOverviewWeaveAgent' };
		const phase2StepId = makeStepId(overviewMeta);
		yield {
			type: 'ui-step',
			uiType: UIStepType.STEPS_DISPLAY,
			stepId: phase2StepId,
			title: 'Rendering overview mermaid…',
			triggerName,
		};

		const userQuery = this.context.getInitialPrompt() ?? '';
		const logicModelJson = JSON.stringify(logicModel);
		const system = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisOverviewMermaidRenderSystem, {});
		const prompt = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisOverviewMermaidRender, {
			userQuery,
			logicModelJson,
		});
		yield buildPromptTraceDebugEvent(triggerName, system, prompt);

		const { provider, modelId } = this.aiServiceManager.getModelForPrompt(PromptId.AiAnalysisOverviewMermaidRender);
		const model = this.aiServiceManager.getMultiChat().getProviderService(provider).modelClient(modelId);
		const result = streamText({ model, system, prompt });

		yield* streamTransform(result.fullStream, triggerName, {
			yieldUIStep: { uiType: UIStepType.STEPS_DISPLAY, stepId: phase2StepId },
		});

		const text = await result.text;
		const reasoningText = await (result as { reasoningText?: Promise<string | undefined> }).reasoningText ?? '';
		out.renderOutput = (text?.trim() || String(reasoningText ?? '').trim() || '').trim();
	}
}
