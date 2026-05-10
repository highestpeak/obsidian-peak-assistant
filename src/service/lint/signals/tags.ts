import { createHash } from 'crypto';
import { AppContext } from '@/app/context/AppContext';
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
		const app = AppContext.getInstance().app;
		const files = app.vault.getMarkdownFiles();
		const findings: LintFinding[] = [];

		for (const file of files) {
			if (context.dismissals.has(`G-UNTAGGED:${file.path}`)) continue;

			const cache = app.metadataCache.getFileCache(file);
			const inlineTags = cache?.tags ?? [];
			const fmTags: string[] = (cache?.frontmatter?.tags as string[] | undefined) ?? [];

			if (inlineTags.length === 0 && fmTags.length === 0) {
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
