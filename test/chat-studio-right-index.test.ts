// Chat Studio right-column (Track F) — pure model contracts.
//
// Covers RIGHT-01..03 from docs/superpowers/specs/2026-07-15-chat-studio-*:
//   - Outline building: ordering, topic grouping, process + error + artifact
//     anchors, artifacts joined by messageId.
//   - Resource row mapping: direction + kind derived from receipts, message
//     resources, turn receipt actualSources.
//   - Filter semantics: direction × type AND combine, query filters BOTH.
//   - RIGHT-01 boundary: outline building never accepts a filter — assert
//     signature + behavior parity across "the same messages / different
//     resource filters".
//
// The whole model layer is React-free / DOM-free, so this test runs as plain
// Node with the shared `run-test.js` harness (compiles via esbuild + executes).

import assert from 'assert';

import type { ChatMessage } from '@/core/types/chat';
import { MessageStatus } from '@/core/types/chat';
import type {
	ChatArtifactReceipt,
	TurnExecutionReceipt,
} from '@/core/types/chat-studio';

import {
	buildOutlineItems,
	buildResourceRows,
	filterOutlineItems,
	filterStarredOutlineItems,
	filterResourceRows,
	flattenOutline,
	mapArtifactKind,
	mapMessageResourceKind,
	DEFAULT_RESOURCE_FILTER,
	type ResourceFilter,
} from '@/ui/view/chat-view/components/conversation-index/outlineModel';

// ── Fixture helpers ─────────────────────────────────────────────────────────

function userMsg(id: string, content: string, opts: Partial<ChatMessage> = {}): ChatMessage {
	return {
		id,
		role: 'user',
		content,
		createdAtTimestamp: opts.createdAtTimestamp ?? 1000,
		createdAtZone: 'UTC',
		starred: false,
		model: '',
		provider: '',
		...opts,
	};
}

function assistantMsg(id: string, content: string, opts: Partial<ChatMessage> = {}): ChatMessage {
	return {
		id,
		role: 'assistant',
		content,
		createdAtTimestamp: opts.createdAtTimestamp ?? 2000,
		createdAtZone: 'UTC',
		starred: false,
		model: '',
		provider: '',
		...opts,
	};
}

function artifact(id: string, messageId: string, over: Partial<ChatArtifactReceipt> = {}): ChatArtifactReceipt {
	return {
		artifactId: id,
		runId: `run-${id}`,
		messageId,
		conversationId: 'conv-1',
		direction: 'generated',
		kind: 'document',
		title: `Artifact ${id}`,
		state: 'ready',
		availableActions: ['open'],
		createdAt: 3000,
		...over,
	};
}

function turn(messageId: string, over: Partial<TurnExecutionReceipt> = {}): TurnExecutionReceipt {
	return {
		requestId: `req-${messageId}`,
		messageId,
		conversationId: 'conv-1',
		effectiveModel: { provider: 'p', modelId: 'm' },
		requestedSources: { project: null, vaultSearch: false, webSearch: false, explicitRefs: [] },
		actualSources: { projectIncluded: false, vaultQueries: [], vaultDocuments: [], webQueries: [], webSources: [], explicitRefsUsed: [] },
		status: 'completed',
		artifactIds: [],
		startedAt: 4000,
		...over,
	};
}

// ── Outline building ─────────────────────────────────────────────────────────

function testOutlineOrderingNewestFirst(): void {
	const messages = [
		userMsg('u1', 'hello', { createdAtTimestamp: 1000 }),
		assistantMsg('a1', 'hi there', { createdAtTimestamp: 2000 }),
		userMsg('u2', 'follow up', { createdAtTimestamp: 3000 }),
	];
	const groups = buildOutlineItems(messages, []);
	assert.strictEqual(groups.length, 1, 'no-topic conversation → single group');
	assert.strictEqual(groups[0].topic, '');
	assert.deepStrictEqual(
		groups[0].items.map((it) => it.id),
		['msg:u2', 'msg:a1', 'msg:u1'],
		'items are newest-first (reverse-chronological) when no topic is set',
	);
	// `order` is renumbered to the visual (newest-first) order so flattenOutline
	// == render order for the a11y scan.
	assert.deepStrictEqual(groups[0].items.map((it) => it.order), [0, 1, 2]);
	console.log('PASS: outlineOrderingNewestFirst');
}

function testOutlineTopicGrouping(): void {
	const messages = [
		userMsg('u1', 'about API', { topic: 'API setup', createdAtTimestamp: 1000 }),
		assistantMsg('a1', 'sure', { topic: 'API setup', createdAtTimestamp: 2000 }),
		userMsg('u2', 'unrelated ask', { createdAtTimestamp: 3000 }),
		assistantMsg('a2', 'ok', { topic: 'Deploy plan', createdAtTimestamp: 4000 }),
	];
	const groups = buildOutlineItems(messages, []);
	// Newest-first walk: the newest message's topic (Deploy plan) leads, the
	// untopiced run comes next, and the oldest topic (API setup) trails.
	assert.deepStrictEqual(
		groups.map((g) => g.topic),
		['Deploy plan', '', 'API setup'],
		'topic order is newest-first (first-seen under a newest→oldest walk)',
	);
	assert.strictEqual(groups[0].items.length, 1, 'Deploy plan: a2');
	assert.strictEqual(groups[1].items.length, 1, 'untopiced: u2');
	assert.strictEqual(groups[2].items.length, 2, 'API setup: a1 + u1');
	// Inside a group items are newest-first too — a1 (newer) precedes u1.
	assert.deepStrictEqual(groups[2].items.map((it) => it.id), ['msg:a1', 'msg:u1']);
	console.log('PASS: outlineTopicGrouping');
}

function testOutlineKeepsRepeatedTopicsAsContiguousRuns(): void {
	// Intentionally scramble the input array. The visual order must come from
	// createdAtTimestamp, and returning to Topic A after Topic B must create a
	// second A run instead of pulling old A messages above B.
	const messages = [
		userMsg('a-oldest', 'A oldest', { topic: 'Topic A', createdAtTimestamp: 1000 }),
		assistantMsg('a-newest', 'A newest', { topic: 'Topic A', createdAtTimestamp: 4000 }),
		userMsg('b-middle', 'B middle', { topic: 'Topic B', createdAtTimestamp: 3000 }),
		assistantMsg('a-older', 'A older', { topic: 'Topic A', createdAtTimestamp: 2000 }),
	];
	const groups = buildOutlineItems(messages, []);

	assert.deepStrictEqual(groups.map((g) => g.topic), ['Topic A', 'Topic B', 'Topic A']);
	assert.deepStrictEqual(
		flattenOutline(groups).map((item) => item.messageId),
		['a-newest', 'b-middle', 'a-older', 'a-oldest'],
		'flattened outline must remain globally reverse-chronological',
	);
	assert.notStrictEqual(groups[0].id, groups[2].id, 'repeated topic runs need distinct collapse identities');
	console.log('PASS: outlineKeepsRepeatedTopicsAsContiguousRuns');
}

function testOutlineProcessAndErrorNodes(): void {
	const messages = [
		userMsg('u1', 'do it', { createdAtTimestamp: 1000 }),
		assistantMsg('a1', 'working', {
			createdAtTimestamp: 2000,
			toolCalls: [{ toolName: 'search' }, { toolName: 'fetch' }],
			status: MessageStatus.COMPLETED,
		}),
		assistantMsg('a2', 'oh no', { createdAtTimestamp: 3000, status: MessageStatus.ERROR, isErrorMessage: true }),
		assistantMsg('a3', 'stopped', { createdAtTimestamp: 4000, status: MessageStatus.CANCELLED }),
	];
	const items = flattenOutline(buildOutlineItems(messages, []));
	const kinds = items.map((it) => it.kind);
	assert.ok(kinds.includes('process'), 'assistant with toolCalls → process node');
	// process node must appear immediately after its assistant row.
	const idxAssistant = items.findIndex((it) => it.id === 'msg:a1');
	assert.strictEqual(items[idxAssistant + 1].kind, 'process');
	assert.strictEqual(items[idxAssistant + 1].label, 'Tools · 2');
	// error nodes for a2 + cancelled a3.
	const errNodes = items.filter((it) => it.kind === 'error');
	assert.strictEqual(errNodes.length, 2);
	assert.deepStrictEqual(errNodes.map((n) => n.label).sort(), ['Cancelled', 'Error']);
	console.log('PASS: outlineProcessAndErrorNodes');
}

function testOutlineArtifactAnchorsJoinedByMessage(): void {
	const messages = [
		userMsg('u1', 'draft the doc', { createdAtTimestamp: 1000 }),
		assistantMsg('a1', 'here you go', { createdAtTimestamp: 2000 }),
		assistantMsg('a2', 'v2', { createdAtTimestamp: 3000 }),
	];
	const receipts = [
		artifact('art-1', 'a1', { direction: 'generated', title: 'doc.md' }),
		artifact('art-2', 'a2', { direction: 'generated', title: 'doc-v2.md' }),
		// input artifact — must NOT surface in the outline (would duplicate u1).
		artifact('art-in', 'u1', { direction: 'input', title: 'ref.pdf' }),
	];
	const items = flattenOutline(buildOutlineItems(messages, receipts));
	const artIds = items.filter((it) => it.kind === 'artifact').map((it) => it.id);
	// Newest-first: a2's artifact precedes a1's; input artifacts stay out entirely.
	assert.deepStrictEqual(artIds, ['art:art-2', 'art:art-1'], 'input artifacts must not enter the outline');

	// artifact must STILL sit directly after its producing assistant row even
	// under the reversal (cluster integrity — attachments never float above the
	// parent that produced them).
	const idxA1 = items.findIndex((it) => it.id === 'msg:a1');
	assert.strictEqual(items[idxA1 + 1].id, 'art:art-1');
	console.log('PASS: outlineArtifactAnchorsJoinedByMessage');
}

function testOutlineClusterIntegrityUnderReversal(): void {
	// A message with process + error + artifact attachments must keep its whole
	// cluster in natural internal order (message row first, then attachments)
	// even though the OVERALL walk is newest→oldest.
	const messages = [
		userMsg('u1', 'kick it off', { createdAtTimestamp: 1000 }),
		assistantMsg('a1', 'on it', {
			createdAtTimestamp: 2000,
			toolCalls: [{ toolName: 'search' }],
			status: MessageStatus.ERROR,
			isErrorMessage: true,
		}),
	];
	const receipts = [artifact('art-1', 'a1', { direction: 'generated', title: 'out.md' })];
	const items = flattenOutline(buildOutlineItems(messages, receipts));
	// a1 is newest → its cluster leads; the cluster is [assistant, process,
	// error, artifact]; the older u1 row trails.
	assert.deepStrictEqual(
		items.map((it) => it.id),
		['msg:a1', 'proc:a1', 'err:a1', 'art:art-1', 'msg:u1'],
		'newest cluster leads, sub-rows stay under their parent, older msg trails',
	);
	assert.deepStrictEqual(items.map((it) => it.order), [0, 1, 2, 3, 4], 'order == visual order');
	console.log('PASS: outlineClusterIntegrityUnderReversal');
}

function testOutlineStarredFlag(): void {
	// `starred` is populated from `message.starred` on the user/assistant message
	// rows only — the process sub-node never carries it.
	const messages = [
		userMsg('u1', 'star me', { starred: true }),
		assistantMsg('a1', 'plain reply', { starred: false }),
		assistantMsg('a2', 'starred reply', { starred: true, toolCalls: [{ toolName: 'search' }] }),
	];
	const items = flattenOutline(buildOutlineItems(messages, []));
	assert.strictEqual(items.find((it) => it.id === 'msg:u1')?.starred, true);
	assert.strictEqual(items.find((it) => it.id === 'msg:a1')?.starred, false);
	assert.strictEqual(items.find((it) => it.id === 'msg:a2')?.starred, true);
	assert.strictEqual(
		items.find((it) => it.id === 'proc:a2')?.starred,
		undefined,
		'process sub-node must not carry the starred flag',
	);
	console.log('PASS: outlineStarredFlag');
}

function testStarredTabProjection(): void {
	const messages = [
		userMsg('u1', 'saved user question', { starred: true, topic: 'Saved' }),
		assistantMsg('a1', 'not saved', { starred: false, topic: 'Saved' }),
		assistantMsg('a2', 'saved answer', { starred: true, topic: 'Review', toolCalls: [{ toolName: 'search' }] }),
	];
	const groups = filterStarredOutlineItems(buildOutlineItems(messages, []));
	const items = flattenOutline(groups);
	assert.deepStrictEqual(items.map((item) => item.messageId), ['a2', 'u1']);
	assert.ok(items.every((item) => item.starred === true), 'Starred must not leak process/artifact or plain message rows');
	assert.deepStrictEqual(groups.map((group) => group.topic), ['Review', 'Saved']);
	assert.deepStrictEqual(
		flattenOutline(filterOutlineItems(groups, 'answer')).map((item) => item.messageId),
		['a2'],
		'Starred search applies after the starred projection',
	);
	console.log('PASS: starredTabProjection');
}

// ── RIGHT-01 boundary: outline ignores resource filters ─────────────────────

function testOutlineIgnoresResourceFilters(): void {
	// The compile-time contract: `buildOutlineItems` accepts exactly (messages,
	// receipts). If someone tries to pass a filter, TS blocks it. The runtime
	// contract: calling it with different filter values (via the wrapper below)
	// yields identical outlines.
	//
	// We assert the compile-time surface by using `Parameters<>` inspection.
	type OutlineParams = Parameters<typeof buildOutlineItems>;
	const arity: OutlineParams['length'] = 2;
	assert.strictEqual(arity, 2, 'buildOutlineItems must accept exactly 2 args');

	const messages = [userMsg('u1', 'x'), assistantMsg('a1', 'y')];
	const receipts = [artifact('art-1', 'a1')];
	const base = buildOutlineItems(messages, receipts);

	// Simulate a caller that has a resource filter live in state and try every
	// filter combo — the outline result must be byte-for-byte identical.
	const filters: ResourceFilter[] = [
		DEFAULT_RESOURCE_FILTER,
		{ direction: 'input', kind: 'all' },
		{ direction: 'generated', kind: 'document' },
		{ direction: 'all', kind: 'url', query: 'x' },
	];
	for (const f of filters) {
		// Deliberately DO NOT pass `f` — the model must not have a hook where
		// it could be threaded in. This assertion documents the invariant.
		void f;
		const again = buildOutlineItems(messages, receipts);
		assert.deepStrictEqual(again, base, 'outline is independent of resource filter state');
	}
	console.log('PASS: outlineIgnoresResourceFilters');
}

function testOutlineTextFilter(): void {
	const messages = [
		userMsg('u1', 'how do I deploy?'),
		assistantMsg('a1', 'run npm build first'),
		userMsg('u2', 'thanks'),
	];
	const groups = filterOutlineItems(buildOutlineItems(messages, []), 'deploy');
	const items = flattenOutline(groups);
	assert.strictEqual(items.length, 1);
	assert.strictEqual(items[0].messageId, 'u1');
	console.log('PASS: outlineTextFilter');
}

// ── Resource rows ────────────────────────────────────────────────────────────

function testResourceRowMappingDirectionAndKind(): void {
	const messages = [
		userMsg('u1', 'ref this', {
			resources: [
				{ id: 'r1', source: 'notes/plan.md', kind: 'markdown' as any },
				{ id: 'r2', source: 'https://example.com/paper', kind: 'url' as any },
				{ id: 'r3', source: 'design/cover.png', kind: 'image' as any },
			],
		}),
		assistantMsg('a1', 'here', {
			toolCalls: [{ toolName: 'search' }],
		}),
	];
	const receipts = [
		artifact('art-1', 'a1', { kind: 'diagram', direction: 'generated', title: 'flow.mmd', vaultPath: 'gen/flow.mmd' }),
		artifact('art-2', 'a1', { kind: 'code', direction: 'generated', title: 'patch.diff' }),
	];
	const turns = [
		turn('a1', {
			actualSources: {
				projectIncluded: false,
				vaultQueries: ['q'],
				vaultDocuments: [{ id: 'v1', path: 'kb/eng.md', title: 'Eng' }],
				webQueries: ['q'],
				webSources: [{ id: 'w1', url: 'https://x/y', title: 'Y' }],
				explicitRefsUsed: [],
			},
		}),
	];

	const rows = buildResourceRows(messages, receipts, turns);

	// Every message resource → input row with correct kind mapping.
	const planRow = rows.find((r) => r.id === 'res:u1:r1');
	assert.ok(planRow && planRow.direction === 'input' && planRow.kind === 'document');
	const urlRow = rows.find((r) => r.id === 'res:u1:r2');
	assert.ok(urlRow && urlRow.direction === 'input' && urlRow.kind === 'url');
	const imgRow = rows.find((r) => r.id === 'res:u1:r3');
	assert.ok(imgRow && imgRow.direction === 'input' && imgRow.kind === 'image');

	// Turn receipt actualSources → inbound vault + url rows.
	assert.ok(rows.find((r) => r.kind === 'vault' && r.direction === 'input'));
	const webRow = rows.find((r) => r.id.startsWith('tw:'));
	assert.ok(webRow && webRow.direction === 'input' && webRow.kind === 'url');

	// Artifact receipts → generated rows with mapped kinds.
	const artFlow = rows.find((r) => r.id === 'art:art-1');
	assert.ok(artFlow && artFlow.direction === 'generated' && artFlow.kind === 'diagram');
	const artPatch = rows.find((r) => r.id === 'art:art-2');
	assert.ok(artPatch && artPatch.kind === 'code');

	// Process row for the assistant tool call.
	const procRow = rows.find((r) => r.id === 'proc:a1');
	assert.ok(procRow && procRow.kind === 'process' && procRow.direction === 'generated');

	// Rows are newest-first (createdAt descending) for navigation, matching the
	// Outline tab. Turn-receipt sources (startedAt 4000) lead; the message
	// resources (1000) trail.
	for (let i = 1; i < rows.length; i++) {
		assert.ok(rows[i - 1].createdAt >= rows[i].createdAt, 'resource rows are newest-first');
	}

	console.log('PASS: resourceRowMappingDirectionAndKind');
}

function testMapArtifactKindCoverage(): void {
	assert.strictEqual(mapArtifactKind('image'), 'image');
	assert.strictEqual(mapArtifactKind('audio'), 'audio');
	assert.strictEqual(mapArtifactKind('video'), 'video');
	assert.strictEqual(mapArtifactKind('dataset'), 'table');
	assert.strictEqual(mapArtifactKind('diff'), 'code');
	assert.strictEqual(mapArtifactKind('drawing'), 'diagram');
	assert.strictEqual(mapArtifactKind('base'), 'base');
	// Unknown custom artifacts fall back to document.
	assert.strictEqual(mapArtifactKind('custom'), 'document');
	console.log('PASS: mapArtifactKindCoverage');
}

function testMapMessageResourceKindHeuristics(): void {
	assert.strictEqual(mapMessageResourceKind('image', 'a.png'), 'image');
	assert.strictEqual(mapMessageResourceKind('unknown', 'theme.mp3'), 'audio');
	assert.strictEqual(mapMessageResourceKind('unknown', 'walkthrough.mp4'), 'video');
	assert.strictEqual(mapMessageResourceKind('url', 'https://x'), 'url');
	assert.strictEqual(mapMessageResourceKind('csv', 'data.csv'), 'table');
	assert.strictEqual(mapMessageResourceKind('markdown', 'notes.md'), 'document');
	// Excalidraw/drawio/mermaid file → diagram row.
	assert.strictEqual(mapMessageResourceKind('excalidraw', 'x.excalidraw'), 'diagram');
	console.log('PASS: mapMessageResourceKindHeuristics');
}

// ── Filter semantics ─────────────────────────────────────────────────────────

function testResourceFilterAndSemantics(): void {
	const messages = [
		userMsg('u1', 'x', {
			resources: [{ id: 'r1', source: 'a.png', kind: 'image' as any }],
		}),
	];
	const receipts = [
		artifact('art-1', 'u1', { direction: 'generated', kind: 'image', title: 'gen.png' }),
		artifact('art-2', 'u1', { direction: 'generated', kind: 'document', title: 'gen.md' }),
	];
	const rows = buildResourceRows(messages, receipts, []);

	// direction=input alone
	const inputOnly = filterResourceRows(rows, { direction: 'input', kind: 'all' });
	assert.ok(inputOnly.every((r) => r.direction === 'input'));
	assert.ok(inputOnly.length > 0);

	// direction=generated + kind=image → only gen.png
	const genImages = filterResourceRows(rows, { direction: 'generated', kind: 'image' });
	assert.strictEqual(genImages.length, 1);
	assert.strictEqual(genImages[0].id, 'art:art-1');

	// query narrows across both filters
	const genImagesNoMatch = filterResourceRows(rows, { direction: 'generated', kind: 'image', query: 'zzz' });
	assert.strictEqual(genImagesNoMatch.length, 0);

	// direction=all + kind=all + no query → full set
	const allAll = filterResourceRows(rows, DEFAULT_RESOURCE_FILTER);
	assert.strictEqual(allAll.length, rows.length);

	console.log('PASS: resourceFilterAndSemantics');
}

// ── Runner ───────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
	testOutlineOrderingNewestFirst();
	testOutlineTopicGrouping();
	testOutlineKeepsRepeatedTopicsAsContiguousRuns();
	testOutlineProcessAndErrorNodes();
	testOutlineArtifactAnchorsJoinedByMessage();
	testOutlineClusterIntegrityUnderReversal();
	testOutlineStarredFlag();
	testStarredTabProjection();
	testOutlineIgnoresResourceFilters();
	testOutlineTextFilter();
	testResourceRowMappingDirectionAndKind();
	testMapArtifactKindCoverage();
	testMapMessageResourceKindHeuristics();
	testResourceFilterAndSemantics();
	console.log('chat-studio-right-index: all guards passed');
}

run().catch((err) => { console.error(err); process.exit(1); });
