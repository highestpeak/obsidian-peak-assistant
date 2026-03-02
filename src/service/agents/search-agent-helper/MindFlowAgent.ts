/**
 * MindFlow Agent: drives thinking-tree Mermaid, progress, and continue/stop decision.
 * Emits GraphPatch via ui-signal; updates agentResult.graph.
 */

import { Experimental_Agent as Agent, stepCountIs } from 'ai';
import {
	mindflowMermaidInputSchema,
	mindflowProgressInputSchema,
	mindflowTraceInputSchema,
} from '@/core/schemas/agents';
import { AIServiceManager } from '@/service/chat/service-manager';
import { LLMStreamEvent, StreamTriggerName, UIStepType, UISignalChannel, UISignalKind } from '@/core/providers/types';
import { ErrorRetryInfo, PromptId } from '@/service/prompt/PromptId';
import { safeAgentTool } from '@/service/tools/types';
import type { AgentTool } from '@/service/tools/types';
import { buildErrorRetryInfo, buildPromptTraceDebugEvent, streamTransform, withRetryStream, type RetryContext } from '@/core/providers/helpers/stream-helper';
import { MINDFLOW_STATE_SYNTAX } from './mindflow/types';
import { normalizeMermaidNodeStyleColons } from '@/core/utils/mermaid-utils';
import { AgentContextManager, AgentMemoryToolSet } from './AgentContextManager';
import { MermaidFixAgent } from './MermaidFixAgent';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import { getVaultPersona, type VaultPersona } from '@/service/tools/system-info';

const MINDFLOW_TOOL_NAMES = new Set(['submit_mindflow_mermaid', 'submit_mindflow_trace', 'submit_mindflow_progress']);

/** First N progress submissions (pre-thought + 1st post-thought) use Broad Recon; relaxed to allow 1–2 index/summary reads for initial facts. */
const BROAD_RECON_ROUNDS = 1;
const BROAD_RECON_PREFIX = '[INTENT:BROAD_RECON]\n';
const BROAD_RECON_BAN =
	'Prefer keyword/directory recon and candidate path list (top-N + why). You may use content_reader on 1–2 index or summary pages only (shortSummary or range) to get initial facts; do not deep-read many single files.';

/** Tactical Library: instruction must start with one of these so RawSearch gets a concrete strategy. */
const TACTIC_REGEX =
	/\[(HUB_RECON|BRIDGE_FINDING|INVENTORY_SCAN|SEED_EXPANSION|PULSE_DETECTION|CONFLICT_DIVE|GHOST_HUNTING|REASONING_RECOVERY|EDGE_CASE_PROBING|OMNISCIENT_RECON)\]/;
const REJECTED_MESSAGE =
	'[REJECTED: Missing Tactic] Instruction must start with one of [HUB_RECON], [BRIDGE_FINDING], [INVENTORY_SCAN], [SEED_EXPANSION], [PULSE_DETECTION], [CONFLICT_DIVE], [GHOST_HUNTING], [REASONING_RECOVERY], [EDGE_CASE_PROBING], [OMNISCIENT_RECON] and specify required params. Coordinator must re-issue a tactic-based instruction.';
const GAP_INCOMPLETE_CRITIQUE = 'Gap list incomplete; do not clear gaps until coverage is sufficient.';
const GAP_PLACEHOLDERS = ['Gap: cross-folder coverage', 'Gap: recency / recent changes', 'Gap: negative or conflicting evidence'];
const MIN_VERIFIED_PATHS_TO_ALLOW_STOP = 2;
const MIN_FACTS_TO_ALLOW_STOP = 1;
/** When planner reports completeness >= this, allow FINAL_ANSWER even if fact/path counts are below minimum (logic-closure priority). */
const LOGIC_CLOSURE_COMPLETENESS_THRESHOLD = 80;
/** Min distinct top-level path segments to allow FINAL_ANSWER (diversity override: evidence from multiple zones). */
const MIN_ROOT_DIVERSITY_FOR_STOP = 2;

/** Phase: pre-thought (before RawSearch) or post-thought (after RawSearch). */
export type MindFlowPhase = 'pre-thought' | 'post-thought';

/** Planner decision: who to run next or stop. */
export type MindflowDecision = 'CONTINUE_SEARCH' | 'REQUEST_COMPRESSION' | 'FINAL_ANSWER';

export interface MindflowProgress {
	estimatedCompleteness: number;
	statusLabel: string;
	goalAlignment?: string;
	critique?: string;
	decision?: MindflowDecision;
	confirmed_facts?: string[];
	gaps?: string[];
	instruction?: string;
}

type MindFlowToolSet = AgentMemoryToolSet & {
	submit_mindflow_mermaid: AgentTool;
	submit_mindflow_trace: AgentTool;
	submit_mindflow_progress: AgentTool;
};

/**
 * Latest RawSearch run info for MindFlow input.
 * MindFlow uses this to audit tactical quality and decide next instruction.
 */
export interface RawSearchInfoForMindFlowInput {
	latestLoopDelta?: string;
	latestLoopRawSearchExecutionSummarys?: string[];
	latestLoopRawSearchEvidenceFoundStatisticsInfo?: string;
}

export interface MindFlowVariables {
	phase: MindFlowPhase;
	/** 
	 * User's initial search question
	 * Task context. Mission objective.
	 * Purpose: anchor the final goal, thereby preventing the Agent from falling into a local search deadlock. It ensures that the Agent always moves towards the endpoint without being distracted by interesting details along the way.
	 * */
	userQuery: string;
	/** 
	 * Inventory snapshot. Knowledge status. Inventory.
	 * Answer the question. Based on the previous loop. what we have found.
	 * Need: not only the path_or_url, but also the summary snippet for that path_or_url.
	 * Facts only: do not give all the raw snippets from RawSearch to MindFlow, only give the fact list after summarization.
	 * */
	confirmedFacts?: string[];
	/**
	 * last mindflow output: mermaid diagram. (represent the thinking tree)
	 * Used for next generation. try not to change layout so much. also align to the last thinking tree.
	 */
	previousMindflowMermaid?: string;

	/**
	 * only extract the statusLabel and confirmed_facts in MindflowProgress from previous loops in AgentContextManager.
	 * Purpose: who am i? where am i from?
	 */
	rollingMindflowHistory?: string[];
	/**
	 * Latest 1–2 RawSearch run deltas for audit.
	 */
	latestRawSearchInfo?: RawSearchInfoForMindFlowInput[];
	/**
	 * Vault "terrain map" — fed in pre-thought and first 2 post-thought rounds (cached).
	 */
	vault_map?: VaultPersona;
	/** Coverage stats for crisis hint (verified paths count, fact count, sample paths). */
	coverageSummary?: { verifiedPathsCount: number; factCount: number; samplePaths: string[] };
	/** Latest Knowledge Panel (clusters, conflicts, open_questions) for audit and stop decision. */
	knowledge_panel?: string;
	/** Whether RawSearch can use web search; when true, MindFlow may instruct external/live info when the query needs it. */
	webSearchEnabled?: boolean;
}

export interface MindFlowResult {
	progress?: MindflowProgress;
	mermaid?: string;
	traces?: string;
}

/** Creates MindFlow tools and agent. */
/** Options passed into MindFlow so it can tailor instruction (e.g. vault-only vs web). */
export interface MindFlowAgentOptions {
	enableWebSearch?: boolean;
}

export class MindFlowAgent {
	private readonly aiServiceManager: AIServiceManager;
	private readonly context: AgentContextManager;
	private readonly options: MindFlowAgentOptions;
	private readonly mermaidFixAgent: MermaidFixAgent;
	private agent: Agent<MindFlowToolSet>;
	/** Cached vault map for first 2 post-thought rounds so MindFlow keeps terrain awareness. */
	private cachedVaultMap: VaultPersona | null = null;

	private oneGenerationResult: MindFlowResult = {
		progress: undefined,
		mermaid: undefined,
		traces: undefined,
	};

	constructor(params: {
		aiServiceManager: AIServiceManager;
		context: AgentContextManager;
		options?: MindFlowAgentOptions;
	}) {
		this.aiServiceManager = params.aiServiceManager;
		this.context = params.context;
		this.options = params.options ?? {};
		this.mermaidFixAgent = new MermaidFixAgent(params.aiServiceManager);

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
			 * consumers: UI step description, RawSearch prompt context.
			 */
			submit_mindflow_trace: this.buildTraceTool(),
			/**
			 * submit structured progress and "continue/stop" decision. 
			 * consumers: orchestration layer (decide whether to continue RawSearch loop), UI progress display.
			 */
			submit_mindflow_progress: this.buildProgressTool(),
		};

		this.agent = new Agent<MindFlowToolSet>({
			model: this.aiServiceManager.getMultiChat()
				.getProviderService(provider)
				.modelClient(modelId),
			tools,
			stopWhen: [
				// stop when all three MindFlow tools have been called
				({ steps }) => {
					const called = new Set(
						steps.flatMap((step) => (step.toolCalls ?? []).map((c: { toolName: string }) => c.toolName))
					);
					return [...MINDFLOW_TOOL_NAMES].every((name) => called.has(name));
				},
				// avoid infinite loop or meaningless repetition
				stepCountIs(20),
			],
		});
	}

	private buildMermaidTool(): AgentTool {
		return safeAgentTool({
			description: `Submit the current thinking tree as constrained flowchart TD Mermaid. Use nodes with exactly three colons before the state: ]:::thinking, ]:::exploring, ]:::verified, ]:::pruned (not two colons ]::). States: ${MINDFLOW_STATE_SYNTAX}. Edges A -->|short text| B. Node labels: plain text only—no double quotes, backslashes, or slashes inside labels (they cause parse errors); ≤12–16 chars (or ~4–6 CJK); fallback 2–3 words. No style/classDef lines. One short line per node; balanced layout.`,
			inputSchema: mindflowMermaidInputSchema,
			execute: async (input) => {
				const raw = (input?.code ?? '').trim();
				const normalized = normalizeMermaidNodeStyleColons(raw);
				this.oneGenerationResult.mermaid = normalized;
				return {
					mermaid: normalized
				};
			},
		});
	}

	private buildTraceTool(): AgentTool {
		return safeAgentTool({
			description: 'Submit a short trace of what you are doing or planning to correct next.',
			inputSchema: mindflowTraceInputSchema,
			execute: async (input) => {
				const text = (input?.text ?? '').trim();
				const trace = text || 'Thinking…';
				this.oneGenerationResult.traces = trace;
				return { trace };
			},
		});
	}

	private buildProgressTool(): AgentTool {
		const self = this;
		return safeAgentTool({
			description: 'Submit progress: completeness, status, goal alignment, critique, decision (CONTINUE_SEARCH/REQUEST_COMPRESSION/FINAL_ANSWER), confirmed_facts, gaps, and instruction (high-level task) for next agent. In post-thought, when Inventory or Latest RawSearch runs contain facts or discovered_leads, you MUST populate confirmed_facts (merge previous + new); do not leave empty when evidence exists.',
			inputSchema: mindflowProgressInputSchema,
			execute: async (input) => {
				let instruction = (input?.instruction ?? '').trim();
				let critique = input?.critique ?? '';
				let gaps = input?.gaps ?? [];
				const rawCompleteness = input?.estimatedCompleteness ?? 0;
				const confirmedCount = (input?.confirmed_facts ?? []).length;

				const progressHistory = self.context.getMindflowProgressHistory();
				const lastCompleteness = progressHistory.length > 0
					? (progressHistory[progressHistory.length - 1]?.estimatedCompleteness ?? 0)
					: 0;
				// Enforce no regression: completeness must not decrease (Guiding Philosophy).
				const estimatedCompleteness = Math.max(rawCompleteness, lastCompleteness);
				const isFirstTwoRounds = progressHistory.length < BROAD_RECON_ROUNDS;

				if (isFirstTwoRounds) {
					if (!instruction.toUpperCase().includes('[INTENT:BROAD_RECON]')) {
						instruction = BROAD_RECON_PREFIX + instruction;
					}
					if (!instruction.includes('Do NOT deep read')) {
						instruction = instruction + '\n' + BROAD_RECON_BAN;
					}
				}

				if (gaps.length === 0 && (estimatedCompleteness < 80 || confirmedCount < 3)) {
					critique = critique
						? critique + '\n' + GAP_INCOMPLETE_CRITIQUE
						: GAP_INCOMPLETE_CRITIQUE;
					gaps = [...gaps, ...GAP_PLACEHOLDERS];
				}

				const decision = (input?.decision as MindflowDecision) ?? 'CONTINUE_SEARCH';
				if (decision === 'CONTINUE_SEARCH' && instruction && !TACTIC_REGEX.test(instruction)) {
					instruction = REJECTED_MESSAGE;
				}

				const p: MindflowProgress = {
					estimatedCompleteness,
					statusLabel: input?.statusLabel ?? '',
					goalAlignment: input?.goalAlignment,
					critique: critique || undefined,
					decision,
					confirmed_facts: input?.confirmed_facts,
					gaps,
					instruction,
				};
				self.oneGenerationResult.progress = p;
				return { progress: p };
			},
		});
	}

	private resetOneGenerationResult(): void {
		this.oneGenerationResult = {
			progress: undefined,
			mermaid: undefined,
			traces: undefined,
		};
	}

	/**
	 * Stream MindFlow Mermaid + progress. Retries on tool/stream error only. If mermaid validation
	 * fails after the run, uses MermaidFixAgent to fix (up to 2 fix retries) instead of re-running the full agent.
	 */
	public async *stream(
		opts: { stepId?: string; phase: MindFlowPhase },
	): AsyncGenerator<LLMStreamEvent> {
		this.resetOneGenerationResult();

		const { stepId, phase } = opts;
		const self = this;

		yield* withRetryStream(
			{},
			(_, retryCtx) => self.realStreamInternal({ phase, retryCtx, stepId }),
			{
				maxRetries: 2,
				triggerName: StreamTriggerName.SEARCH_MINDFLOW_AGENT,
				postStreamRetryCheckFn: () => {
					const missing: string[] = [];
					if (self.oneGenerationResult.traces === undefined) missing.push('submit_mindflow_trace');
					if (!(self.oneGenerationResult.mermaid ?? '').trim()) missing.push('submit_mindflow_mermaid');
					if (self.oneGenerationResult.progress === undefined) missing.push('submit_mindflow_progress');

					return {
						shouldRetry: missing.length > 0,
						retryText: `**CRITICAL**: You did not call: ${missing.join(',')}. You **MUST** call them now in order: `
							+ `\`submit_mindflow_trace\` → \`submit_mindflow_mermaid\` → \`submit_mindflow_progress\`.`
							+ ` Without \`submit_mindflow_progress\`, RawSearchAgent receives no instruction and the pipeline fails. `
							+ `Issue the specific instruction (what to find, where to look, what to avoid) and decision. Try to fill all the fields in the tool please.`
					};
				}
			},
		);

		const mermaid = (self.oneGenerationResult.mermaid ?? '').trim();
		yield* self.mermaidFixAgent.ifInvalidThenFix(mermaid, (m) => {
			this.oneGenerationResult.mermaid = m;
		});

		self.context.addMindFlowResult(this.oneGenerationResult);
	}

	private async *realStreamInternal(
		opts: { phase: MindFlowPhase; retryCtx?: ErrorRetryInfo | RetryContext; stepId?: string },
	): AsyncGenerator<LLMStreamEvent> {
		let { phase, retryCtx, stepId } = opts;
		stepId = stepId ?? generateUuidWithoutHyphens()
		console.debug('MindFlowAgent.realStreamInternal', { phase, retryCtx, stepId });
		yield {
			type: 'ui-step',
			uiType: UIStepType.STEPS_DISPLAY,
			stepId,
			title: phase === 'pre-thought' ? 'Planning next exploration...' : 'Reflecting on findings...',
			description: '',
			triggerName: StreamTriggerName.SEARCH_MINDFLOW_AGENT,
		};

		const promptInfo = await this.aiServiceManager.getPromptInfo(PromptId.AiAnalysisMindflowAgent);
		const system = await this.aiServiceManager.renderPrompt(promptInfo.systemPromptId!, {});
		const dossierSummary = this.context.getDossierForSummary();
		const isPreThought = phase === 'pre-thought';
		const progressHistory = this.context.getMindflowProgressHistory();
		let vaultMap: VaultPersona | undefined;
		if (isPreThought) {
			vaultMap = await getVaultPersona();
			this.cachedVaultMap = vaultMap;
		} else if (this.cachedVaultMap && progressHistory.length <= BROAD_RECON_ROUNDS) {
			vaultMap = this.cachedVaultMap;
		}
		const coverageSummary = this.context.getCoverageSummaryForMindFlow?.();
		const knowledge_panel = this.context.getKnowledgePanelForMindFlow();
		const prompt = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisMindflowAgent, {
			phase,
			userQuery: this.context.getInitialPrompt() ?? '',
			confirmedFacts: dossierSummary.confirmedFacts?.length ? dossierSummary.confirmedFacts : undefined,
			previousMindflowMermaid: this.context.getLatestMindflowMermaid() ?? undefined,
			rollingMindflowHistory: this.context.getLatestMindflowProgressHistory(),
			latestRawSearchInfo: [
				this.context.getRawSearchInfoForMindFlowInput(2),
				this.context.getRawSearchInfoForMindFlowInput(1),
			].filter((t): t is RawSearchInfoForMindFlowInput => t !== undefined),
			vault_map: vaultMap,
			coverageSummary,
			knowledge_panel: knowledge_panel || undefined,
			webSearchEnabled: this.options.enableWebSearch ?? false,
			...buildErrorRetryInfo(retryCtx) ?? {},
		});
		yield buildPromptTraceDebugEvent(StreamTriggerName.SEARCH_MINDFLOW_AGENT, system, prompt);

		// call agent
		const result = this.agent.stream({ system, prompt });
		const self = this;
		yield* streamTransform(result.fullStream, StreamTriggerName.SEARCH_MINDFLOW_AGENT, {
			yieldUIStep: { uiType: UIStepType.STEPS_DISPLAY, stepId },
			// yieldEventPostProcessor: (chunk: any) => {
			// 	return MINDFLOW_TOOL_NAMES.has(chunk.toolName)
			// 		? { extra: { currentResult: self.context.getAgentResult() } }
			// 		: {};
			// },
			yieldExtraAfterEvent: !stepId ? undefined : (chunk: any) => {
				if (chunk.type === 'tool-result') {
					const toolName = chunk.toolName;
					const output = chunk.output ?? {};
					const res = output.result ?? output;
					if (toolName === 'submit_mindflow_trace' && res?.trace) {
						return {
							type: 'ui-step-delta',
							uiType: UIStepType.STEPS_DISPLAY,
							stepId,
							descriptionDelta: res.trace,
						};
					}
					// Emit stage as soon as mermaid is submitted so UI shows diagram early
					if (toolName === 'submit_mindflow_mermaid') {
						return {
							type: 'ui-signal',
							id: `sig-mindflow-mermaid-${Date.now()}`,
							channel: UISignalChannel.MINDFLOW_MERMAID,
							kind: UISignalKind.STAGE,
							entityId: stepId,
							payload: { mermaid: this.oneGenerationResult.mermaid, progress: this.oneGenerationResult.progress },
						};
					}
					return undefined;
				}
				if (chunk.type === 'finish') {
					return {
						type: 'ui-signal',
						id: `sig-mindflow-snapshot-${Date.now()}`,
						channel: UISignalChannel.MINDFLOW_MERMAID,
						kind: UISignalKind.STAGE,
						entityId: stepId,
						payload: { mermaid: this.oneGenerationResult.mermaid, progress: this.oneGenerationResult.progress },
					};
				}
				return undefined;
			}
		});
	}

	public async *checkMindFlowProgreeDecision(
		iterationCount: number,
		setShouldBreak: (shouldBreak: boolean) => void,
	): AsyncGenerator<LLMStreamEvent> {
		const lastProgress = this.context.getLatestMindflowProgress();
		yield {
			type: 'ui-step',
			uiType: UIStepType.STEPS_DISPLAY,
			stepId: generateUuidWithoutHyphens(),
			title: 'Evaluating progress...',
			description: '',
			triggerName: StreamTriggerName.SEARCH_MINDFLOW_AGENT,
		};

		if (lastProgress) {
			yield {
				type: 'ui-signal' as const,
				id: `sig-mindflow-progress-ui-${Date.now()}`,
				channel: UISignalChannel.MINDFLOW_PROGRESS,
				kind: UISignalKind.PROGRESS,
				entityId: generateUuidWithoutHyphens(),
				payload: lastProgress,
				triggerName: StreamTriggerName.SEARCH_MINDFLOW_AGENT,
			};
		}
		if (lastProgress?.decision === 'FINAL_ANSWER') {
			const factsList = this.context.getFactsList();
			const verifiedPaths = this.context.getVerifiedPaths();
			const hasEnoughEvidence =
				factsList.length >= MIN_FACTS_TO_ALLOW_STOP &&
				verifiedPaths.size >= MIN_VERIFIED_PATHS_TO_ALLOW_STOP;
			const completeness = lastProgress?.estimatedCompleteness ?? 0;
			const logicClosureOverride = completeness >= LOGIC_CLOSURE_COMPLETENESS_THRESHOLD;
			const pathRoots = new Set<string>();
			for (const p of verifiedPaths) {
				const root = p.split(/[/\\]/)[0]?.trim();
				if (root) pathRoots.add(root);
			}
			const diversityOverride =
				pathRoots.size >= MIN_ROOT_DIVERSITY_FOR_STOP && factsList.length >= MIN_FACTS_TO_ALLOW_STOP;
			if (!hasEnoughEvidence && !logicClosureOverride && !diversityOverride) {
				yield {
					type: 'pk-debug',
					debugName: 'mindflow-final-answer-blocked',
					triggerName: StreamTriggerName.SEARCH_MINDFLOW_AGENT,
					extra: {
						reason: 'FINAL_ANSWER without enough evidence. Continue with recon.',
						progress: lastProgress,
						factsCount: factsList.length,
						verifiedPathsCount: verifiedPaths.size,
					},
				};
				setShouldBreak(false);
				return;
			}
			yield {
				type: 'pk-debug',
				debugName: 'mindflow-final-answer',
				triggerName: StreamTriggerName.SEARCH_MINDFLOW_AGENT,
				extra: { reason: 'Planner decided FINAL_ANSWER', progress: lastProgress },
			};
			setShouldBreak(true);
			return;
		}
		setShouldBreak(false);
	}
}
