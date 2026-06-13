/**
 * Vault-scope multi-round orchestrator.
 *
 * Sister to `CopilotReviewSession` (doc scope). Drives 1..N rounds of
 * `buildVaultMetaAgentStream`, compacting between rounds.
 *
 * Yields `VaultReviewSessionSnapshot` on every change so the React UI can
 * re-render progressively.
 */

import type { LLMStreamEvent } from '@/core/providers/types';
import { AppContext } from '@/app/context/AppContext';
import { CopilotOutputCollector, type ReviewSubmission } from '../CopilotOutputCollector';
import { buildVaultDigest, type VaultDigest } from './VaultDigestService';
import {
	buildVaultMetaAgentStream,
	type VaultReviewMode,
	type VaultPreviousRoundSummary,
} from './VaultMetaAgentStream';

export type VaultReviewSessionStatus =
	| 'idle'
	| 'preparing'
	| 'running'
	| 'awaiting-next-round'
	| 'completed'
	| 'cancelled'
	| 'error';

export interface VaultRoundRecord {
	roundIndex: number;
	startedAt: number;
	endedAt?: number;
	turnCount: number;
	events: LLMStreamEvent[];
	submission?: ReviewSubmission;
	maxTurns: number;
	maxTurnsReached?: boolean;
}

export interface VaultReviewSessionSnapshot {
	mode: VaultReviewMode;
	digest: VaultDigest | null;
	rounds: VaultRoundRecord[];
	collectorSnapshot: ReturnType<CopilotOutputCollector['getSnapshot']>;
	status: VaultReviewSessionStatus;
	error?: string;
	currentRoundIndex: number;
}

const UNCAPPED_MAX_TURNS = 999;
const ABSOLUTE_ROUND_SAFETY_CAP = 12; // vault rounds are heavier; cap tighter

function previousRoundSummary(
	round: VaultRoundRecord,
	collectorSnapshot: ReturnType<CopilotOutputCollector['getSnapshot']>,
): VaultPreviousRoundSummary | null {
	if (!round.submission) return null;
	const clusters = collectorSnapshot.clusterObservations.filter(c => c.roundIndex === round.roundIndex);
	const gaps = collectorSnapshot.gaps.filter(g => g.roundIndex === round.roundIndex);
	const actions = collectorSnapshot.actions.filter(a => a.roundIndex === round.roundIndex);
	const findings = collectorSnapshot.findings.filter(f => f.roundIndex === round.roundIndex);
	return {
		roundIndex: round.roundIndex,
		submission: round.submission,
		clusterLabels: clusters.map(c => c.clusterLabel),
		gapTitles: gaps.map(g => g.title),
		actionTitles: actions.map(a => a.title),
		findings: findings.map(f => f.text),
	};
}

async function loadUserProfileText(): Promise<string | undefined> {
	try {
		const profileService = AppContext.getInstance().manager.getProfileService();
		if (!profileService) return undefined;
		const text = await profileService.getProfileAsMarkdown();
		return text.trim() || undefined;
	} catch (err) {
		console.warn('[VaultReviewSession] failed to load user profile', err);
		return undefined;
	}
}

export interface RunVaultReviewOptions {
	mode: VaultReviewMode;
	signal: AbortSignal;
}

export async function* runVaultReview(
	options: RunVaultReviewOptions,
): AsyncGenerator<VaultReviewSessionSnapshot, VaultReviewSessionSnapshot, void> {
	const collector = new CopilotOutputCollector();
	const userProfileText = await loadUserProfileText();
	const maxTurnsPerRound = UNCAPPED_MAX_TURNS;
	const fastSingleRound = options.mode === 'fast';

	const session: {
		mode: VaultReviewMode;
		digest: VaultDigest | null;
		rounds: VaultRoundRecord[];
		status: VaultReviewSessionStatus;
		error?: string;
		currentRoundIndex: number;
	} = {
		mode: options.mode,
		digest: null,
		rounds: [],
		status: 'preparing',
		currentRoundIndex: 0,
	};

	function snap(): VaultReviewSessionSnapshot {
		return {
			mode: session.mode,
			digest: session.digest,
			rounds: session.rounds.map(r => ({ ...r, events: [...r.events] })),
			collectorSnapshot: collector.getSnapshot(),
			status: session.status,
			error: session.error,
			currentRoundIndex: session.currentRoundIndex,
		};
	}

	yield snap();

	// Build digest before any round so the UI can show pre-flight stats early.
	// T6R: the Vault Lint runtime is resolved here (app-side caller)
	// and passed explicitly so `VaultDigestService` does not need to
	// import the runtime registry itself.
	try {
		session.digest = await buildVaultDigest({
			vaultLintRuntime: AppContext.getVaultLintRuntime(),
		});
	} catch (err) {
		session.status = 'error';
		session.error = (err as Error).message ?? 'failed to build vault digest';
		const final = snap();
		yield final;
		return final;
	}
	if (!session.digest) {
		session.status = 'error';
		session.error = 'Vault index is not ready. Try again once indexing completes.';
		const final = snap();
		yield final;
		return final;
	}

	session.status = 'running';
	yield snap();

	try {
		for (let roundIndex = 0; roundIndex < ABSOLUTE_ROUND_SAFETY_CAP; roundIndex++) {
			if (options.signal.aborted) {
				session.status = 'cancelled';
				const final = snap();
				yield final;
				return final;
			}

			collector.roundIndex = roundIndex;
			const round: VaultRoundRecord = {
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

			const previousRounds: VaultPreviousRoundSummary[] = session.rounds
				.slice(0, roundIndex)
				.map(r => previousRoundSummary(r, collector.getSnapshot()))
				.filter((s): s is VaultPreviousRoundSummary => s !== null);

			const stream = buildVaultMetaAgentStream({
				mode: options.mode,
				digest: session.digest,
				userProfileText,
				previousRounds,
				collector,
				maxTurns: maxTurnsPerRound,
				signal: options.signal,
				onTurnIncrement: () => {
					round.turnCount += 1;
				},
			});

			for await (const event of stream) {
				if (options.signal.aborted) {
					session.status = 'cancelled';
					const final = snap();
					yield final;
					return final;
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

			if (fastSingleRound) break;
			if (!submission) break;
			if (!submission.continue) break;
			// Continue: prepare next round.
			session.status = 'awaiting-next-round';
			yield snap();
		}
	} catch (err) {
		session.status = 'error';
		session.error = (err as Error).message ?? 'unknown error';
		const final = snap();
		yield final;
		return final;
	}

	session.status = 'completed';
	const final = snap();
	yield final;
	return final;
}
