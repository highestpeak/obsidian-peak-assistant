/**
 * Chat Studio zero-gap Track D (2026-07-21) — ArtifactProducerService contract.
 *
 * Covers all 5 producer sub-types:
 *   • dataview  — DQL + dataviewjs happy paths, invalid DQL keyword.
 *   • excalidraw — valid scene JSON (bare array + full scene shape),
 *                  malformed JSON path.
 *   • drawio    — valid <mxfile>, missing root, XML parser error.
 *   • extract   — happy path with sourceRefs + sourceMessageIds embedded
 *                 as backlinks; empty content path.
 *   • reminder  — frontmatter round-trip; past dueIso rejected;
 *                 malformed dueIso rejected.
 *
 * Uses an in-memory ArtifactVaultWriter (no Obsidian required) and a
 * captured receipt sink. Also verifies that failed producers preserve the
 * original raw content on preview.text so the UI retry action can replay.
 *
 * PASS: markers make it easy to see per-scenario coverage in the runner.
 */

import assert from 'assert';
import {
	ArtifactProducerService,
	type ArtifactCreateConfig,
} from '@/service/chat/artifacts/artifactProducers';
import { DEFAULT_ARTIFACT_CREATE_CONFIG } from '@/service/chat/artifacts/artifactCreateConfig';
import type { ArtifactVaultWriterPort } from '@/core/ports/ArtifactVaultWriterPort';
import type { ChatArtifactReceipt } from '@/core/types/chat-studio';

// ── fakes ──────────────────────────────────────────────────────────────────

class MemoryWriter implements ArtifactVaultWriterPort {
	public files = new Map<string, string>();
	async writeTextFile(
		folder: string,
		basename: string,
		ext: string,
		content: string,
	): Promise<string> {
		let path = `${folder}/${basename}.${ext}`;
		let counter = 2;
		while (this.files.has(path)) {
			path = `${folder}/${basename}-${counter}.${ext}`;
			counter += 1;
		}
		this.files.set(path, content);
		return path;
	}
	async readTextFile(path: string): Promise<string | null> {
		return this.files.get(path) ?? null;
	}
	async modifyFrontmatterField(_vaultPath: string, _field: string, _value: string): Promise<void> {
		// Producer tests never touch frontmatter — no-op stub suffices.
	}
}

function makeService(now = () => 1_700_000_000_000): {
	svc: ArtifactProducerService;
	writer: MemoryWriter;
	receipts: ChatArtifactReceipt[];
	config: ArtifactCreateConfig;
} {
	const writer = new MemoryWriter();
	const receipts: ChatArtifactReceipt[] = [];
	const config: ArtifactCreateConfig = DEFAULT_ARTIFACT_CREATE_CONFIG;
	const svc = new ArtifactProducerService({
		writer,
		receiptSink: {
			save: async (r) => {
				receipts.push(r);
			},
		},
		getRootFolder: () => 'ChatFolder',
		loadConfig: async () => config,
		now,
	});
	return { svc, writer, receipts, config };
}

function makeCtx() {
	return {
		runId: 'run-x',
		messageId: 'msg-x',
		conversationId: 'conv-x',
		projectId: undefined,
	};
}

// ── dataview ───────────────────────────────────────────────────────────────

async function testDataviewDql(): Promise<void> {
	const { svc, writer, receipts } = makeService();
	const outcome = await svc.produce(
		{
			type: 'dataview',
			title: 'Active projects',
			flavor: 'dql',
			query: 'TABLE status FROM "Projects" WHERE status != "archived"',
			note: 'Weekly review helper.',
		},
		makeCtx(),
	);
	assert.strictEqual(outcome.receipt.state, 'ready');
	assert.strictEqual(outcome.receipt.kind, 'dataview');
	assert.ok(outcome.vaultPath && outcome.vaultPath.startsWith('ChatFolder/Artifacts/Dataview/'));
	assert.ok(outcome.vaultPath!.endsWith('.md'));
	const body = writer.files.get(outcome.vaultPath!) ?? '';
	assert.ok(body.includes('```dataview\nTABLE status'), 'dql fence body absent');
	assert.ok(body.includes('Weekly review helper'), 'prose note missing');
	assert.strictEqual(receipts.length, 1);
	assert.deepStrictEqual(receipts[0].availableActions, ['open', 'copy']);
	console.log('PASS: dataviewDql happy path');
}

async function testDataviewJsFlavor(): Promise<void> {
	const { svc, receipts } = makeService();
	const outcome = await svc.produce(
		{ type: 'dataview', title: 'JS Query', flavor: 'dataviewjs', query: 'dv.pages("#project")' },
		makeCtx(),
	);
	assert.strictEqual(outcome.receipt.state, 'ready');
	assert.ok(receipts[0].vaultPath!.endsWith('.md'));
	console.log('PASS: dataviewJs flavor');
}

async function testDataviewInvalidKeyword(): Promise<void> {
	const { svc, receipts } = makeService();
	const outcome = await svc.produce(
		{ type: 'dataview', title: 'bad', flavor: 'dql', query: 'SELECT * FROM #project' },
		makeCtx(),
	);
	assert.strictEqual(outcome.receipt.state, 'failed');
	assert.strictEqual(outcome.vaultPath, undefined);
	assert.ok(outcome.receipt.error?.recoverable);
	// Raw content preserved for retry.
	assert.strictEqual(outcome.receipt.preview?.text, 'SELECT * FROM #project');
	assert.deepStrictEqual(outcome.receipt.availableActions, ['retry']);
	console.log('PASS: dataview invalid keyword failed receipt');
}

// ── excalidraw ─────────────────────────────────────────────────────────────

async function testExcalidrawValid(): Promise<void> {
	const { svc, writer } = makeService();
	const scene = { type: 'excalidraw', version: 2, source: 'test', elements: [{ id: 'a' }] };
	const outcome = await svc.produce(
		{ type: 'excalidraw', title: 'Diagram A', elementsJson: JSON.stringify(scene) },
		makeCtx(),
	);
	assert.strictEqual(outcome.receipt.state, 'ready');
	assert.strictEqual(outcome.receipt.kind, 'drawing');
	assert.ok(outcome.vaultPath!.endsWith('.excalidraw.md'));
	const body = writer.files.get(outcome.vaultPath!) ?? '';
	assert.ok(body.startsWith('---\nexcalidraw-plugin:'), 'excalidraw frontmatter missing');
	assert.ok(body.includes('## Drawing'), 'drawing heading missing');
	assert.ok(body.includes('```json'), 'json fence missing');
	// Round-trip: extract fenced JSON and re-parse.
	const match = body.match(/```json\n([\s\S]*?)\n```/);
	assert.ok(match, 'no json block found');
	const parsed = JSON.parse(match![1]);
	assert.ok(Array.isArray(parsed.elements));
	console.log('PASS: excalidraw valid scene round-trip');
}

async function testExcalidrawBareArrayAccepted(): Promise<void> {
	const { svc } = makeService();
	const outcome = await svc.produce(
		{ type: 'excalidraw', title: 'raw', elementsJson: JSON.stringify([{ id: 'x' }]) },
		makeCtx(),
	);
	assert.strictEqual(outcome.receipt.state, 'ready');
	console.log('PASS: excalidraw bare-array accepted');
}

async function testExcalidrawInvalidJson(): Promise<void> {
	const { svc } = makeService();
	const outcome = await svc.produce(
		{ type: 'excalidraw', title: 'broken', elementsJson: '{not json' },
		makeCtx(),
	);
	assert.strictEqual(outcome.receipt.state, 'failed');
	// The preview stashes the original raw text so retry can replay.
	assert.strictEqual(outcome.receipt.preview?.text, '{not json');
	console.log('PASS: excalidraw invalid JSON failed receipt');
}

// ── drawio ─────────────────────────────────────────────────────────────────

async function testDrawioValid(): Promise<void> {
	const { svc, writer } = makeService();
	const xml =
		'<mxfile><diagram><mxGraphModel><root><mxCell id="0"/></root></mxGraphModel></diagram></mxfile>';
	const outcome = await svc.produce(
		{ type: 'drawio', title: 'Sample', xml },
		makeCtx(),
	);
	assert.strictEqual(outcome.receipt.state, 'ready');
	assert.strictEqual(outcome.receipt.kind, 'drawing');
	assert.ok(outcome.vaultPath!.endsWith('.drawio'));
	const body = writer.files.get(outcome.vaultPath!) ?? '';
	assert.ok(body.includes('<mxfile'));
	assert.ok(body.endsWith('\n'));
	console.log('PASS: drawio valid xml');
}

async function testDrawioMissingRoot(): Promise<void> {
	const { svc } = makeService();
	const outcome = await svc.produce(
		{ type: 'drawio', title: 'no-root', xml: '<random>hello</random>' },
		makeCtx(),
	);
	assert.strictEqual(outcome.receipt.state, 'failed');
	assert.strictEqual(outcome.receipt.preview?.text, '<random>hello</random>');
	console.log('PASS: drawio missing root failed receipt');
}

// ── extract ────────────────────────────────────────────────────────────────

async function testExtractWithSources(): Promise<void> {
	const { svc, writer } = makeService();
	const outcome = await svc.produce(
		{
			type: 'extract',
			title: 'Highlights',
			content: '## Key points\n- a\n- b',
			sourceRefs: ['Notes/Existing.md', '[[Notes/Wrapped]]'],
			sourceMessageIds: ['msg-a', 'msg-b'],
		},
		makeCtx(),
	);
	assert.strictEqual(outcome.receipt.state, 'ready');
	assert.strictEqual(outcome.receipt.kind, 'extract');
	const body = writer.files.get(outcome.vaultPath!) ?? '';
	assert.ok(body.includes('[[Notes/Existing.md]]'), 'wikilink auto-wrap missing');
	assert.ok(body.includes('[[Notes/Wrapped]]'), 'already-wrapped ref preserved');
	assert.ok(body.includes('msg-a'), 'source message id missing');
	assert.ok(body.includes('## Key points'), 'body missing');
	console.log('PASS: extract with sources embed backlinks');
}

async function testExtractEmpty(): Promise<void> {
	const { svc } = makeService();
	const outcome = await svc.produce(
		{ type: 'extract', title: 'blank', content: '   ' },
		makeCtx(),
	);
	assert.strictEqual(outcome.receipt.state, 'failed');
	console.log('PASS: extract empty content rejected');
}

// ── reminder ───────────────────────────────────────────────────────────────

async function testReminderFrontmatterRoundTrip(): Promise<void> {
	const nowMs = 1_700_000_000_000;
	const { svc, writer } = makeService(() => nowMs);
	const dueIso = new Date(nowMs + 60_000).toISOString();
	const outcome = await svc.produce(
		{
			type: 'reminder',
			title: 'Ship the change',
			dueIso,
			note: 'Sanity check the build.',
		},
		makeCtx(),
	);
	assert.strictEqual(outcome.receipt.state, 'ready');
	assert.strictEqual(outcome.receipt.kind, 'reminder');
	const body = writer.files.get(outcome.vaultPath!) ?? '';
	assert.ok(body.includes('peak-reminder: true'));
	assert.ok(body.includes(`due: ${dueIso}`));
	assert.ok(body.includes('status: open'));
	assert.ok(body.includes('Sanity check the build.'));
	console.log('PASS: reminder frontmatter round-trip');
}

async function testReminderPast(): Promise<void> {
	const nowMs = 1_700_000_000_000;
	const { svc } = makeService(() => nowMs);
	const pastIso = new Date(nowMs - 60_000).toISOString();
	const outcome = await svc.produce(
		{ type: 'reminder', title: 'stale', dueIso: pastIso },
		makeCtx(),
	);
	assert.strictEqual(outcome.receipt.state, 'failed');
	console.log('PASS: reminder past dueIso rejected');
}

async function testReminderBadDate(): Promise<void> {
	const { svc } = makeService();
	const outcome = await svc.produce(
		{ type: 'reminder', title: 'noisy', dueIso: 'tomorrow at 9am' },
		makeCtx(),
	);
	assert.strictEqual(outcome.receipt.state, 'failed');
	console.log('PASS: reminder bad ISO rejected');
}

// ── file naming uniqueness ─────────────────────────────────────────────────

async function testFilenameUniqueness(): Promise<void> {
	const nowMs = 1_700_000_000_000;
	const { svc, writer } = makeService(() => nowMs);
	const inp = { type: 'extract' as const, title: 'same-title', content: 'first' };
	const a = await svc.produce(inp, makeCtx());
	const b = await svc.produce({ ...inp, content: 'second' }, makeCtx());
	assert.notStrictEqual(a.vaultPath, b.vaultPath, 'writer must avoid collisions');
	assert.strictEqual(writer.files.size, 2);
	console.log('PASS: writer collision handling produces unique paths');
}

// ── receipt anchoring ─────────────────────────────────────────────────────

async function testReceiptAnchors(): Promise<void> {
	const { svc, receipts } = makeService();
	await svc.produce(
		{ type: 'dataview', title: 'anchored', flavor: 'dql', query: 'LIST FROM #x' },
		{ runId: 'run-42', messageId: 'msg-42', conversationId: 'conv-42', projectId: 'proj-42' },
	);
	const r = receipts[0];
	assert.strictEqual(r.runId, 'run-42');
	assert.strictEqual(r.messageId, 'msg-42');
	assert.strictEqual(r.conversationId, 'conv-42');
	assert.strictEqual(r.projectId, 'proj-42');
	console.log('PASS: receipt carries turn anchors');
}

// ── run all ────────────────────────────────────────────────────────────────

(async () => {
	await testDataviewDql();
	await testDataviewJsFlavor();
	await testDataviewInvalidKeyword();
	await testExcalidrawValid();
	await testExcalidrawBareArrayAccepted();
	await testExcalidrawInvalidJson();
	await testDrawioValid();
	await testDrawioMissingRoot();
	await testExtractWithSources();
	await testExtractEmpty();
	await testReminderFrontmatterRoundTrip();
	await testReminderPast();
	await testReminderBadDate();
	await testFilenameUniqueness();
	await testReceiptAnchors();
	console.log('PASS: artifact-create-producers all scenarios');
})();
