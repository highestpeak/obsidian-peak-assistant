/**
 * Conversational (HITL) search agent.
 *
 * Three-phase architecture replacing the rigid 10-step pipeline:
 *   Orient (1 LLM) → Explore (N × tools + HITL) → Synthesize (1-2 LLM)
 *
 * Design principles:
 * - No heuristic rules; all logic is agent-driven
 * - Human-in-the-loop: user can steer exploration at each round
 * - Custom orchestration: no ai-sdk Agent class, manual loop control
 */

import { StreamTriggerName, UIStepType, type LLMStreamEvent, type LLMUsage } from '@/core/providers/types';
import { accumulateTokenUsage } from '@/core/providers/helpers/stream-helper';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import type { AIServiceManager } from '@/service/chat/service-manager';
import type { SearchAgentResult } from '../AISearchAgent';
import { runOrientPhase } from './orient';
import { runExploreRound } from './explore';
import { runSynthesizePhase } from './synthesize';
import type {
	ConversationalSearchState,
	ConversationalSearchOptions,
	ConversationalSearchEvent,
	ExploreState,
	ExploreSnapshot,
	UserFeedback,
} from './types';

const DEFAULT_MAX_EXPLORE_ROUNDS = 5;

export class ConversationalSearchAgent {
	private state: ConversationalSearchState;
	private readonly options: ConversationalSearchOptions;

	constructor(
		private readonly aiServiceManager: AIServiceManager,
		options?: ConversationalSearchOptions,
	) {
		this.options = options ?? {};
		this.state = this.buildInitialState('');
	}

	private buildInitialState(userQuery: string): ConversationalSearchState {
		return {
			userQuery,
			phase: 'orient',
			orient: undefined,
			explore: {
				verifiedPaths: new Set(),
				findings: [],
				roundCount: 0,
			},
			result: undefined,
			tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
		};
	}

	/**
	 * Start a new search session. Returns an async generator that yields events.
	 * The generator pauses at HITL points (hitl-pause events).
	 * Call {@link continueWithFeedback} to resume after an HITL pause.
	 */
	async *startSession(userQuery: string): AsyncGenerator<ConversationalSearchEvent> {
		this.state = this.buildInitialState(userQuery);
		const stepId = generateUuidWithoutHyphens();

		// --- Phase 1: Orient ---
		if (!this.options.skipOrient) {
			this.state.phase = 'orient';
			yield {
				type: 'ui-step',
				uiType: UIStepType.STEPS_DISPLAY,
				stepId,
				title: 'Orienting…',
				description: 'Quick intuition-driven positioning',
				triggerName: StreamTriggerName.SEARCH_AI_AGENT,
			};

			const orientResult = yield* runOrientPhase({
				userQuery,
				aiServiceManager: this.aiServiceManager,
				stepId,
			});
			this.state.orient = orientResult;

			// Add initial leads to verified paths
			for (const lead of orientResult.initialLeads) {
				this.state.explore.verifiedPaths.add(lead.path);
			}
		}

		// --- Phase 2: First Explore round ---
		this.state.phase = 'explore';
		yield* this.runExploreAndPause(stepId);
	}

	/**
	 * Continue the session with user feedback after an HITL pause.
	 * The agent will run another explore round or move to synthesize.
	 */
	async *continueWithFeedback(feedback: UserFeedback): AsyncGenerator<ConversationalSearchEvent> {
		const stepId = generateUuidWithoutHyphens();

		if (feedback.type === 'enough') {
			yield* this.runSynthesize(stepId);
			return;
		}

		// Run another explore round with user feedback
		yield* this.runExploreAndPause(stepId, feedback);
	}

	/**
	 * Force immediate synthesis with current evidence (skip remaining exploration).
	 */
	async *forceSynthesize(): AsyncGenerator<ConversationalSearchEvent> {
		const stepId = generateUuidWithoutHyphens();
		yield* this.runSynthesize(stepId);
	}

	/** Current session state snapshot (for UI display). */
	getState(): Readonly<ConversationalSearchState> {
		return this.state;
	}

	/** Get the final result (only available after synthesize phase). */
	getResult(): SearchAgentResult | undefined {
		return this.state.result;
	}

	// ---------------------------------------------------------------------------
	// Internal
	// ---------------------------------------------------------------------------

	private async *runExploreAndPause(
		stepId: string,
		feedback?: UserFeedback,
	): AsyncGenerator<ConversationalSearchEvent> {
		const maxRounds = this.options.maxExploreRounds ?? DEFAULT_MAX_EXPLORE_ROUNDS;

		if (this.state.explore.roundCount >= maxRounds) {
			yield {
				type: 'pk-debug',
				debugName: 'Explore: max rounds reached, auto-synthesizing',
				extra: { roundCount: this.state.explore.roundCount, maxRounds },
			};
			yield* this.runSynthesize(stepId);
			return;
		}

		yield {
			type: 'ui-step',
			uiType: UIStepType.STEPS_DISPLAY,
			stepId,
			title: `Exploring (round ${this.state.explore.roundCount + 1})…`,
			description: feedback?.message ?? 'Searching the vault',
			triggerName: StreamTriggerName.SEARCH_AI_AGENT,
		};

		const { state: newExploreState, snapshot, shouldAutoStop } = yield* runExploreRound({
			userQuery: this.state.userQuery,
			orient: this.state.orient,
			currentState: this.state.explore,
			aiServiceManager: this.aiServiceManager,
			stepId,
			userFeedback: feedback,
			maxRounds,
		});

		this.state.explore = newExploreState;

		if (shouldAutoStop) {
			yield {
				type: 'pk-debug',
				debugName: 'Explore: agent recommends stopping',
				extra: { confidence: snapshot.confidence, totalPaths: snapshot.totalPaths },
			};
			yield* this.runSynthesize(stepId);
			return;
		}

		// Yield HITL pause point for user feedback
		yield {
			type: 'hitl-pause',
			snapshot,
			triggerName: StreamTriggerName.SEARCH_AI_AGENT,
		} as ConversationalSearchEvent;
	}

	private async *runSynthesize(stepId: string): AsyncGenerator<ConversationalSearchEvent> {
		this.state.phase = 'synthesize';

		yield {
			type: 'ui-step',
			uiType: UIStepType.STEPS_DISPLAY,
			stepId,
			title: 'Synthesizing report…',
			description: `${this.state.explore.verifiedPaths.size} sources`,
			triggerName: StreamTriggerName.SEARCH_AI_AGENT,
		};

		const result = yield* runSynthesizePhase({
			userQuery: this.state.userQuery,
			orient: this.state.orient,
			exploreState: this.state.explore,
			aiServiceManager: this.aiServiceManager,
			stepId,
		});

		this.state.result = result;
		this.state.phase = 'complete';

		yield {
			type: 'complete',
			finishReason: 'stop',
			usage: this.state.tokenUsage,
			result,
			triggerName: StreamTriggerName.SEARCH_AI_AGENT,
		};
	}
}
