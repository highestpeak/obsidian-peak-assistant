// T7 Vault Lint detector tests with a fake detector context.
//
// These tests prove the T7 closure: every Vault Lint detector reads
// the vault, metadata cache, graph nodes, and semantic neighbors
// through `LintScanContext.detectorContext`. A fake implementation of
// `VaultLintDetectorContextPort` is enough to exercise every detector
// end-to-end — no Obsidian boot, no sqlite, no graph inspector tool.
//
// If a future change reintroduces `AppContext.getInstance()` or
// `sqliteStoreManager` inside a detector, these tests stay green but
// the source-scan guard in `test/vault-lint-source-guard.test.ts`
// fails immediately.

import assert from 'assert';
import {
	emptyDetector,
	buildContentDetectors,
	detectNamingViolation,
	frontmatterMissingDetector,
	hasFrontmatter,
	namingViolationDetector,
	strippedLength,
	strippedWordCount,
} from '@/service/lint/signals/content';
import { untaggedDetector } from '@/service/lint/signals/tags';
import {
	orphanDetector,
	brokenLinkDetector,
	buildBrokenLinkFindings,
} from '@/service/lint/signals/structural';
import { DEFAULT_VAULT_LINT_CONFIG } from '@/service/lint/config/VaultLintDefaults';
import type {
	LintDismissal,
	LintScanContext,
} from '@/service/lint/types';
import type {
	VaultLintDetectorContextPort,
	VaultLintDetectorFileRef,
	VaultLintDetectorGraphNode,
	VaultLintDetectorSemanticNeighbor,
	VaultLintDetectorTagInfo,
} from '@/core/ports/VaultLintPorts';

// ---------------------------------------------------------------------------
// Fake detector context
// ---------------------------------------------------------------------------

interface FakeContextSpec {
	files?: VaultLintDetectorFileRef[];
	fileContent?: Record<string, string>;
	tags?: Record<string, VaultLintDetectorTagInfo>;
	unresolvedLinks?: Record<string, Record<string, number>>;
	hardOrphans?: string[];
	nodes?: Record<string, VaultLintDetectorGraphNode>;
	indexedNoteTypes?: ReadonlySet<string>;
	semanticNeighbors?: Record<string, VaultLintDetectorSemanticNeighbor[]>;
	semanticThrows?: boolean;
}

function makeFakeContext(spec: FakeContextSpec = {}): VaultLintDetectorContextPort {
	return {
		listMarkdownFiles: () => spec.files ?? [],
		async readMarkdownFile(path: string): Promise<string> {
			return spec.fileContent?.[path] ?? '';
		},
		getTags(path: string): VaultLintDetectorTagInfo {
			return spec.tags?.[path] ?? { inlineTags: [], frontmatterTags: [] };
		},
		getUnresolvedLinks: () => spec.unresolvedLinks ?? {},
		async getHardOrphans(_limit: number): Promise<string[]> {
			return spec.hardOrphans ?? [];
		},
		async getNodesByIds(ids: readonly string[]): Promise<Map<string, VaultLintDetectorGraphNode>> {
			const map = new Map<string, VaultLintDetectorGraphNode>();
			for (const id of ids) {
				const node = spec.nodes?.[id];
				if (node) map.set(id, node);
			}
			return map;
		},
		isIndexedNoteNodeType(type: string): boolean {
			return spec.indexedNoteTypes?.has(type) ?? false;
		},
		async getSemanticNeighbors(nodeId: string): Promise<VaultLintDetectorSemanticNeighbor[]> {
			if (spec.semanticThrows) throw new Error('embedding store unavailable');
			return spec.semanticNeighbors?.[nodeId] ?? [];
		},
	};
}

function makeScanContext(
	detectorContext: VaultLintDetectorContextPort,
	dismissalKeys: string[] = [],
): LintScanContext {
	const dismissalEntries: Array<[string, LintDismissal]> = dismissalKeys.map((key) => {
		const [signalId, ...rest] = key.split(':');
		return [
			key,
			{
				signalId: (signalId ?? '') as LintDismissal['signalId'],
				filePath: rest.join(':'),
				dismissedAt: 0,
			},
		];
	});
	return {
		totalNotes: 10,
		allNodeIds: [],
		lastScanTimestamp: null,
		dismissals: new Map(dismissalEntries),
		detectorContext,
	};
}

// ---------------------------------------------------------------------------
// Content detectors
// ---------------------------------------------------------------------------

async function testEmptyDetectorFindsNotesEmptyAfterStripping(): Promise<void> {
	// Three notes: one truly empty, one with only frontmatter+heading,
	// one with real prose. Detector should flag the first two.
	const dc = makeFakeContext({
		files: [
			{ path: 'a.md', basename: 'a' },
			{ path: 'b.md', basename: 'b' },
			{ path: 'c.md', basename: 'c' },
		],
		fileContent: {
			'a.md': '',
			'b.md': '---\ntitle: stub\n---\n# Heading\n',
			'c.md': '# Heading\n\nThis is real prose content here.',
		},
	});
	const findings = await emptyDetector.detect(makeScanContext(dc));
	assert.deepStrictEqual(
		findings.map((f) => f.filePath).sort(),
		['a.md', 'b.md'],
		'C-EMPTY should fire for files whose stripped content is length 0',
	);
	for (const f of findings) {
		assert.strictEqual(f.signalId, 'C-EMPTY');
		assert.strictEqual(f.severity, 'warning');
		assert.deepStrictEqual(f.fixActions, ['delete-note', 'draft-content']);
	}
	console.log('PASS: emptyDetectorFindsNotesEmptyAfterStripping');
}

async function testEmptyDetectorRespectsDismissals(): Promise<void> {
	const dc = makeFakeContext({
		files: [{ path: 'a.md', basename: 'a' }],
		fileContent: { 'a.md': '' },
	});
	const findings = await emptyDetector.detect(
		makeScanContext(dc, ['C-EMPTY:a.md']),
	);
	assert.strictEqual(findings.length, 0, 'dismissed empty note should be skipped');
	console.log('PASS: emptyDetectorRespectsDismissals');
}

async function testStubDetectorFiresUnderConfiguredThreshold(): Promise<void> {
	const detectors = buildContentDetectors(DEFAULT_VAULT_LINT_CONFIG);
	const stub = detectors.find((d) => d.id === 'C-STUB');
	assert.ok(stub, 'buildContentDetectors must include C-STUB');

	const stubBody = 'A'.repeat(50); // under default 100 char threshold
	const fullBody = 'B'.repeat(200);

	const dc = makeFakeContext({
		files: [
			{ path: 'stub.md', basename: 'stub' },
			{ path: 'full.md', basename: 'full' },
			{ path: 'empty.md', basename: 'empty' },
		],
		fileContent: {
			'stub.md': stubBody,
			'full.md': fullBody,
			'empty.md': '', // C-STUB requires len > 0 — must NOT fire here
		},
	});
	const findings = await stub.detect(makeScanContext(dc));
	assert.strictEqual(findings.length, 1, 'only the under-threshold note should fire');
	assert.strictEqual(findings[0]!.filePath, 'stub.md');
	assert.strictEqual(findings[0]!.metadata.charCount, 50);
	console.log('PASS: stubDetectorFiresUnderConfiguredThreshold');
}

async function testStubDetectorRespectsDismissals(): Promise<void> {
	const detectors = buildContentDetectors(DEFAULT_VAULT_LINT_CONFIG);
	const stub = detectors.find((d) => d.id === 'C-STUB')!;
	const dc = makeFakeContext({
		files: [{ path: 'stub.md', basename: 'stub' }],
		fileContent: { 'stub.md': 'short' },
	});
	const findings = await stub.detect(
		makeScanContext(dc, ['C-STUB:stub.md']),
	);
	assert.strictEqual(findings.length, 0);
	console.log('PASS: stubDetectorRespectsDismissals');
}

async function testOversizedDetectorFiresAtOrAboveThreshold(): Promise<void> {
	const detectors = buildContentDetectors({
		...DEFAULT_VAULT_LINT_CONFIG,
		thresholds: { ...DEFAULT_VAULT_LINT_CONFIG.thresholds, oversizedMinWords: 5 },
	});
	const oversized = detectors.find((d) => d.id === 'C-OVERSIZED');
	assert.ok(oversized, 'buildContentDetectors must include C-OVERSIZED');
	const dc = makeFakeContext({
		files: [
			{ path: 'ok.md', basename: 'ok' },
			{ path: 'over.md', basename: 'over' },
			{ path: 'exact.md', basename: 'exact' },
		],
		fileContent: {
			'ok.md': 'one two three',                       // 3 words → below
			'exact.md': 'alpha beta gamma delta epsilon',   // 5 words → fires (≥ threshold)
			'over.md': 'a b c d e f g h i j k',              // 11 words → fires
		},
	});
	const findings = await oversized!.detect(makeScanContext(dc));
	assert.strictEqual(findings.length, 2);
	assert.deepStrictEqual(
		findings.map((f) => f.filePath).sort(),
		['exact.md', 'over.md'],
	);
	const over = findings.find((f) => f.filePath === 'over.md')!;
	assert.strictEqual(over.signalId, 'C-OVERSIZED');
	assert.strictEqual(over.severity, 'info');
	assert.deepStrictEqual(over.fixActions, ['suggest-split']);
	assert.strictEqual((over.metadata as any).wordCount, 11);
	assert.strictEqual((over.metadata as any).threshold, 5);
	console.log('PASS: oversizedDetectorFiresAtOrAboveThreshold');
}

async function testOversizedDetectorRespectsDismissals(): Promise<void> {
	const detectors = buildContentDetectors({
		...DEFAULT_VAULT_LINT_CONFIG,
		thresholds: { ...DEFAULT_VAULT_LINT_CONFIG.thresholds, oversizedMinWords: 3 },
	});
	const oversized = detectors.find((d) => d.id === 'C-OVERSIZED')!;
	const dc = makeFakeContext({
		files: [{ path: 'big.md', basename: 'big' }],
		fileContent: { 'big.md': 'one two three four' },
	});
	const findings = await oversized.detect(
		makeScanContext(dc, ['C-OVERSIZED:big.md']),
	);
	assert.strictEqual(findings.length, 0);
	console.log('PASS: oversizedDetectorRespectsDismissals');
}

function testStrippedWordCountHelperIsExposed(): void {
	assert.strictEqual(strippedWordCount(''), 0);
	assert.strictEqual(strippedWordCount('---\nx: 1\n---\n'), 0);
	assert.strictEqual(strippedWordCount('# Title\n'), 0);
	assert.strictEqual(strippedWordCount('# Title\n\nhello world'), 2);
	assert.strictEqual(strippedWordCount('---\ntitle: a\n---\n# H\nfoo  bar\tbaz\n'), 3);
	console.log('PASS: strippedWordCountHelperIsExposed');
}

async function testFrontmatterMissingDetectorFiresOnNotesWithout(): Promise<void> {
	const dc = makeFakeContext({
		files: [
			{ path: 'has.md', basename: 'has' },
			{ path: 'missing.md', basename: 'missing' },
			{ path: 'empty.md', basename: 'empty' },
			{ path: 'body-rules.md', basename: 'body-rules' },
		],
		fileContent: {
			'has.md': '---\ntitle: With\ntags: [a]\n---\n\nBody.',
			'missing.md': '# Header\n\nNo frontmatter here.',
			'empty.md': '',
			// horizontal rule in body must NOT be mistaken for frontmatter
			'body-rules.md': '# Head\n\nSome text\n\n---\n\nMore text',
		},
	});
	const findings = await frontmatterMissingDetector.detect(makeScanContext(dc));
	const firedPaths = findings.map((f) => f.filePath).sort();
	assert.deepStrictEqual(firedPaths, ['body-rules.md', 'empty.md', 'missing.md']);
	for (const f of findings) {
		assert.strictEqual(f.signalId, 'C-FRONTMATTER-MISSING');
		assert.deepStrictEqual(f.fixActions, ['add-frontmatter']);
	}
	console.log('PASS: frontmatterMissingDetectorFiresOnNotesWithout');
}

async function testFrontmatterMissingDetectorRespectsDismissals(): Promise<void> {
	const dc = makeFakeContext({
		files: [{ path: 'x.md', basename: 'x' }],
		fileContent: { 'x.md': '# no frontmatter' },
	});
	const findings = await frontmatterMissingDetector.detect(
		makeScanContext(dc, ['C-FRONTMATTER-MISSING:x.md']),
	);
	assert.strictEqual(findings.length, 0);
	console.log('PASS: frontmatterMissingDetectorRespectsDismissals');
}

function testHasFrontmatterHelperIsExposed(): void {
	assert.strictEqual(hasFrontmatter(''), false);
	assert.strictEqual(hasFrontmatter('# H\n'), false);
	assert.strictEqual(hasFrontmatter('---\ntitle: a\n---\n'), true);
	assert.strictEqual(hasFrontmatter('---\ntitle: a\n---\nbody'), true);
	// Bare '---' (no key/value block) must not qualify.
	assert.strictEqual(hasFrontmatter('---\n---\n'), false);
	// Frontmatter that is not the very first content must NOT match.
	assert.strictEqual(hasFrontmatter('\n---\ntitle: a\n---\n'), false);
	console.log('PASS: hasFrontmatterHelperIsExposed');
}

async function testNamingViolationDetectorFires(): Promise<void> {
	const dc = makeFakeContext({
		files: [
			{ path: 'Untitled.md', basename: 'Untitled' },
			{ path: 'Untitled 3.md', basename: 'Untitled 3' },
			{ path: '  spaced.md', basename: '  spaced' },
			{ path: 'ok/valid-note.md', basename: 'valid-note' },
			{ path: 'ok/Also OK.md', basename: 'Also OK' },
		],
	});
	const findings = await namingViolationDetector.detect(makeScanContext(dc));
	const firedPaths = findings.map((f) => f.filePath).sort();
	assert.deepStrictEqual(firedPaths, ['  spaced.md', 'Untitled 3.md', 'Untitled.md']);
	for (const f of findings) {
		assert.strictEqual(f.signalId, 'C-NAMING-VIOLATION');
		assert.deepStrictEqual(f.fixActions, ['rename-with-prefix']);
	}
	console.log('PASS: namingViolationDetectorFires');
}

async function testNamingViolationDetectorRespectsDismissals(): Promise<void> {
	const dc = makeFakeContext({
		files: [{ path: 'Untitled.md', basename: 'Untitled' }],
	});
	const findings = await namingViolationDetector.detect(
		makeScanContext(dc, ['C-NAMING-VIOLATION:Untitled.md']),
	);
	assert.strictEqual(findings.length, 0);
	console.log('PASS: namingViolationDetectorRespectsDismissals');
}

function testDetectNamingViolationHelperEdgeCases(): void {
	assert.deepStrictEqual(detectNamingViolation(''), { reason: 'empty basename' });
	assert.deepStrictEqual(detectNamingViolation('Untitled'), { reason: `default placeholder name 'Untitled'` });
	assert.deepStrictEqual(detectNamingViolation('untitled'), { reason: `default placeholder name 'untitled'` });
	assert.deepStrictEqual(detectNamingViolation('Untitled  42'), { reason: `default placeholder name 'Untitled  42'` });
	assert.deepStrictEqual(detectNamingViolation(' leading'), { reason: 'basename has leading or trailing whitespace' });
	assert.deepStrictEqual(detectNamingViolation('trailing '), { reason: 'basename has leading or trailing whitespace' });
	// Legit basenames must not trigger.
	assert.strictEqual(detectNamingViolation('My Note'), null);
	assert.strictEqual(detectNamingViolation('2026-07-03 daily'), null);
	assert.strictEqual(detectNamingViolation('Untitled Chapter One'), null); // more than the placeholder
	console.log('PASS: detectNamingViolationHelperEdgeCases');
}

function testStrippedLengthHelperIsExposed(): void {
	// `strippedLength` is exported so existing assumptions about
	// frontmatter/heading stripping stay easy to verify.
	assert.strictEqual(strippedLength(''), 0);
	assert.strictEqual(strippedLength('---\nx: 1\n---\n'), 0);
	assert.strictEqual(strippedLength('# Title\n'), 0);
	assert.strictEqual(strippedLength('# Title\n\nhello'), 'hello'.length);
	console.log('PASS: strippedLengthHelperIsExposed');
}

// ---------------------------------------------------------------------------
// Tags detector
// ---------------------------------------------------------------------------

async function testUntaggedDetectorFiresOnlyWhenBothTagSourcesEmpty(): Promise<void> {
	const dc = makeFakeContext({
		files: [
			{ path: 'inline.md', basename: 'inline' },
			{ path: 'fm.md', basename: 'fm' },
			{ path: 'both.md', basename: 'both' },
			{ path: 'none.md', basename: 'none' },
		],
		tags: {
			'inline.md': { inlineTags: ['todo'], frontmatterTags: [] },
			'fm.md': { inlineTags: [], frontmatterTags: ['project'] },
			'both.md': { inlineTags: ['idea'], frontmatterTags: ['journal'] },
			'none.md': { inlineTags: [], frontmatterTags: [] },
		},
	});
	const findings = await untaggedDetector.detect(makeScanContext(dc));
	assert.strictEqual(findings.length, 1);
	assert.strictEqual(findings[0]!.filePath, 'none.md');
	assert.strictEqual(findings[0]!.signalId, 'G-UNTAGGED');
	console.log('PASS: untaggedDetectorFiresOnlyWhenBothTagSourcesEmpty');
}

async function testUntaggedDetectorRespectsDismissals(): Promise<void> {
	const dc = makeFakeContext({
		files: [{ path: 'note.md', basename: 'note' }],
		tags: { 'note.md': { inlineTags: [], frontmatterTags: [] } },
	});
	const findings = await untaggedDetector.detect(
		makeScanContext(dc, ['G-UNTAGGED:note.md']),
	);
	assert.strictEqual(findings.length, 0);
	console.log('PASS: untaggedDetectorRespectsDismissals');
}

// ---------------------------------------------------------------------------
// Structural detectors
// ---------------------------------------------------------------------------

async function testBrokenLinkDetectorPullsFromContextAndGroupsBySource(): Promise<void> {
	const dc = makeFakeContext({
		unresolvedLinks: {
			'src.md': { 'Missing A': 2, 'Missing B': 1 },
		},
	});
	const findings = await brokenLinkDetector.detect(makeScanContext(dc));
	assert.strictEqual(findings.length, 1);
	assert.strictEqual(findings[0]!.filePath, 'src.md');
	assert.strictEqual(findings[0]!.metadata.brokenTargetCount, 2);
	assert.strictEqual(findings[0]!.metadata.brokenOccurrenceCount, 3);
	console.log('PASS: brokenLinkDetectorPullsFromContextAndGroupsBySource');
}

async function testBrokenLinkDetectorRespectsDismissals(): Promise<void> {
	const dc = makeFakeContext({
		unresolvedLinks: { 'src.md': { 'Missing A': 1 } },
	});
	const findings = await brokenLinkDetector.detect(
		makeScanContext(dc, ['S-BROKEN-LINK:src.md']),
	);
	assert.strictEqual(findings.length, 0);
	console.log('PASS: brokenLinkDetectorRespectsDismissals');
}

async function testOrphanDetectorReturnsEmptyWhenNoOrphansFromContext(): Promise<void> {
	const dc = makeFakeContext({ hardOrphans: [] });
	const findings = await orphanDetector.detect(makeScanContext(dc));
	assert.deepStrictEqual(findings, []);
	console.log('PASS: orphanDetectorReturnsEmptyWhenNoOrphansFromContext');
}

async function testOrphanDetectorReportsOrphansWithoutSemanticForNonIndexedTypes(): Promise<void> {
	const dc = makeFakeContext({
		hardOrphans: ['node-1'],
		nodes: {
			'node-1': {
				id: 'node-1',
				label: 'Orphan One',
				type: 'OtherType',
				attributes: JSON.stringify({ path: 'orphan.md' }),
			},
		},
		indexedNoteTypes: new Set([]), // not indexed → no semantic lookup
		semanticThrows: true, // would throw if called — proves it isn't
	});
	const findings = await orphanDetector.detect(makeScanContext(dc));
	assert.strictEqual(findings.length, 1);
	assert.strictEqual(findings[0]!.signalId, 'S-ORPHAN');
	assert.strictEqual(findings[0]!.filePath, 'orphan.md');
	assert.strictEqual(findings[0]!.title, 'Orphan note: Orphan One');
	const meta = findings[0]!.metadata as { orphanType: string; revivalSuggestion?: unknown };
	assert.strictEqual(meta.orphanType, 'hard');
	assert.strictEqual(meta.revivalSuggestion, undefined);
	console.log('PASS: orphanDetectorReportsOrphansWithoutSemanticForNonIndexedTypes');
}

async function testOrphanDetectorAttachesSemanticRevivalSuggestion(): Promise<void> {
	const dc = makeFakeContext({
		hardOrphans: ['node-1'],
		nodes: {
			'node-1': {
				id: 'node-1',
				label: 'Lonely Note',
				type: 'IndexedDoc',
				attributes: JSON.stringify({ path: 'lonely.md' }),
			},
		},
		indexedNoteTypes: new Set(['IndexedDoc']),
		semanticNeighbors: {
			'node-1': [
				{
					id: 'node-low',
					label: 'Low Sim',
					type: 'IndexedDoc',
					attributes: JSON.stringify({ path: 'low.md' }),
					similarity: '40.0%',
				},
				{
					id: 'node-best',
					label: 'High Sim',
					type: 'IndexedDoc',
					attributes: JSON.stringify({ path: 'best.md' }),
					similarity: '85.5%',
				},
			],
		},
	});
	const findings = await orphanDetector.detect(makeScanContext(dc));
	assert.strictEqual(findings.length, 1);
	const meta = findings[0]!.metadata as {
		orphanType: string;
		revivalSuggestion?: {
			targetPath: string;
			targetTitle: string;
			similarity: number;
			reason: string;
		};
	};
	assert.ok(meta.revivalSuggestion, 'revival suggestion should be attached');
	assert.strictEqual(meta.revivalSuggestion!.targetPath, 'best.md');
	assert.strictEqual(meta.revivalSuggestion!.targetTitle, 'High Sim');
	assert.strictEqual(meta.revivalSuggestion!.similarity, 85.5);
	console.log('PASS: orphanDetectorAttachesSemanticRevivalSuggestion');
}

async function testOrphanDetectorTolersSemanticPortFailures(): Promise<void> {
	const dc = makeFakeContext({
		hardOrphans: ['node-1'],
		nodes: {
			'node-1': {
				id: 'node-1',
				label: 'Lonely',
				type: 'IndexedDoc',
				attributes: JSON.stringify({ path: 'lonely.md' }),
			},
		},
		indexedNoteTypes: new Set(['IndexedDoc']),
		semanticThrows: true,
	});
	const findings = await orphanDetector.detect(makeScanContext(dc));
	assert.strictEqual(findings.length, 1, 'orphan finding still produced when semantic search throws');
	const meta = findings[0]!.metadata as { revivalSuggestion?: unknown };
	assert.strictEqual(meta.revivalSuggestion, undefined);
	console.log('PASS: orphanDetectorTolersSemanticPortFailures');
}

async function testOrphanDetectorRespectsDismissalsKeyedByPath(): Promise<void> {
	const dc = makeFakeContext({
		hardOrphans: ['node-1'],
		nodes: {
			'node-1': {
				id: 'node-1',
				label: 'Orphan',
				type: 'OtherType',
				attributes: JSON.stringify({ path: 'orphan.md' }),
			},
		},
		indexedNoteTypes: new Set([]),
	});
	const findings = await orphanDetector.detect(
		makeScanContext(dc, ['S-ORPHAN:orphan.md']),
	);
	assert.strictEqual(findings.length, 0);
	console.log('PASS: orphanDetectorRespectsDismissalsKeyedByPath');
}

// Existing pure-function coverage stays intact.
function testBuildBrokenLinkFindingsIsUnchanged(): void {
	const findings = buildBrokenLinkFindings(
		{ 'src.md': { 'Missing A': 3 } },
		new Map(),
	);
	assert.strictEqual(findings.length, 1);
	assert.strictEqual(findings[0]!.signalId, 'S-BROKEN-LINK');
	console.log('PASS: buildBrokenLinkFindingsIsUnchanged');
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	await testEmptyDetectorFindsNotesEmptyAfterStripping();
	await testEmptyDetectorRespectsDismissals();
	await testStubDetectorFiresUnderConfiguredThreshold();
	await testStubDetectorRespectsDismissals();
	await testOversizedDetectorFiresAtOrAboveThreshold();
	await testOversizedDetectorRespectsDismissals();
	await testFrontmatterMissingDetectorFiresOnNotesWithout();
	await testFrontmatterMissingDetectorRespectsDismissals();
	testHasFrontmatterHelperIsExposed();
	await testNamingViolationDetectorFires();
	await testNamingViolationDetectorRespectsDismissals();
	testDetectNamingViolationHelperEdgeCases();
	testStrippedWordCountHelperIsExposed();
	testStrippedLengthHelperIsExposed();
	await testUntaggedDetectorFiresOnlyWhenBothTagSourcesEmpty();
	await testUntaggedDetectorRespectsDismissals();
	await testBrokenLinkDetectorPullsFromContextAndGroupsBySource();
	await testBrokenLinkDetectorRespectsDismissals();
	await testOrphanDetectorReturnsEmptyWhenNoOrphansFromContext();
	await testOrphanDetectorReportsOrphansWithoutSemanticForNonIndexedTypes();
	await testOrphanDetectorAttachesSemanticRevivalSuggestion();
	await testOrphanDetectorTolersSemanticPortFailures();
	await testOrphanDetectorRespectsDismissalsKeyedByPath();
	testBuildBrokenLinkFindingsIsUnchanged();
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});
