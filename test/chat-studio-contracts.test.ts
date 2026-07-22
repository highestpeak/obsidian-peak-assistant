// Chat Studio Track A — domain & persistence contract guards.
// Spec: docs/superpowers/specs/2026-07-15-chat-studio-complete-implementation-spec.md §12
// Run with: npm run test -- test/chat-studio-contracts.test.ts

import assert from 'assert';
import {
	AUTO_MODEL_SELECTION,
	normalizeModelSelection,
	isAutoSelection,
	emptySourceScope,
	emptySourceReceipt,
	draftKeyForNew,
	draftKeyForProject,
	draftKeyForConversation,
	defaultToolPolicy,
	PROJECT_PLAN_STATUSES,
	type ModelSelection,
	type TurnExecutionReceipt,
	type ChatArtifactReceipt,
} from '@/core/types/chat-studio';
import { ChatProjectSummaryDoc } from '@/core/storage/vault/chat-docs/ChatProjectSummaryDoc';
import { SourceReceiptCollector, extractWebSourcesFromText } from '@/service/chat/tools/sourceReceiptCollector';
import { ChatStorageService } from '@/core/storage/vault/ChatStore';

// ---------------------------------------------------------------------------
// ModelSelection normalization (RUN gate 2 / COMP-05)
// ---------------------------------------------------------------------------

function testModelSelectionNormalization(): void {
	// Missing raw + no legacy → auto (never guessed fixed)
	assert.deepStrictEqual(normalizeModelSelection(undefined), AUTO_MODEL_SELECTION);
	assert.deepStrictEqual(normalizeModelSelection(null), AUTO_MODEL_SELECTION);
	// Explicit auto survives round-trip
	assert.deepStrictEqual(normalizeModelSelection({ mode: 'auto' }), { mode: 'auto' });
	// Explicit fixed survives round-trip
	const fixed: ModelSelection = { mode: 'fixed', profileId: 'p1', modelId: 'm1' };
	assert.deepStrictEqual(normalizeModelSelection(JSON.parse(JSON.stringify(fixed))), fixed);
	// Malformed fixed (missing ids) → auto, not garbage
	assert.deepStrictEqual(normalizeModelSelection({ mode: 'fixed', profileId: '', modelId: 'm' }), AUTO_MODEL_SELECTION);
	assert.deepStrictEqual(normalizeModelSelection({ mode: 'fixed' }), AUTO_MODEL_SELECTION);
	// Legacy conversation with BOTH activeModel+activeProvider → fixed
	assert.deepStrictEqual(
		normalizeModelSelection(undefined, { activeModel: 'gpt-x', activeProvider: 'openai' }),
		{ mode: 'fixed', profileId: 'openai', modelId: 'gpt-x' },
	);
	// Legacy with empty model → auto (empty field must NOT imply a fixed model)
	assert.deepStrictEqual(
		normalizeModelSelection(undefined, { activeModel: '', activeProvider: 'openai' }),
		AUTO_MODEL_SELECTION,
	);
	assert.ok(isAutoSelection(undefined));
	assert.ok(isAutoSelection(AUTO_MODEL_SELECTION));
	assert.ok(!isAutoSelection(fixed));
	console.log('PASS: modelSelectionNormalization');
}

// ---------------------------------------------------------------------------
// Project summary doc: user-owned vs system-owned sections (RUN-05 / PROJ-02)
// ---------------------------------------------------------------------------

function testProjectSummaryDocRoundTrip(): void {
	const md = ChatProjectSummaryDoc.buildMarkdown({
		description: 'User-owned description.',
		instructions: 'Always answer in bullet points.',
		shortSummary: 'System summary.',
		fullSummary: 'System full summary.\n\nSecond paragraph.',
	});
	const parsed = ChatProjectSummaryDoc.parse(md);
	assert.strictEqual(parsed.description, 'User-owned description.');
	assert.strictEqual(parsed.instructions, 'Always answer in bullet points.');
	assert.strictEqual(parsed.shortSummary, 'System summary.');
	assert.strictEqual(parsed.fullSummary, 'System full summary.\n\nSecond paragraph.');
	console.log('PASS: projectSummaryDocRoundTrip');
}

function testProjectSummaryDocLegacyCompat(): void {
	// Legacy sectioned file (pre-description era)
	const legacySectioned = '## Short Summary\n\nOld short.\n\n## Full Summary\n\nOld full.\n';
	const parsedSectioned = ChatProjectSummaryDoc.parse(legacySectioned);
	assert.strictEqual(parsedSectioned.description, '');
	assert.strictEqual(parsedSectioned.instructions, '');
	assert.strictEqual(parsedSectioned.shortSummary, 'Old short.');
	assert.strictEqual(parsedSectioned.fullSummary, 'Old full.');

	// Legacy plain text
	const plain = 'First paragraph short.\n\nRemainder full text.';
	const parsedPlain = ChatProjectSummaryDoc.parse(plain);
	assert.strictEqual(parsedPlain.description, '');
	assert.strictEqual(parsedPlain.shortSummary, 'First paragraph short.');
	assert.strictEqual(parsedPlain.fullSummary, 'Remainder full text.');

	// Empty
	const parsedEmpty = ChatProjectSummaryDoc.parse('');
	assert.deepStrictEqual(parsedEmpty, { description: '', instructions: '', shortSummary: '', fullSummary: '' });
	console.log('PASS: projectSummaryDocLegacyCompat');
}

function testProjectSummaryDocSystemRewriteKeepsUserSections(): void {
	// Simulate: user saved description, then the system regenerates summaries.
	// ChatStore re-reads user sections; here we assert build+parse fidelity
	// when both owners write through the same doc model.
	const v1 = ChatProjectSummaryDoc.buildMarkdown({
		description: 'Keep me.',
		instructions: '',
		shortSummary: 'v1 summary',
		fullSummary: '',
	});
	const reparsed = ChatProjectSummaryDoc.parse(v1);
	const v2 = ChatProjectSummaryDoc.buildMarkdown({
		description: reparsed.description, // system flow must carry user sections through
		instructions: reparsed.instructions,
		shortSummary: 'v2 regenerated summary',
		fullSummary: 'v2 full',
	});
	const final = ChatProjectSummaryDoc.parse(v2);
	assert.strictEqual(final.description, 'Keep me.');
	assert.strictEqual(final.shortSummary, 'v2 regenerated summary');
	console.log('PASS: projectSummaryDocSystemRewriteKeepsUserSections');
}

// ---------------------------------------------------------------------------
// Source scope / receipt (COMP-04 / RUN-02)
// ---------------------------------------------------------------------------

function testSourceScopeAndReceipt(): void {
	const scope = emptySourceScope('proj-1');
	assert.deepStrictEqual(scope.project, { projectId: 'proj-1', locked: true });
	assert.strictEqual(scope.vaultSearch, false);
	assert.strictEqual(scope.webSearch, false);
	assert.deepStrictEqual(scope.explicitRefs, []);
	assert.strictEqual(emptySourceScope(null).project, null);
	assert.strictEqual(emptySourceScope().project, null);

	const receipt = emptySourceReceipt();
	assert.strictEqual(receipt.projectIncluded, false);
	assert.deepStrictEqual(receipt.vaultQueries, []);
	console.log('PASS: sourceScopeAndReceipt');
}

function testSourceReceiptCollector(): void {
	const collector = new SourceReceiptCollector();
	collector.markProjectIncluded();
	collector.recordVaultQuery('graph view');
	collector.recordVaultDocument({ id: 'a', path: 'Notes/A.md', title: 'A' });
	collector.recordVaultDocument({ id: 'a2', path: 'Notes/A.md', title: 'A dup' }); // dedup by path
	collector.recordWebQuery('obsidian plugin api');
	collector.recordWebSource({ id: 'w1', url: 'https://example.com', title: 'Example' });
	collector.recordWebSource({ id: 'w2', url: 'https://example.com', title: 'Example dup' }); // dedup by url

	const snap = collector.snapshot();
	assert.strictEqual(snap.projectIncluded, true);
	assert.deepStrictEqual(snap.vaultQueries, ['graph view']);
	assert.strictEqual(snap.vaultDocuments.length, 1);
	assert.strictEqual(snap.webSources.length, 1);

	// snapshot is a copy — later mutations must not leak into it
	collector.recordVaultQuery('second');
	assert.deepStrictEqual(snap.vaultQueries, ['graph view']);
	console.log('PASS: sourceReceiptCollector');
}

// ---------------------------------------------------------------------------
// Web-source extraction (RUN-02 receipt honesty): the web_search tool parses
// cited URLs out of the model's answer text — there is no structured metadata.
// ---------------------------------------------------------------------------

function testWebSourceExtraction(): void {
	// Empty / no-URL text yields nothing.
	assert.deepStrictEqual(extractWebSourcesFromText(''), []);
	assert.deepStrictEqual(extractWebSourcesFromText('No links here, just prose.'), []);

	// Markdown links carry a human title; bare URLs fall back to the URL.
	const answer =
		'See [Obsidian API](https://docs.obsidian.md/api) for details. ' +
		'Also relevant: https://example.com/page. ' +
		'And an angle link <https://angle.example.org/x>.';
	const sources = extractWebSourcesFromText(answer);
	const byUrl = new Map(sources.map((s) => [s.url, s]));
	assert.strictEqual(byUrl.get('https://docs.obsidian.md/api')?.title, 'Obsidian API');
	// Trailing sentence punctuation is stripped; title falls back to the URL.
	assert.ok(byUrl.has('https://example.com/page'));
	assert.strictEqual(byUrl.get('https://example.com/page')?.title, 'https://example.com/page');
	assert.ok(byUrl.has('https://angle.example.org/x'));
	// Every source has a stable non-empty id.
	assert.ok(sources.every((s) => !!s.id));

	// Dedupe by URL — the same URL cited twice yields one source; the markdown
	// title wins over the bare-URL restatement of the same link.
	const dup = extractWebSourcesFromText(
		'[Docs](https://dup.example.com/a) then again https://dup.example.com/a here.',
	);
	assert.strictEqual(dup.length, 1);
	assert.strictEqual(dup[0].title, 'Docs');

	// End-to-end: extracted sources feed the collector and land in the receipt.
	const collector = new SourceReceiptCollector();
	for (const source of extractWebSourcesFromText(answer)) collector.recordWebSource(source);
	assert.strictEqual(collector.snapshot().webSources.length, 3);
	console.log('PASS: webSourceExtraction');
}

// ---------------------------------------------------------------------------
// Receipt JSON round-trips (DATA-02)
// ---------------------------------------------------------------------------

function testTurnReceiptJsonRoundTrip(): void {
	const receipt: TurnExecutionReceipt = {
		requestId: 'req-1',
		messageId: 'msg-1',
		conversationId: 'conv-1',
		runId: 'run-1',
		effectiveModel: { profileId: 'p1', provider: 'anthropic', modelId: 'claude-x' },
		assistantId: 'asst-1',
		workflowId: 'plan',
		requestedSources: {
			project: { projectId: 'proj-1', locked: true },
			vaultSearch: true,
			webSearch: false,
			explicitRefs: [{ id: 'r1', kind: 'vault-file', uri: 'Notes/A.md', title: 'A' }],
		},
		actualSources: {
			projectIncluded: true,
			vaultQueries: ['q'],
			vaultDocuments: [{ id: 'a', path: 'Notes/A.md', title: 'A' }],
			webQueries: [],
			webSources: [],
			explicitRefsUsed: [{ id: 'r1', kind: 'vault-file', uri: 'Notes/A.md', title: 'A' }],
		},
		status: 'timeout',
		artifactIds: ['art-1'],
		startedAt: 1000,
		finishedAt: 2000,
		error: { code: 'timeout', message: 'No response', recoverable: true },
	};
	const roundTripped = JSON.parse(JSON.stringify(receipt)) as TurnExecutionReceipt;
	assert.deepStrictEqual(roundTripped, receipt);
	// status vocabulary includes the RUN-03 states
	const statuses: TurnExecutionReceipt['status'][] = [
		'queued', 'sending', 'streaming', 'waiting-permission', 'completed', 'error', 'cancelled', 'timeout',
	];
	assert.strictEqual(new Set(statuses).size, 8);
	console.log('PASS: turnReceiptJsonRoundTrip');
}

function testArtifactReceiptJsonRoundTrip(): void {
	const receipt: ChatArtifactReceipt = {
		artifactId: 'art-1',
		runId: 'run-1',
		messageId: 'msg-1',
		conversationId: 'conv-1',
		projectId: 'proj-1',
		direction: 'generated',
		kind: 'document',
		title: 'Draft report',
		vaultPath: 'AI/Artifacts/report.md',
		state: 'saved',
		availableActions: ['open', 'download'],
		createdAt: 1234,
	};
	const roundTripped = JSON.parse(JSON.stringify(receipt)) as ChatArtifactReceipt;
	assert.deepStrictEqual(roundTripped, receipt);
	console.log('PASS: artifactReceiptJsonRoundTrip');
}

// ---------------------------------------------------------------------------
// Draft keys + misc contracts (COMP-01)
// ---------------------------------------------------------------------------

function testDraftKeys(): void {
	assert.strictEqual(draftKeyForNew(), 'new');
	assert.strictEqual(draftKeyForProject('p1'), 'project:p1');
	assert.strictEqual(draftKeyForConversation('c1'), 'conversation:c1');
	// Keys are disjoint — no draft leakage between scopes
	assert.notStrictEqual(draftKeyForProject('x'), draftKeyForConversation('x'));
	console.log('PASS: draftKeys');
}

// ---------------------------------------------------------------------------
// Conversation meta row unpack (DATA-01/DATA-03: pinned, assistant, selection)
// ---------------------------------------------------------------------------

function testConversationMetaRowUnpack(): void {
	const baseRow = {
		conversation_id: 'c1',
		project_id: 'p1',
		title: 'T',
		file_rel_path: 'Conv-x.md',
		created_at_ts: 1,
		updated_at_ts: 2,
		active_model: 'claude-x',
		active_provider: 'anthropic',
		token_usage_total: null,
		title_manually_edited: 0,
		title_auto_updated: 1,
		context_last_updated_ts: null,
		context_last_message_index: null,
		archived_rel_path: null,
		meta_json: null,
	};
	const extras = {
		customSystemPrompt: 'be terse',
		conversationType: { kind: 'plan' },
		focusFolder: 'Research/',
		assistantId: 'asst-9',
		modelSelection: { mode: 'auto' },
		pinned: true,
		pinnedAt: 555,
	};
	const meta = ChatStorageService.rowToConversationMeta(baseRow as any, extras as any);
	assert.strictEqual(meta.customSystemPrompt, 'be terse');
	assert.deepStrictEqual(meta.conversationType, { kind: 'plan' });
	assert.strictEqual(meta.focusFolder, 'Research/');
	assert.strictEqual(meta.assistantId, 'asst-9');
	assert.deepStrictEqual(meta.modelSelection, { mode: 'auto' });
	assert.strictEqual(meta.pinned, true);
	assert.strictEqual(meta.pinnedAt, 555);
	assert.strictEqual(meta.archived, undefined);

	// Explicit auto in meta_json must NOT be overridden by legacy activeModel
	assert.deepStrictEqual(meta.modelSelection, { mode: 'auto' });

	// Archived flag derives from archived_rel_path
	const archivedMeta = ChatStorageService.rowToConversationMeta(
		{ ...baseRow, archived_rel_path: 'Conv-x.md' } as any,
		{} as any,
	);
	assert.strictEqual(archivedMeta.archived, true);

	// Legacy row: no extras at all → optional fields stay undefined
	const legacyMeta = ChatStorageService.rowToConversationMeta(baseRow as any, {} as any);
	assert.strictEqual(legacyMeta.pinned, undefined);
	assert.strictEqual(legacyMeta.assistantId, undefined);
	assert.strictEqual(legacyMeta.modelSelection, undefined);
	console.log('PASS: conversationMetaRowUnpack');
}

function testMiscContracts(): void {
	assert.deepStrictEqual(defaultToolPolicy(), { allow: [], deny: [], approval: 'writes' });
	assert.deepStrictEqual(PROJECT_PLAN_STATUSES, ['planned', 'active', 'blocked', 'done', 'archived']);
	console.log('PASS: miscContracts');
}

function run(): void {
	testModelSelectionNormalization();
	testProjectSummaryDocRoundTrip();
	testProjectSummaryDocLegacyCompat();
	testProjectSummaryDocSystemRewriteKeepsUserSections();
	testSourceScopeAndReceipt();
	testSourceReceiptCollector();
	testWebSourceExtraction();
	testTurnReceiptJsonRoundTrip();
	testArtifactReceiptJsonRoundTrip();
	testDraftKeys();
	testConversationMetaRowUnpack();
	testMiscContracts();
	console.log('chat-studio-contracts: all guards passed');
}

run();
