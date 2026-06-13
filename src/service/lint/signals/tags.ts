// T7: tag detectors now read tag classification through
// `context.detectorContext.getTags(path)` instead of resolving
// `app.metadataCache.getFileCache(file)` themselves. The adapter
// normalizes frontmatter `tags` (string | string[] | undefined) into a
// uniform `string[]`; detectors only see two arrays.

import { createHash } from 'crypto';
import type { LintSignalDetector, LintScanContext, LintFinding } from '../types';

function findingId(signalId: string, filePath: string): string {
	return createHash('sha256').update(`${signalId}:${filePath}`).digest('hex').slice(0, 32);
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
