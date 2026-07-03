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
	return strippedProse(content).trim().length;
}

/** Word count over the stripped prose surface. Splits on ASCII/Unicode whitespace runs. */
export function strippedWordCount(content: string): number {
	const prose = strippedProse(content).trim();
	if (prose.length === 0) return 0;
	return prose.split(/\s+/).length;
}

function strippedProse(content: string): string {
	return content
		.replace(/^---[\s\S]*?---\n?/, '')   // strip frontmatter
		.replace(/^#{1,6}\s+.*/gm, '');       // strip headings
}

export function buildContentDetectors(config: VaultLintConfig): LintSignalDetector[] {
	return [
		emptyDetector,
		buildStubDetector(config.thresholds.stubMaxChars),
		buildOversizedDetector(config.thresholds.oversizedMinWords),
	];
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

/**
 * `C-OVERSIZED` — notes whose prose exceeds a configurable word count.
 * Rule-based; threshold from `VaultLintConfig.thresholds.oversizedMinWords`
 * (default 5000). Fix action: suggest splitting into multiple notes.
 */
function buildOversizedDetector(oversizedMinWords: number): LintSignalDetector {
	return {
		id: 'C-OVERSIZED',
		dimension: 'content',
		severity: 'info',
		signalWeight: 0.20,
		requiresLlm: false,

		async detect(context: LintScanContext): Promise<LintFinding[]> {
			const dc = context.detectorContext;
			const files = dc.listMarkdownFiles();
			const findings: LintFinding[] = [];

			for (const file of files) {
				if (context.dismissals.has(`C-OVERSIZED:${file.path}`)) continue;

				const content = await dc.readMarkdownFile(file.path);
				const words = strippedWordCount(content);
				if (words >= oversizedMinWords) {
					findings.push({
						id: findingId('C-OVERSIZED', file.path),
						signalId: 'C-OVERSIZED',
						severity: 'info',
						filePath: file.path,
						title: `Oversized note: ${file.basename}`,
						description: `Note has ${words} words of prose (threshold ${oversizedMinWords}). Consider splitting into focused sub-notes.`,
						fixActions: ['suggest-split'],
						metadata: { wordCount: words, threshold: oversizedMinWords },
						status: 'open',
					});
				}
			}

			return findings;
		},
	};
}

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
