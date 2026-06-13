// T7: content detectors now read the vault exclusively through
// `context.detectorContext` (the `VaultLintDetectorContextPort`).
// They have zero awareness of Obsidian, `AppContext`, or sqlite. A
// fake context with `listMarkdownFiles` + `readMarkdownFile` is
// enough to exercise the full detector logic; see
// `test/vault-lint-detectors.test.ts`.

import { createHash } from 'crypto';
import type { LintSignalDetector, LintScanContext, LintFinding, VaultLintConfig } from '../types';

function findingId(signalId: string, filePath: string): string {
	return createHash('sha256').update(`${signalId}:${filePath}`).digest('hex').slice(0, 32);
}

/** Strip YAML frontmatter + headings + whitespace; returns remaining prose length. */
export function strippedLength(content: string): number {
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
		const dc = context.detectorContext;
		const files = dc.listMarkdownFiles();
		const findings: LintFinding[] = [];

		for (const file of files) {
			if (context.dismissals.has(`C-EMPTY:${file.path}`)) continue;

			const content = await dc.readMarkdownFile(file.path);
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
			const dc = context.detectorContext;
			const files = dc.listMarkdownFiles();
			const findings: LintFinding[] = [];

			for (const file of files) {
				if (context.dismissals.has(`C-STUB:${file.path}`)) continue;

				const content = await dc.readMarkdownFile(file.path);
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
