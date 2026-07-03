// T7: tag detectors now read tag classification through
// `context.detectorContext.getTags(path)` instead of resolving
// `app.metadataCache.getFileCache(file)` themselves. The adapter
// normalizes frontmatter `tags` (string | string[] | undefined) into a
// uniform `string[]`; detectors only see two arrays.

import { createHash } from 'crypto';
import type { LintSignalDetector, LintScanContext, LintFinding, VaultLintConfig } from '../types';

function findingId(signalId: string, filePath: string): string {
	return createHash('sha256').update(`${signalId}:${filePath}`).digest('hex').slice(0, 32);
}

export function buildTagDetectors(config: VaultLintConfig): LintSignalDetector[] {
	return [
		untaggedDetector,
		buildTagExplosionDetector(config.thresholds.tagExplosionMultiplier),
	];
}

/**
 * `G-TAG-EXPLOSION` — notes whose tag count is at least
 * `tagExplosionMultiplier`× the vault median.
 *
 * The median (rather than the mean) is used so a single outlier doesn't
 * skew the reference. Empty-tag files count as 0 but do not shift the
 * multiplier calculation — only tagged files contribute to the median.
 * When fewer than three tagged files exist, the detector is a no-op
 * because a "vault typical" isn't yet meaningful.
 */
function buildTagExplosionDetector(multiplier: number): LintSignalDetector {
	return {
		id: 'G-TAG-EXPLOSION',
		dimension: 'tags',
		severity: 'info',
		signalWeight: 0.15,
		requiresLlm: false,

		async detect(context: LintScanContext): Promise<LintFinding[]> {
			const dc = context.detectorContext;
			const files = dc.listMarkdownFiles();
			if (files.length === 0) return [];

			const tagCounts = new Map<string, number>();
			const positiveCounts: number[] = [];
			for (const file of files) {
				const info = dc.getTags(file.path);
				const total = info.inlineTags.length + info.frontmatterTags.length;
				tagCounts.set(file.path, total);
				if (total > 0) positiveCounts.push(total);
			}
			if (positiveCounts.length < 3) return [];

			positiveCounts.sort((a, b) => a - b);
			const mid = Math.floor(positiveCounts.length / 2);
			const median = positiveCounts.length % 2 === 1
				? positiveCounts[mid]!
				: (positiveCounts[mid - 1]! + positiveCounts[mid]!) / 2;
			if (median <= 0) return [];
			const threshold = median * multiplier;

			const findings: LintFinding[] = [];
			for (const file of files) {
				if (context.dismissals.has(`G-TAG-EXPLOSION:${file.path}`)) continue;
				const total = tagCounts.get(file.path) ?? 0;
				if (total < threshold) continue;
				findings.push({
					id: findingId('G-TAG-EXPLOSION', file.path),
					signalId: 'G-TAG-EXPLOSION',
					severity: 'info',
					filePath: file.path,
					title: `Tag explosion: ${file.basename}`,
					description: `Note has ${total} tags — ${(total / median).toFixed(1)}× the vault median (${median}). Consider pruning to the most descriptive ones.`,
					fixActions: ['suggest-tags', 'review-taxonomy'],
					metadata: { tagCount: total, vaultMedian: median, threshold },
					status: 'open',
				});
			}
			return findings;
		},
	};
}

export const untaggedDetector: LintSignalDetector = {
	id: 'G-UNTAGGED',
	dimension: 'tags',
	severity: 'info',
	signalWeight: 0.25,
	requiresLlm: false,

	async detect(context: LintScanContext): Promise<LintFinding[]> {
		const dc = context.detectorContext;
		const files = dc.listMarkdownFiles();
		const findings: LintFinding[] = [];

		for (const file of files) {
			if (context.dismissals.has(`G-UNTAGGED:${file.path}`)) continue;

			const { inlineTags, frontmatterTags } = dc.getTags(file.path);

			if (inlineTags.length === 0 && frontmatterTags.length === 0) {
				findings.push({
					id: findingId('G-UNTAGGED', file.path),
					signalId: 'G-UNTAGGED',
					severity: 'info',
					filePath: file.path,
					title: `Untagged: ${file.basename}`,
					description: 'This note has no tags — adding tags improves discoverability and clustering.',
					fixActions: ['suggest-tags'],
					metadata: {},
					status: 'open',
				});
			}
		}

		return findings;
	},
};
