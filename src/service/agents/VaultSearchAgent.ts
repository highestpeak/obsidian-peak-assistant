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

		yield this.makePhaseTransition('classify', 'classify', stepId);

		// --- Phase 1: Classify ---
		yield this.makeUIStep(stepId, 'Classifying query…', 'Understanding your question and identifying relevant areas');

		const classify = yield* runClassifyPhase({
			userQuery,
			aiServiceManager: this.aiServiceManager,
			stepId,
			conversationHistory: this.state.conversationHistory,
		});
		this.state.classify = classify;

		yield this.makePhaseTransition('classify', 'decompose', stepId);

		// --- Phase 2: Decompose ---
		yield this.makeUIStep(stepId, 'Decomposing into tasks…', 'Breaking down your query into searchable dimensions');

		const decompose = yield* runDecomposePhase({
			userQuery,
			classify,
			aiServiceManager: this.aiServiceManager,
			stepId,
		});
		this.state.decompose = decompose;

		yield this.makePhaseTransition('decompose', 'intuition-feedback', stepId);

		// --- Phase 2.5: Intuition Feedback ---
		yield this.makeUIStep(stepId, 'Checking intuition map…', 'Identifying gaps in vault coverage');

		const intuitionFeedback = yield* runIntuitionFeedbackPhase({
			classify,
			stepId,
		});
		this.state.intuitionFeedback = intuitionFeedback;

		yield this.makePhaseTransition('intuition-feedback', 'recon', stepId);

		// --- Phase 3: Recon ---
		yield this.makeUIStep(stepId, `Exploring vault…`, `${decompose.tasks.length} tasks`);

		const recon = yield* runReconPhase({
			userQuery,
			classify,
			decompose,
			aiServiceManager: this.aiServiceManager,
			stepId,
		});
		this.state.recon = recon;

		yield this.makePhaseTransition('recon', 'present-plan', stepId);

		// --- Phase 4: Present Plan (HITL) ---
		yield this.makeUIStep(stepId, 'Preparing research plan…', `${recon.evidence.length} sources found`);
		yield* runPresentPlanPhase({
			userQuery,
			classify,
			recon,
			aiServiceManager: this.aiServiceManager,
			stepId,
		});
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
			// Re-run from classify with history context
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
