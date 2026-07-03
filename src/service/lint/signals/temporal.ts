// Temporal Vault Lint detectors.
//
// These signals surface aging: notes that were recently active but
// have gone silent (T-RECENT-DRIFT), bridge notes losing structural
// weight (T-DECAYING-BRIDGE), folders / clusters that fell out of
// rotation (T-ABANDONED-FOLDER, T-ABANDONED-CLUSTER — not yet wired).
//
// All detectors are rule-based; they consult `mtimeMs` on the
// `listDocDegrees` port surface and compare against configurable
// day thresholds. LLM inference is out of scope.

import { createHash } from 'crypto';
import type { LintSignalDetector, LintScanContext, LintFinding, VaultLintConfig } from '../types';

const TEMPORAL_FETCH_LIMIT = 5_000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function findingId(scanSeed: string, signalId: string, key: string): string {
	return createHash('sha256').update(`${scanSeed}:${signalId}:${key}`).digest('hex').slice(0, 32);
}

export function buildTemporalDetectors(config: VaultLintConfig): LintSignalDetector[] {
	return [
		buildRecentDriftDetector(
			config.thresholds.recentDriftActiveDays,
			config.thresholds.recentDriftStaleDays,
		),
		buildDecayingBridgeDetector(config.thresholds.decayingBridgeDays),
	];
}

/**
 * `T-RECENT-DRIFT` — notes last edited between `recentDriftActiveDays`
 * and `recentDriftStaleDays` days ago. They were recently in scope
 * but have since drifted away without being closed out. Default
 * window 30–180 days.
 */
function buildRecentDriftDetector(activeDays: number, staleDays: number): LintSignalDetector {
	return {
		id: 'T-RECENT-DRIFT',
		dimension: 'temporal',
		severity: 'info',
		signalWeight: 0.10,
		requiresLlm: false,

		async detect(context: LintScanContext): Promise<LintFinding[]> {
			if (!(activeDays > 0 && staleDays > activeDays)) return [];
			const dc = context.detectorContext;
			const rows = await dc.listDocDegrees(TEMPORAL_FETCH_LIMIT);
			const now = Date.now();
			const findings: LintFinding[] = [];
			for (const row of rows) {
				if (!row.filePath || row.mtimeMs === null) continue;
				const ageDays = (now - row.mtimeMs) / MS_PER_DAY;
				if (ageDays < activeDays || ageDays > staleDays) continue;
				const dismissalKey = `T-RECENT-DRIFT:${row.filePath}`;
				if (context.dismissals.has(dismissalKey)) continue;
				findings.push({
					id: findingId('scan', 'T-RECENT-DRIFT', row.filePath),
					signalId: 'T-RECENT-DRIFT',
					severity: 'info',
					filePath: row.filePath,
					title: `Recent drift: ${row.label || row.nodeId}`,
					description: `Last edited ${Math.floor(ageDays)} days ago (drift window ${activeDays}–${staleDays} days). Revisit or explicitly archive to close the loop.`,
					fixActions: ['review-update', 'snooze'],
					metadata: {
						nodeId: row.nodeId,
						ageDays: Math.floor(ageDays),
						activeDays,
						staleDays,
					},
					status: 'open',
				});
			}
			return findings;
		},
	};
}

/**
 * `T-DECAYING-BRIDGE` — bridge-ish notes (degree ≥ 4) that have not
 * been edited in `decayingBridgeDays` days (default 365). A stale
 * bridge means the neighbourhood it connects has moved on but the
 * bridge itself has become fossilized — users should revisit or
 * split.
 */
function buildDecayingBridgeDetector(decayDays: number): LintSignalDetector {
	return {
		id: 'T-DECAYING-BRIDGE',
		dimension: 'temporal',
		severity: 'info',
		signalWeight: 0.10,
		requiresLlm: false,

		async detect(context: LintScanContext): Promise<LintFinding[]> {
			if (decayDays <= 0) return [];
			const dc = context.detectorContext;
			const rows = await dc.listDocDegrees(TEMPORAL_FETCH_LIMIT);
			const now = Date.now();
			const findings: LintFinding[] = [];
			for (const row of rows) {
				if (!row.filePath || row.mtimeMs === null) continue;
				const degree = row.incoming + row.outgoing;
				// Focus on nodes with real bridging weight; below 4 links
				// isn't really a bridge (soft-orphan territory).
				if (degree < 4) continue;
				const ageDays = (now - row.mtimeMs) / MS_PER_DAY;
				if (ageDays < decayDays) continue;
				const dismissalKey = `T-DECAYING-BRIDGE:${row.filePath}`;
				if (context.dismissals.has(dismissalKey)) continue;
				findings.push({
					id: findingId('scan', 'T-DECAYING-BRIDGE', row.filePath),
					signalId: 'T-DECAYING-BRIDGE',
					severity: 'info',
					filePath: row.filePath,
					title: `Decaying bridge: ${row.label || row.nodeId}`,
					description: `Well-connected note (${degree} links) but last edited ${Math.floor(ageDays)} days ago (threshold ${decayDays}). Verify the connections still hold.`,
					fixActions: ['review-update', 'suggest-split'],
					metadata: {
						nodeId: row.nodeId,
						ageDays: Math.floor(ageDays),
						degree,
						thresholdDays: decayDays,
					},
					status: 'open',
				});
			}
			return findings;
		},
	};
}
