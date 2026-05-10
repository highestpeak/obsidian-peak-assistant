import { createHash } from 'crypto';
import { AppContext } from '@/app/context/AppContext';
import type { LintSignalDetector, LintScanContext, LintFinding, VaultLintConfig } from '../types';

function findingId(signalId: string, filePath: string): string {
	return createHash('sha256').update(`${signalId}:${filePath}`).digest('hex').slice(0, 32);
}

/** Strip YAML frontmatter + headings + whitespace; returns remaining prose length. */
function strippedLength(content: string): number {
	return content
		.replace(/^---[\s\S]*?---\n?/, '')   // strip frontmatter
		.replace(/^#{1,6}\s+.*/gm, '')        // strip headings
		.trim()
		.length;
}

export function buildContentDetectors(config: VaultLintConfig): LintSignalDetector[] {
	return [emptyDetector, buildStubDetector(config.thresholds.stubMaxChars)];
}

export const emptyDetector: LintSignalDetector = {
	id: 'C-EMPTY',
	dimension: 'content',
	severity: 'warning',
	signalWeight: 0.30,
	requiresLlm: false,

	async detect(context: LintScanContext): Promise<LintFinding[]> {
		const app = AppContext.getInstance().app;
		const files = app.vault.getMarkdownFiles();
		const findings: LintFinding[] = [];

		for (const file of files) {
			if (context.dismissals.has(`C-EMPTY:${file.path}`)) continue;

			const content = await app.vault.cachedRead(file);
			if (strippedLength(content) === 0) {
				findings.push({
					id: findingId('C-EMPTY', file.path),
					signalId: 'C-EMPTY',
					severity: 'warning',
					filePath: file.path,
					title: `Empty note: ${file.basename}`,
					description: 'This note has no prose content after removing frontmatter and headings.',
					fixActions: ['delete-note', 'draft-content'],
					metadata: {},
					status: 'open',
				});
			}
		}

		return findings;
	},
};

function buildStubDetector(stubMaxChars: number): LintSignalDetector {
	return {
		id: 'C-STUB',
		dimension: 'content',
		severity: 'info',
		signalWeight: 0.10,
		requiresLlm: false,

		async detect(context: LintScanContext): Promise<LintFinding[]> {
			const app = AppContext.getInstance().app;
			const files = app.vault.getMarkdownFiles();
			const findings: LintFinding[] = [];

			for (const file of files) {
				if (context.dismissals.has(`C-STUB:${file.path}`)) continue;

				const content = await app.vault.cachedRead(file);
				const len = strippedLength(content);
				if (len > 0 && len < stubMaxChars) {
					findings.push({
						id: findingId('C-STUB', file.path),
						signalId: 'C-STUB',
						severity: 'info',
						filePath: file.path,
						title: `Stub note: ${file.basename}`,
						description: `Only ${len} characters of prose content — consider expanding this note.`,
						fixActions: ['draft-content'],
						metadata: { charCount: len },
						status: 'open',
					});
				}
			}

			return findings;
		},
	};
}
