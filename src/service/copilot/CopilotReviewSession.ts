/**
 * Multi-round orchestrator for Auto Review.
 *
 * Sequences 1..N rounds of `buildCopilotMetaAgentStream`, compacting the
 * transcript between rounds (by only carrying summaries + propose_* output +
 * note_findings into the next system prompt).
 *
 * Yields ReviewSessionSnapshot on every change so the React UI can re-render
 * progressively. The agent itself terminates a round via submit_review; if
 * `continue=true` and round budget remains, a new round is launched with a
 * fresh SDK query.
 */

import type { LLMStreamEvent } from '@/core/providers/types';
import { AppContext } from '@/app/context/AppContext';
import type { DocumentContext } from './CopilotActionRegistry';
import { buildSignalReport, type DocumentSignalReport } from './CopilotSignalReport';
import { CopilotOutputCollector, type ReviewSubmission } from './CopilotOutputCollector';
import {
	buildCopilotMetaAgentStream,
	type ReviewMode,
	type PreviousRoundSummary,
} from './CopilotMetaAgentStream';

/**
 * Load the user profile markdown if the profile service is available.
 * Errors fall back to empty — profile is best-effort context, not required.
 */
async function loadUserProfileText(): Promise<string | undefined> {
	try {
		const profileService = AppContext.getInstance().manager.getProfileService();
		if (!profileService) return undefined;
		const text = await profileService.getProfileAsMarkdown();
		return text.trim() || undefined;
	} catch (err) {
		console.warn('[CopilotReviewSession] failed to load user profile', err);
		return undefined;
	}
}

export type ReviewSessionStatus =
	| 'idle'
	| 'running'
	| 'awaiting-next-round'
	| 'completed'
	| 'cancelled'
	| 'error';

export interface RoundRecord {
	roundIndex: number;
	startedAt: number;
	endedAt?: number;
	turnCount: number;
	events: LLMStreamEvent[];
	submission?: ReviewSubmission;
	maxTurns: number;
	maxTurnsReached?: boolean;
}

export interface ReviewSessionSnapshot {
	mode: ReviewMode;
	signalReport: DocumentSignalReport;
	rounds: RoundRecord[];
	collectorSnapshot: ReturnType<CopilotOutputCollector['getSnapshot']>;
	status: ReviewSessionStatus;
	error?: string;
	currentRoundIndex: number;
}

/**
 * No per-round turn cap. Agent decides when it's done; user can hit Cancel.
 * SDK still requires *some* number, so pass a huge one.
 */
const UNCAPPED_MAX_TURNS = 999;
/**
 * Hard safety cap so a buggy agent can't infinite-loop on round restarts.
 * Never surfaced to the user — if hit, the session just quietly completes.
 */
const ABSOLUTE_ROUND_SAFETY_CAP = 20;

function previousRoundSummary(
	round: RoundRecord,
	collectorSnapshot: ReturnType<CopilotOutputCollector['getSnapshot']>,
): PreviousRoundSummary | null {
	if (!round.submission) return null;
	const insights = collectorSnapshot.insights.filter(i => i.roundIndex === round.roundIndex);
	const changes = collectorSnapshot.changes.filter(c => c.roundIndex === round.roundIndex);
	const sources = collectorSnapshot.sources.filter(s => s.roundIndex === round.roundIndex);
	const findings = collectorSnapshot.findings.filter(f => f.roundIndex === round.roundIndex);
	return {
		roundIndex: round.roundIndex,
		submission: round.submission,
		insightTitles: insights.map(i => i.title),
		changeTitles: changes.map(c => c.title),
		sourcePaths: sources.map(s => s.path),
		findings: findings.map(f => f.text),
	};
}

export interface RunReviewOptions {
	ctx: DocumentContext;
	mode: ReviewMode;
	signal: AbortSignal;
}

/**
 * Drive a full review session from start to finish. Yields the latest snapshot
 * each time something changes (new event, new submission, round transition).
 * Consumers should accept each snapshot and re-render.
 */
export async function* runCopilotReview(
	options: RunReviewOptions,
): AsyncGenerator<ReviewSessionSnapshot, ReviewSessionSnapshot, void> {
	const signalReport = buildSignalReport(options.ctx);
	const collector = new CopilotOutputCollector();
	const userProfileText = await loadUserProfileText();
	const maxTurnsPerRound = UNCAPPED_MAX_TURNS;
	// Fast mode caps at 1 round by design; Complete is open-ended (agent decides).
	const fastSingleRound = options.mode === 'fast';

	const session: {
		mode: ReviewMode;
		signalReport: DocumentSignalReport;
		rounds: RoundRecord[];
		status: ReviewSessionStatus;
		error?: string;
		currentRoundIndex: number;
	} = {
		mode: options.mode,
		signalReport,
		rounds: [],
		status: 'running',
		currentRoundIndex: 0,
	};

	function snap(): ReviewSessionSnapshot {
		return {
			mode: session.mode,
			signalReport: session.signalReport,
			rounds: session.rounds.map(r => ({ ...r, events: [...r.events] })),
			collectorSnapshot: collector.getSnapshot(),
			status: session.status,
			error: session.error,
			currentRoundIndex: session.currentRoundIndex,
		};
	}

	yield snap();

	try {
		for (let roundIndex = 0; roundIndex < ABSOLUTE_ROUND_SAFETY_CAP; roundIndex++) {
			if (options.signal.aborted) {
				session.status = 'cancelled';
				yield snap();
				return snap();
			}

			collector.roundIndex = roundIndex;
			const round: RoundRecord = {
				roundIndex,
				startedAt: Date.now(),
				turnCount: 0,
				events: [],
				maxTurns: maxTurnsPerRound,
			};
			session.rounds.push(round);
			session.currentRoundIndex = roundIndex;
			session.status = 'running';
			yield snap();

			const previousRounds: PreviousRoundSummary[] = session.rounds
				.slice(0, roundIndex)
				.map(r => previousRoundSummary(r, collector.getSnapshot()))
				.filter((s): s is PreviousRoundSummary => s !== null);

			const sessionCtx = AppContext.getInstance();
			const stream = buildCopilotMetaAgentStream({
				mode: options.mode,
				signalReport,
				userProfileText,
				subjectContent: options.ctx.scope === 'selection' && options.ctx.selection
					? options.ctx.selection
					: options.ctx.content,
				subjectPath: options.ctx.file.path,
				previousRounds,
				collector,
				maxTurns: maxTurnsPerRound,
				signal: options.signal,
				app: sessionCtx.app,
				pluginId: sessionCtx.plugin.manifest.id,
				analysisHistory: sessionCtx.aiAnalysisHistoryService,
				onTurnIncrement: () => {
					round.turnCount += 1;
				},
			});

			for await (const event of stream) {
				if (options.signal.aborted) {
					session.status = 'cancelled';
					yield snap();
					return snap();
				}
				round.events.push(event);
				if (event.type === 'pk-debug' && (event as { debugName?: string }).debugName === 'max-turns-reached') {
					round.maxTurnsReached = true;
				}
				yield snap();
			}

			round.endedAt = Date.now();
			round.submission = collector.currentSubmission();
			yield snap();

			const submission = round.submission;

			// Fast mode: always single round, regardless of what agent set continue to.
			if (fastSingleRound) {
				session.status = 'completed';
				yield snap();
				return snap();
			}

			// Complete mode: agent decides via submit_review.continue.
			// Missing submission (e.g. maxTurns hit) or continue=false → end session.
			if (!submission || !submission.continue) {
				session.status = 'completed';
				yield snap();
				return snap();
			}

			session.status = 'awaiting-next-round';
			yield snap();
			// loop to next round
		}

		// Safety cap reached — quietly complete (this should be essentially unreachable).
		session.status = 'completed';
		yield snap();
		return snap();
	} catch (err) {
		session.status = 'error';
		session.error = err instanceof Error ? err.message : String(err);
		yield snap();
		return snap();
	}
}
