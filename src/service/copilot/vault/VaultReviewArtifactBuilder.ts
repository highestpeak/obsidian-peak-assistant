/**
 * Build trace artifacts from a VaultReviewSessionSnapshot.
 *
 * Vault scope reuses the doc-scope `buildRoundTrace` logic by duck-typing the
 * snapshot: rounds + collectorSnapshot have identical structure. We skip the
 * `observedNoteItem` (doc-specific) and emit a vault-flavoured pre-flight item.
 */

import type { TraceArtifact } from '@/service/copilot/CopilotRunArtifacts';
import type { VaultReviewSessionSnapshot } from './VaultReviewSession';
// The trace builder is private to CopilotReviewArtifactBuilder.ts; instead of
// re-exporting we duplicate a thin wrapper that re-uses the same heuristics.
// However the round-trace function references `snapshot.collectorSnapshot.{insights,changes,sources}`
// which exist on both shapes — so importing via a permissive any-cast is safe.
import { buildReviewArtifacts } from '@/service/copilot/CopilotReviewArtifactBuilder';
import type { ReviewSessionSnapshot } from '@/service/copilot/CopilotReviewSession';
import type { DocumentSignalReport } from '@/service/copilot/CopilotSignalReport';

/** Synthetic SignalReport so observedNoteItem doesn't crash. */
function vaultSignalReportShim(snapshot: VaultReviewSessionSnapshot): DocumentSignalReport {
	return {
		basename: 'Vault Review',
		scope: 'full',
		wordCount: snapshot.digest?.counts.words ?? 0,
		outgoingLinks: 0,
		backlinkCount: 0,
		tagCount: 0,
		tags: [],
		headingCount: 0,
		isOrphan: false,
		hasTaskList: false,
		openTaskCount: 0,
		completedTaskCount: 0,
		language: 'mixed',
		signals: [],
	};
}

export function buildVaultTrace(snapshot: VaultReviewSessionSnapshot): TraceArtifact[] {
	const shimSnapshot: ReviewSessionSnapshot = {
		mode: snapshot.mode === 'fast' ? 'fast' : 'complete',
		signalReport: vaultSignalReportShim(snapshot),
		rounds: snapshot.rounds.map(r => ({
			roundIndex: r.roundIndex,
			startedAt: r.startedAt,
			endedAt: r.endedAt,
			turnCount: r.turnCount,
			events: r.events,
			submission: r.submission,
			maxTurns: r.maxTurns,
			maxTurnsReached: r.maxTurnsReached,
		})),
		collectorSnapshot: snapshot.collectorSnapshot,
		status: snapshot.status === 'preparing' ? 'running' : snapshot.status,
		error: snapshot.error,
		currentRoundIndex: snapshot.currentRoundIndex,
	};
	const built = buildReviewArtifacts(shimSnapshot);
	// Drop the observedNoteItem (id 'pre-flight-observation') — it's doc-specific.
	return built.trace.filter(t => t.id !== 'pre-flight-observation');
}
