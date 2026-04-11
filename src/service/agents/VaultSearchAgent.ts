/**
 * VaultSearchAgent: HITL-first vault knowledge base search.
 *
 * Pipeline: classify → decompose → intuitionFeedback → recon → presentPlan (HITL) → report
 *
 * Design principles:
 * - Human-in-the-loop: user reviews evidence plan before report generation
 * - Custom PeakAgent orchestration: no ai-sdk Agent class
 * - Two modes only: doc (DocSimpleAgent) and vault (this agent)
 * - Provides structured evidence ({path, reason}) not just paths
 */

import { StreamTriggerName, UIStepType, emptyUsage, mergeTokenUsage, type LLMStreamEvent } from '@/core/providers/types';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import type { AIServiceManager } from '@/service/chat/service-manager';
import type { SearchAgentResult } from './shared-types';
import type { UserFeedback } from './core/types';
import { runClassifyPhase } from './vault/phases/classify';
import { runDecomposePhase } from './vault/phases/decompose';
import { runIntuitionFeedbackPhase } from './vault/phases/intuitionFeedback';
import { runQueryUnderstandingPhase } from './vault/phases/queryUnderstanding';
import { runProbePhase } from './vault/phases/probe';
import { runReconPhase } from './vault/phases/recon';
import { runPresentPlanPhase } from './vault/phases/presentPlan';
import { runReportPhase } from './vault/phases/report';
import type {
	VaultSearchState,
	VaultSearchOptions,
	VaultSearchEvent,
	VaultSearchPhase,
	ReconEvidence,
} from './vault/types';
import { classifyQueryComplexity, type QueryComplexity } from './vault/phases/routeQuery';

export class VaultSearchAgent {
	private state: VaultSearchState;
	private readonly options: VaultSearchOptions;

	constructor(
		private readonly aiServiceManager: AIServiceManager,
		options?: VaultSearchOptions,
	) {
		this.options = options ?? {};
		this.state = this.buildInitialState('');
	}

	/**
	 * Start a new vault search session.
	 * Yields VaultSearchEvents. Pauses at HITL points (hitl-pause events).
	 * Call continueWithFeedback() to resume.
	 */
	async *startSession(userQuery: string): AsyncGenerator<VaultSearchEvent> {
		this.state = this.buildInitialState(userQuery);
		const stepId = generateUuidWithoutHyphens();

		// --- Adaptive Routing ---
		const complexity = classifyQueryComplexity(userQuery);
		yield {
			type: 'pk-debug',
			debugName: 'VaultSearchAgent: query routed',
			extra: { query: userQuery, complexity },
		};
		// TODO: implement fast paths for 'simple' and 'medium' complexity
		// For now all routes go through the full pipeline

		yield this.makePhaseTransition('classify', 'classify', stepId);

		// --- Phase 0: Probe (parallel quick searches before classify) ---
		// Run targeted keyword searches to get real vault signals, so classify
		// can anchor intent_descriptions to actual files instead of hallucinating.
		const probe = await runProbePhase(userQuery);
		this.state.probe = probe;

		// --- Phase 1+2: Query Understanding (combined classify + decompose) ---
		yield this.makeUIStep(stepId, 'Understanding your question…', `${probe.hits.length > 0 ? probe.hits.length + ' signals · ' : ''}Identifying dimensions and planning search tasks`);

		let { classify, decompose, physicalTasks } = yield* runQueryUnderstandingPhase({
			userQuery,
			aiServiceManager: this.aiServiceManager,
			stepId,
			conversationHistory: this.state.conversationHistory,
			probeResult: probe,
		});

		// Fallback: if no tasks were produced, create one vault-wide task
		if (decompose.tasks.length === 0) {
			const fallbackTask = {
				id: generateUuidWithoutHyphens(),
				description: `Search vault for: ${userQuery.slice(0, 80)}`,
				targetAreas: [] as string[],
				toolHints: ['local_search_whole_vault', 'explore_folder'],
			};
			decompose = { tasks: [fallbackTask] };
			physicalTasks = [{ unified_intent: fallbackTask.description, covered_dimension_ids: [], search_priority: 0, scope_constraint: null }];
		}

		this.state.classify = classify;
		this.state.decompose = decompose;

		// Emit decompose phase transition — this creates the decompose step in the store
		yield this.makePhaseTransition('classify', 'decompose', stepId);

		// NOW emit the decompose complete signal (after the step exists)
		yield {
			type: 'ui-signal',
			channel: 'search-stage',
			kind: 'complete',
			entityId: stepId,
			payload: {
				stage: 'decompose',
				status: 'complete',
				taskCount: decompose.tasks.length,
				dimensionCount: classify.semantic_dimensions.length + (classify.topology_dimensions?.length ?? 0) + (classify.temporal_dimensions?.length ?? 0),
				tasks: decompose.tasks.map((t, i) => ({
					id: t.id,
					description: t.description,
					targetAreas: t.targetAreas,
					toolHints: t.toolHints,
					coveredDimensionIds: physicalTasks[i]?.covered_dimension_ids ?? [],
					searchPriority: physicalTasks[i]?.search_priority ?? i,
				})),
			},
			triggerName: StreamTriggerName.SEARCH_AI_AGENT,
		} as any;

		// --- Phase 2.5: Intuition Feedback (silent — no UI step) ---
		const intuitionFeedback = yield* runIntuitionFeedbackPhase({
			classify,
			stepId,
		});
		this.state.intuitionFeedback = intuitionFeedback;

		yield this.makePhaseTransition('decompose', 'recon', stepId);

		// --- Phase 3: Recon ---
		yield this.makeUIStep(stepId, `Exploring vault…`, `${decompose.tasks.length} tasks`);

		const recon = yield* runReconPhase({
			userQuery,
			classify,
			decompose,
			aiServiceManager: this.aiServiceManager,
			stepId,
		});
		// Merge new evidence with any accumulated evidence from previous rounds
		const prevAcc = this.state.accumulatedEvidence ?? [];
		if (prevAcc.length > 0) {
			const newPaths = new Set(recon.evidence.map((e) => e.path));
			const merged = [...prevAcc.filter((e) => !newPaths.has(e.path)), ...recon.evidence];
			this.state.recon = { evidence: merged };
		} else {
			this.state.recon = recon;
		}

		yield this.makePhaseTransition('recon', 'present-plan', stepId);

		// --- Phase 4: Present Plan (HITL) ---
		yield this.makeUIStep(stepId, 'Preparing research plan…', `${this.state.recon.evidence.length} sources found`);
		const planSnapshot = yield* runPresentPlanPhase({
			userQuery,
			classify,
			recon,
			aiServiceManager: this.aiServiceManager,
			stepId,
		});
		this.state.planSnapshot = planSnapshot;
	}

	/**
	 * Continue after an HITL pause with user feedback.
	 * - approve: proceed to report generation
	 * - redirect: re-run from classify with updated context
	 * - add_paths: add user-specified paths to evidence, then report
	 * - remove_paths: remove paths from evidence, then report
	 * - stop: abort
	 */
	async *continueWithFeedback(feedback: UserFeedback): AsyncGenerator<VaultSearchEvent> {
		const stepId = generateUuidWithoutHyphens();
		this.state.conversationHistory.push(feedback);

		if (feedback.type === 'stop') {
			yield { type: 'complete', finishReason: 'stop', usage: this.state.tokenUsage, triggerName: StreamTriggerName.SEARCH_AI_AGENT };
			return;
		}

		if (feedback.type === 'redirect') {
			// Save current round's evidence before re-running so round 2 doesn't discard round 1
			const currentEvidence = this.state.recon?.evidence ?? [];
			this.state.accumulatedEvidence = [
				...(this.state.accumulatedEvidence ?? []),
				...currentEvidence,
			];
			this.state.phase = 'classify';
			yield* this.startSession(this.state.userQuery);
			return;
		}

		if (feedback.type === 'add_paths' && feedback.paths?.length) {
			this.addEvidencePaths(feedback.paths, 'User-specified path');
		}

		if (feedback.type === 'remove_paths' && feedback.paths?.length) {
			this.removeEvidencePaths(feedback.paths);
		}

		// All other types (approve, adjust_outline, add_paths, remove_paths) → go to report
		yield* this.runReport(stepId, feedback.outline);
	}

	/**
	 * Force immediate report with current evidence.
	 */
	async *forceReport(): AsyncGenerator<VaultSearchEvent> {
		const stepId = generateUuidWithoutHyphens();
		yield* this.runReport(stepId);
	}

	getState(): Readonly<VaultSearchState> {
		return this.state;
	}

	getResult(): SearchAgentResult | undefined {
		return this.state.result;
	}

	// ---------------------------------------------------------------------------
	// Internal
	// ---------------------------------------------------------------------------

	private async *runReport(stepId: string, outlineOverride?: string): AsyncGenerator<VaultSearchEvent> {
		const { userQuery, classify, recon, planSnapshot } = this.state;
		if (!classify || !recon || !planSnapshot) {
			yield {
				type: 'pk-debug',
				debugName: 'VaultSearchAgent: cannot report — missing classify/recon/plan state',
				extra: { hasClassify: !!classify, hasRecon: !!recon, hasPlan: !!planSnapshot },
			};
			return;
		}

		yield this.makePhaseTransition('present-plan', 'report', stepId);
		yield this.makeUIStep(stepId, 'Generating report…', `Synthesizing ${recon.evidence.length} sources`);

		// Apply outline override if user adjusted it
		const effectivePlanSnapshot = outlineOverride
			? { ...planSnapshot, proposedOutline: outlineOverride }
			: planSnapshot;

		const result = yield* runReportPhase({
			userQuery,
			classify,
			recon,
			planSnapshot: effectivePlanSnapshot,
			aiServiceManager: this.aiServiceManager,
			stepId,
		});

		this.state.result = result;
		this.state.phase = 'complete';

		yield this.makePhaseTransition('report', 'complete', stepId);

		yield {
			type: 'complete',
			finishReason: 'stop',
			usage: this.state.tokenUsage,
			result,
			triggerName: StreamTriggerName.SEARCH_AI_AGENT,
		};
	}

	private addEvidencePaths(paths: string[], defaultReason: string): void {
		if (!this.state.recon) {
			this.state.recon = { evidence: [] };
		}
		const existing = new Set(this.state.recon.evidence.map((e) => e.path));
		for (const path of paths) {
			if (!existing.has(path)) {
				this.state.recon.evidence.push({ path, reason: defaultReason, taskId: 'user' });
			}
		}
	}

	private removeEvidencePaths(paths: string[]): void {
		if (!this.state.recon) return;
		const removeSet = new Set(paths);
		this.state.recon.evidence = this.state.recon.evidence.filter((e) => !removeSet.has(e.path));
	}

	private buildInitialState(userQuery: string): VaultSearchState {
		return {
			userQuery,
			phase: 'classify',
			tokenUsage: emptyUsage(),
			conversationHistory: [],
		};
	}

	private makeUIStep(stepId: string, title: string, description: string): LLMStreamEvent {
		return {
			type: 'ui-step',
			uiType: UIStepType.STEPS_DISPLAY,
			stepId,
			title,
			description,
			triggerName: StreamTriggerName.SEARCH_AI_AGENT,
		};
	}

	private makePhaseTransition(from: VaultSearchPhase, to: VaultSearchPhase, _stepId: string): VaultSearchEvent {
		this.state.phase = to;
		return {
			type: 'phase-transition',
			from,
			to,
			triggerName: StreamTriggerName.SEARCH_AI_AGENT,
		};
	}
}
