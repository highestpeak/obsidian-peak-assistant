import { AppContext } from '@/app/context/AppContext';
import type { LintSignalDetector, LintScanContext, LintFinding } from '../types';

/**
 * G-UNTAGGED: notes with no tags (neither frontmatter tags nor inline hashtags).
 */
export const UntaggedDetector: LintSignalDetector = {
	id: 'G-UNTAGGED',
	dimension: 'tags',
	severity: 'info',
	signalWeight: 0.25,
	label: 'Untagged Notes',
	description: 'Notes with no frontmatter or inline tags',
	requiresLlm: false,

	async detect(_context: LintScanContext): Promise<LintFinding[]> {
		const app = AppContext.getApp();
		const files = app.vault.getMarkdownFiles();
		const findings: LintFinding[] = [];

		for (const file of files) {
			const cache = app.metadataCache.getFileCache(file);
			const hasFrontmatterTags = cache?.frontmatter?.tags != null
				&& (Array.isArray(cache.frontmatter.tags) ? cache.frontmatter.tags.length > 0 : true);
			const hasInlineTags = cache?.tags != null && cache.tags.length > 0;

			if (!hasFrontmatterTags && !hasInlineTags) {
				findings.push({
					id: `G-UNTAGGED:${file.path}`,
					signalId: 'G-UNTAGGED',
					severity: 'info',
					filePath: file.path,
					title: `Untagged: ${file.basename}`,
					description: 'Note has no frontmatter or inline tags',
					fixActions: ['suggest-tags'],
					metadata: {},
					status: 'open',
				});
			}
		}

		return findings;
	},
};
