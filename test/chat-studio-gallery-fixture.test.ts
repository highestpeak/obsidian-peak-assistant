import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { MessageStatus, type ChatMessage } from '@/core/types/chat';
import { buildMessageMetaJson } from '@/core/storage/sqlite/repositories/ChatMessageRepo';
import {
	createChatStudioGalleryFixture,
} from '@/ui/view/chat-view/dev/chatStudioGalleryFixture';
import {
	buildOutlineItems,
	buildResourceRows,
	flattenOutline,
} from '@/ui/view/chat-view/components/conversation-index/outlineModel';

function testCoversRichMessageSurfaces(): void {
	const fixture = createChatStudioGalleryFixture('gallery-conversation', 1_800_000_000_000);
	const content = fixture.messages.map((message) => message.content).join('\n');

	assert(content.includes('| Component | State |'), 'table fixture missing');
	assert(content.includes('```typescript'), 'TypeScript code fixture missing');
	assert(content.includes('```json'), 'JSON code fixture missing');
	assert(content.includes('```bash'), 'shell code fixture missing');
	assert(content.includes('```mermaid'), 'Mermaid fixture missing');
	assert(content.includes('$$'), 'math fixture missing');
	assert(content.includes('\\sum_{i=1}^{n}'), 'math backslash must survive the TypeScript fixture');
	assert(content.includes('|组件画廊测试文档]]'), 'wikilink fixture missing');
	assert(
		fixture.messages.some((message) => message.resources?.some((resource) => resource.previewUri?.startsWith('data:image/svg+xml'))),
		'input image preview fixture missing',
	);
	assert(fixture.messages.some((message) => message.reasoning?.content), 'reasoning fixture missing');
	assert(fixture.messages.some((message) => (message.toolCalls?.length ?? 0) >= 3), 'agent-run fixture missing');
	assert(fixture.messages.some((message) => message.status === MessageStatus.ERROR), 'error fixture missing');
	assert(fixture.messages.some((message) => message.status === MessageStatus.CANCELLED), 'cancelled fixture missing');
}

function testCoversArtifactKindsAndStates(): void {
	const fixture = createChatStudioGalleryFixture('gallery-conversation', 1_800_000_000_000);
	const kinds = new Set(fixture.artifactReceipts.map((receipt) => receipt.kind));
	for (const kind of ['image', 'video', 'audio', 'table', 'code', 'diagram', 'base', 'document']) {
		assert(kinds.has(kind as never), `artifact kind missing: ${kind}`);
	}
	const states = new Set(fixture.artifactReceipts.map((receipt) => receipt.state));
	for (const state of ['ready', 'saved', 'generating', 'needs-permission', 'failed']) {
		assert(states.has(state as never), `artifact state missing: ${state}`);
	}
	assert(fixture.artifactReceipts.some((receipt) => receipt.preview?.kind === 'image'), 'image preview missing');
	assert(fixture.artifactReceipts.some((receipt) => receipt.preview?.kind === 'code'), 'code preview missing');
	const countKind = (kind: string) => fixture.artifactReceipts.filter((receipt) => receipt.kind === kind).length;
	assert(countKind('image') >= 4, 'multi-image batch fixture missing');
	assert(countKind('video') >= 3, 'multi-video batch fixture missing');
	assert(countKind('audio') >= 3, 'multi-audio batch fixture missing');
	assert(countKind('table') >= 3, 'multi-CSV batch fixture missing');
	assert(countKind('code') >= 2, 'multi-code batch fixture missing');
	assert(countKind('document') >= 3, 'multi-document batch fixture missing');
	assert(
		fixture.artifactReceipts.filter((receipt) => receipt.kind === 'video' && receipt.uri?.startsWith('data:video/mp4')).length >= 2,
		'playable multi-video previews missing',
	);
	assert(fixture.turnReceipts.some((receipt) => (receipt.actualSources.vaultDocuments?.length ?? 0) > 0));
	assert(fixture.turnReceipts.some((receipt) => (receipt.actualSources.webSources?.length ?? 0) > 0));
}

function testOutlineIsNewestFirstAndTopicsStayContiguous(): void {
	const fixture = createChatStudioGalleryFixture('gallery-conversation', 1_800_000_000_000);
	const groups = buildOutlineItems(fixture.messages, fixture.artifactReceipts);
	const flattened = flattenOutline(groups);
	const messageRows = flattened.filter((item) => item.id.startsWith('msg:'));

	for (let index = 1; index < messageRows.length; index += 1) {
		assert(
			(messageRows[index - 1].createdAt ?? 0) >= (messageRows[index].createdAt ?? 0),
			'outline messages must stay newest-first',
		);
	}
	assert.deepStrictEqual(
		groups.map((group) => group.topic),
		['Rich content', 'Message states', 'Media and artifacts', 'Agent execution', 'Rich content'],
		'repeated topics must form separate contiguous runs',
	);
}

function testResourcesIncludeInputAndGeneratedMedia(): void {
	const fixture = createChatStudioGalleryFixture('gallery-conversation', 1_800_000_000_000);
	const rows = buildResourceRows(fixture.messages, fixture.artifactReceipts, fixture.turnReceipts);
	assert(rows.some((row) => row.kind === 'audio' && row.direction === 'input'), 'input audio missing');
	assert(rows.some((row) => row.kind === 'video' && row.direction === 'input'), 'input video missing');
	assert(rows.some((row) => row.kind === 'audio' && row.direction === 'generated'), 'generated audio missing');
	assert(rows.some((row) => row.kind === 'video' && row.direction === 'generated'), 'generated video missing');
	assert(rows.some((row) => row.kind === 'process'), 'agent process row missing');
	for (let index = 1; index < rows.length; index += 1) {
		assert(rows[index - 1].createdAt >= rows[index].createdAt, 'resource rows must stay newest-first');
	}
}

function testToolCallsAndTopicsSurvivePersistenceContract(): void {
	const toolMessage: ChatMessage = {
		id: 'tool-message',
		role: 'assistant',
		content: 'done',
		createdAtTimestamp: 1,
		createdAtZone: 'UTC',
		starred: false,
		model: 'model',
		provider: 'provider',
		toolCalls: [{ toolName: 'vault_search', input: { query: 'x' }, output: { results: [] } }],
	};
	const json = buildMessageMetaJson(toolMessage);
	assert(json, 'tool-call message should emit meta_json');
	assert.deepStrictEqual((JSON.parse(json!) as { toolCalls: unknown[] }).toolCalls, toolMessage.toolCalls);

	const repoSource = fs.readFileSync(
		path.resolve(process.cwd(), 'src/core/storage/sqlite/repositories/ChatMessageRepo.ts'),
		'utf8',
	);
	const storeSource = fs.readFileSync(
		path.resolve(process.cwd(), 'src/core/storage/vault/ChatStore.ts'),
		'utf8',
	);
	assert(repoSource.includes("topic: msg.topic?.trim() || null"), 'message topic must be written to sqlite');
	assert(storeSource.includes('Array.isArray(extras.toolCalls)'), 'tool calls must be restored from meta_json');
}

function run(): void {
	testCoversRichMessageSurfaces();
	testCoversArtifactKindsAndStates();
	testOutlineIsNewestFirstAndTopicsStayContiguous();
	testResourcesIncludeInputAndGeneratedMedia();
	testToolCallsAndTopicsSurvivePersistenceContract();
	console.log('chat-studio-gallery-fixture: all guards passed');
}

run();
