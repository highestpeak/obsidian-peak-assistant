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
		frontmatterMissingDetector,
		namingViolationDetector,
		buildDuplicateDetector(
			config.thresholds.duplicateMinSimilarity,
			config.thresholds.duplicateMinTitleJaccard,
		),
	];
}

/**
 * Token set for a Jaccard comparison. Lowercase, alphanumeric-only,
 * shorter than 2 characters is discarded so stopwords don't dominate
 * small titles.
 */
export function titleTokens(title: string): Set<string> {
	const tokens = title
		.toLowerCase()
		.split(/[^\p{L}\p{N}]+/u)
		.filter((tok) => tok.length >= 2);
	return new Set(tokens);
}

export function jaccard(a: Set<string>, b: Set<string>): number {
	if (a.size === 0 && b.size === 0) return 0;
	let intersection = 0;
	for (const tok of a) if (b.has(tok)) intersection += 1;
	const union = a.size + b.size - intersection;
	return union === 0 ? 0 : intersection / union;
}

/**
 * Naming rules for `C-NAMING-VIOLATION`. Kept intentionally narrow —
 * only high-confidence, opinion-neutral checks:
 *
 *   - Obsidian's default "Untitled" placeholder (with or without a
 *     trailing " N" counter) — always a housekeeping smell.
 *   - Empty basename (should not exist on a real vault, but a defence
 *     against corrupted metadata).
 *   - Trailing/leading whitespace in the basename — invisible and
 *     usually a paste artifact.
 *
 * More opinionated rules (kebab-case, no spaces, ...) are deliberately
 * omitted so this detector doesn't wage a style war with existing
 * vaults. Future config knobs can extend it.
 */
const UNTITLED_BASENAME_REGEX = /^Untitled(\s+\d+)?$/i;

export function detectNamingViolation(basename: string): { reason: string } | null {
	if (basename.length === 0) return { reason: 'empty basename' };
	if (basename !== basename.trim()) return { reason: 'basename has leading or trailing whitespace' };
	if (UNTITLED_BASENAME_REGEX.test(basename)) {
		return { reason: `default placeholder name '${basename}'` };
	}
	return null;
}

/**
 * Match the leading YAML frontmatter block: `---\n<body>\n---\n?`.
 * The body must NOT contain a `---` line to avoid greedy matches when
 * the note body itself uses `---` horizontal rules.
 */
const FRONTMATTER_REGEX = /^---\r?\n(?!---\r?\n)[\s\S]*?\r?\n---\r?\n?/;

export function hasFrontmatter(content: string): boolean {
	return FRONTMATTER_REGEX.test(content);
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

/**
 * `C-FRONTMATTER-MISSING` — notes that have no YAML frontmatter block.
 * Rule-based; fires per file, severity `info`. Empty files and stub
 * files still fire — the fix (`add-frontmatter`) is meaningful there
 * too. Users who want per-folder policies can dismiss individually.
 */
export const frontmatterMissingDetector: LintSignalDetector = {
	id: 'C-FRONTMATTER-MISSING',
	dimension: 'content',
	severity: 'info',
	signalWeight: 0.05,
	requiresLlm: false,

	async detect(context: LintScanContext): Promise<LintFinding[]> {
		const dc = context.detectorContext;
		const files = dc.listMarkdownFiles();
		const findings: LintFinding[] = [];

		for (const file of files) {
			if (context.dismissals.has(`C-FRONTMATTER-MISSING:${file.path}`)) continue;

			const content = await dc.readMarkdownFile(file.path);
			if (!hasFrontmatter(content)) {
				findings.push({
					id: findingId('C-FRONTMATTER-MISSING', file.path),
					signalId: 'C-FRONTMATTER-MISSING',
					severity: 'info',
					filePath: file.path,
					title: `No frontmatter: ${file.basename}`,
					description: 'This note does not have a YAML frontmatter block. Add one for consistent metadata (tags, aliases, date).',
					fixActions: ['add-frontmatter'],
					metadata: {},
					status: 'open',
				});
			}
		}

		return findings;
	},
};

export const namingViolationDetector: LintSignalDetector = {
	id: 'C-NAMING-VIOLATION',
	dimension: 'content',
	severity: 'info',
	signalWeight: 0.05,
	requiresLlm: false,

	async detect(context: LintScanContext): Promise<LintFinding[]> {
		const dc = context.detectorContext;
		const files = dc.listMarkdownFiles();
		const findings: LintFinding[] = [];

		for (const file of files) {
			if (context.dismissals.has(`C-NAMING-VIOLATION:${file.path}`)) continue;

			const verdict = detectNamingViolation(file.basename);
			if (verdict === null) continue;

			findings.push({
				id: findingId('C-NAMING-VIOLATION', file.path),
				signalId: 'C-NAMING-VIOLATION',
				severity: 'info',
				filePath: file.path,
				title: `Rename suggested: ${file.basename || '(empty)'}`,
				description: `Naming violation — ${verdict.reason}. Rename this note to something descriptive.`,
				fixActions: ['rename-with-prefix'],
				metadata: { reason: verdict.reason, basename: file.basename },
				status: 'open',
			});
		}

		return findings;
	},
};

/**
 * `C-DUPLICATE` — surface note pairs whose semantic similarity ≥
 * `duplicateMinSimilarity` (default 0.92) AND whose title Jaccard
 * similarity ≥ `duplicateMinTitleJaccard` (default 0.5). Uses the
 * detector-context port's `listDocDegrees` for the node inventory and
 * `getSemanticNeighbors` for pairwise checks.
 *
 * De-dup: pairs (A→B) and (B→A) collapse to a single canonical (min,
 * max) pair-key so users see one finding per duplicate group; the
 * finding is anchored on the lexicographically-smaller path.
 */
const DUPLICATE_FETCH_LIMIT = 5_000;
const DUPLICATE_NEIGHBOR_LIMIT = 5;

function buildDuplicateDetector(
	minSimilarity: number,
	minTitleJaccard: number,
): LintSignalDetector {
	return {
		id: 'C-DUPLICATE',
		dimension: 'content',
		severity: 'warning',
		signalWeight: 0.25,
		requiresLlm: false,

		async detect(context: LintScanContext): Promise<LintFinding[]> {
			const dc = context.detectorContext;
			const rows = await dc.listDocDegrees(DUPLICATE_FETCH_LIMIT);
			if (rows.length === 0) return [];

			const nodeInfo = new Map<string, { label: string; filePath: string | null }>();
			const tokenCache = new Map<string, Set<string>>();
			for (const row of rows) {
				nodeInfo.set(row.nodeId, { label: row.label, filePath: row.filePath });
				tokenCache.set(row.nodeId, titleTokens(row.label));
			}

			const seenPairs = new Set<string>();
			const findings: LintFinding[] = [];

			for (const row of rows) {
				let neighbors: Awaited<ReturnType<typeof dc.getSemanticNeighbors>>;
				try {
					neighbors = await dc.getSemanticNeighbors(row.nodeId, DUPLICATE_NEIGHBOR_LIMIT, new Set());
				} catch {
					continue;
				}
				const myTokens = tokenCache.get(row.nodeId)!;
				for (const n of neighbors) {
					if (n.id === row.nodeId) continue;
					const simPct = parseFloat(n.similarity);
					if (!Number.isFinite(simPct)) continue;
					const sim = simPct / 100;
					if (sim < minSimilarity) continue;
					const theirTokens = tokenCache.get(n.id) ?? titleTokens(n.label);
					const j = jaccard(myTokens, theirTokens);
					if (j < minTitleJaccard) continue;

					const otherInfo = nodeInfo.get(n.id) ?? { label: n.label, filePath: null };
					const [a, b] = [row.nodeId, n.id].sort();
					const pairKey = `${a}::${b}`;
					if (seenPairs.has(pairKey)) continue;
					seenPairs.add(pairKey);

					const anchor = row.nodeId === a
						? { nodeId: row.nodeId, label: row.label, filePath: row.filePath }
						: { nodeId: n.id, label: otherInfo.label, filePath: otherInfo.filePath };
					const partner = row.nodeId === a
						? { nodeId: n.id, label: otherInfo.label, filePath: otherInfo.filePath }
						: { nodeId: row.nodeId, label: row.label, filePath: row.filePath };

					const dismissalKey = `C-DUPLICATE:${anchor.filePath ?? anchor.nodeId}`;
					if (context.dismissals.has(dismissalKey)) continue;

					findings.push({
						id: findingId('C-DUPLICATE', pairKey),
						signalId: 'C-DUPLICATE',
						severity: 'warning',
						filePath: anchor.filePath,
						title: `Likely duplicate: ${anchor.label} ↔ ${partner.label}`,
						description: `Semantic similarity ${(sim * 100).toFixed(1)}% (≥ ${(minSimilarity * 100).toFixed(0)}%), title overlap ${(j * 100).toFixed(0)}% (≥ ${(minTitleJaccard * 100).toFixed(0)}%). Merge into a single note or link them explicitly.`,
						fixActions: ['merge-notes', 'link-as-alias'],
						metadata: {
							similarity: sim,
							titleJaccard: j,
							partner: {
								nodeId: partner.nodeId,
								filePath: partner.filePath,
								label: partner.label,
							},
						},
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
