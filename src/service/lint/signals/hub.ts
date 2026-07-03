// C-HUB1 · T-STALE-HUB — hub-doc nodes whose `hub_stale_since` timestamp
// has been sitting for at least `staleHubDays` days.
//
// The cascade worker already sets `hub_stale_since` on `mobius_node`
// rows when member docs change (see CascadeWorker.processDebtItem case
// 'hub_invalidate'). This detector observes those timestamps through
// `VaultLintDetectorContextPort.getStaleHubs` and surfaces hubs that
// have exceeded the configured age.
//
// Threshold: `VaultLintConfig.thresholds.staleHubDays` (default 180).
// A stale hub older than the threshold is a housekeeping smell — the
// summary no longer reflects its constituents; either regenerate the
// hub or accept that it is retired.

import { createHash } from 'crypto';
import type { LintSignalDetector, LintScanContext, LintFinding, VaultLintConfig } from '../types';

const STALE_HUB_FETCH_LIMIT = 100;

function findingId(signalId: string, key: string): string {
	return createHash('sha256').update(`${signalId}:${key}`).digest('hex').slice(0, 32);
}

export function buildHubDetectors(config: VaultLintConfig): LintSignalDetector[] {
	return [buildStaleHubDetector(config.thresholds.staleHubDays)];
}

function buildStaleHubDetector(staleHubDays: number): LintSignalDetector {
	const thresholdMs = staleHubDays * 24 * 60 * 60 * 1000;
	return {
		id: 'T-STALE-HUB',
		dimension: 'temporal',
		severity: 'warning',
		signalWeight: 0.25,
		requiresLlm: false,

		async detect(context: LintScanContext): Promise<LintFinding[]> {
			const dc = context.detectorContext;
			const now = Date.now();
			const stales = await dc.getStaleHubs(STALE_HUB_FETCH_LIMIT);
			if (stales.length === 0) return [];

			// Resolve hub node ids → labels + attribute paths in one batch.
			const nodeMap = await dc.getNodesByIds(stales.map((s) => s.nodeId));

			const findings: LintFinding[] = [];
			for (const stale of stales) {
				const ageMs = now - stale.hubStaleSince;
				if (ageMs < thresholdMs) continue;

				const node = nodeMap.get(stale.nodeId);
				const label = node?.label ?? stale.nodeId;
				let filePath: string | null = null;
				if (node?.attributes) {
					try {
						const attrs = JSON.parse(node.attributes) as { path?: string };
						filePath = attrs.path ?? null;
					} catch {
						filePath = null;
					}
				}

				const dismissalKey = `T-STALE-HUB:${filePath ?? stale.nodeId}`;
				if (context.dismissals.has(dismissalKey)) continue;

				const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
				findings.push({
					id: findingId('T-STALE-HUB', filePath ?? stale.nodeId),
					signalId: 'T-STALE-HUB',
					severity: 'warning',
					filePath,
					title: `Stale hub: ${label}`,
					description: `Hub doc last regenerated ${ageDays} days ago (threshold ${staleHubDays} days). Regenerate to reflect current members.`,
					fixActions: ['review-update', 'mark-current'],
					metadata: {
						nodeId: stale.nodeId,
						hubStaleSince: stale.hubStaleSince,
						ageDays,
						thresholdDays: staleHubDays,
						pagerank: stale.pagerank ?? null,
					},
					status: 'open',
				});
			}
			return findings;
		},
	};
}
