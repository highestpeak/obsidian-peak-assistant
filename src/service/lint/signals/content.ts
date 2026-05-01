import { AppContext } from '@/app/context/AppContext';
import type { LintSignalDetector, LintScanContext, LintFinding } from '../types';

const FRONTMATTER_RE = /^---[\s\S]*?---\n?/;
const HEADINGS_RE = /^#+\s+.*$/gm;

/**
 * C-EMPTY: notes with no content after stripping frontmatter.
 */
export const EmptyDetector: LintSignalDetector = {
	id: 'C-EMPTY',
	dimension: 'content',
	severity: 'warning',
	signalWeight: 0.30,
	label: 'Empty Notes',
	description: 'Notes with no content beyond frontmatter',
	requiresLlm: false,

	async detect(_context: LintScanContext): Promise<LintFinding[]> {
		const app = AppContext.getApp();
		const files = app.vault.getMarkdownFiles();
		const findings: LintFinding[] = [];

		for (const file of files) {
			const raw = await app.vault.cachedRead(file);
			const body = raw.replace(FRONTMATTER_RE, '');
			if (body.trim().length === 0) {
				findings.push({
					id: `C-EMPTY:${file.path}`,
					signalId: 'C-EMPTY',
					severity: 'warning',
					filePath: file.path,
					title: `Empty: ${file.basename}`,
					description: 'Note has no content beyond frontmatter',
					fixActions: ['delete-note', 'draft-content'],
					metadata: {},
					status: 'open',
				});
			}
		}

		return findings;
	},
};

/**
 * C-STUB: notes with very little body text (below stubMaxChars threshold).
 */
export const StubDetector: LintSignalDetector = {
	id: 'C-STUB',
	dimension: 'content',
	severity: 'info',
	signalWeight: 0.10,
	label: 'Stub Notes',
	description: 'Notes with minimal content',
	requiresLlm: false,

	async detect(context: LintScanContext): Promise<LintFinding[]> {
		const app = AppContext.getApp();
		const files = app.vault.getMarkdownFiles();
		const stubMaxChars = context.config.thresholds.stubMaxChars ?? 100;
		const findings: LintFinding[] = [];

		for (const file of files) {
			const raw = await app.vault.cachedRead(file);
			const noFrontmatter = raw.replace(FRONTMATTER_RE, '');

			// Skip truly empty notes — those are caught by C-EMPTY
			if (noFrontmatter.trim().length === 0) continue;

			const body = noFrontmatter.replace(HEADINGS_RE, '').trim();
			const len = body.length;
			if (len > 0 && len < stubMaxChars) {
				findings.push({
					id: `C-STUB:${file.path}`,
					signalId: 'C-STUB',
					severity: 'info',
					filePath: file.path,
					title: `Stub: ${file.basename} (${len} chars)`,
					description: `Note body is only ${len} characters (threshold: ${stubMaxChars})`,
					fixActions: [],
					metadata: { bodyLength: len, threshold: stubMaxChars },
					status: 'open',
				});
			}
		}

		return findings;
	},
};
