// Edit-image Composer form pure logic (gap 1).
// Covers option builder + request builder + failed-receipt builder.

import assert from 'assert';
import {
	buildEditImageOptions,
	buildEditRequest,
	buildEditFailedReceipt,
	EDIT_PRESET_IDS,
} from '@/ui/view/chat-view/components/composer/composerEditImageLogic';
import type { ChatArtifactReceipt } from '@/core/types/chat-studio';
import type { ChatMessage } from '@/service/chat/types';

function makeSavedImageReceipt(overrides: Partial<ChatArtifactReceipt> = {}): ChatArtifactReceipt {
	return {
		artifactId: 'art-1',
		runId: 'run-1',
		messageId: 'm-1',
		conversationId: 'conv-1',
		direction: 'generated',
		kind: 'image',
		title: 'Sunset',
		contentType: 'image/png',
		preview: { kind: 'image', uri: 'ChatFolder/Attachments/sunset.png' },
		vaultPath: 'ChatFolder/Attachments/sunset.png',
		state: 'saved',
		availableActions: ['preview', 'open', 'download'],
		createdAt: 1000,
		...overrides,
	};
}

function makeMessage(resources: any[] = []): ChatMessage {
	return {
		id: `m-${Math.random()}`,
		conversationId: 'conv-1',
		role: 'user',
		content: 'hi',
		timestamp: 1000,
		resources,
	} as ChatMessage;
}

function testOptionsIncludeSavedReceipts() {
	const options = buildEditImageOptions({
		receipts: [makeSavedImageReceipt()],
		messages: [],
	});
	assert.strictEqual(options.length, 1);
	assert.strictEqual(options[0].value, 'receipt:art-1');
	assert.strictEqual(options[0].ref.sourceType, 'receipt');
	assert.strictEqual(options[0].ref.ref, 'art-1');
	console.log('PASS: media-edit-form-logic receipt option');
}

function testOptionsSkipUnsavedOrNonImage() {
	const options = buildEditImageOptions({
		receipts: [
			makeSavedImageReceipt({ artifactId: 'gen', state: 'generating' }),
			makeSavedImageReceipt({ artifactId: 'nop-path', vaultPath: undefined }),
			{ ...makeSavedImageReceipt({ artifactId: 'video-r' }), kind: 'video' as any },
		],
		messages: [],
	});
	assert.strictEqual(options.length, 0, 'unsaved / missing path / non-image should not appear');
	console.log('PASS: media-edit-form-logic filters out ineligible receipts');
}

function testOptionsIncludeVaultImageResources() {
	const options = buildEditImageOptions({
		receipts: [],
		messages: [
			makeMessage([
				{
					id: 'r1',
					kind: 'image',
					source: 'Attachments/hero.jpg',
					displayName: 'hero.jpg',
				},
				{
					id: 'r2',
					kind: 'url',
					source: 'https://example.com/pic.png',
				},
				{
					id: 'r3',
					kind: 'markdown',
					source: 'notes/x.md',
				},
			]),
		],
	});
	assert.strictEqual(options.length, 1);
	assert.strictEqual(options[0].value, 'vault:Attachments/hero.jpg');
	assert.strictEqual(options[0].ref.sourceType, 'vault');
	console.log('PASS: media-edit-form-logic includes vault image resources');
}

function testOptionsDedupeReceiptAndResource() {
	// A receipt's own resource ref should not appear as a second row if it
	// shares the same vault path. The receipt row wins (registered first).
	const receipt = makeSavedImageReceipt();
	const options = buildEditImageOptions({
		receipts: [receipt],
		messages: [
			makeMessage([
				{
					id: 'r1',
					kind: 'image',
					// Match receipt.vaultPath so key `vault:...` is distinct from
					// `receipt:art-1` — both present is correct. We test the
					// case of the SAME REF appearing twice as a resource.
					source: 'Attachments/other.jpg',
					displayName: 'other',
				},
			]),
			makeMessage([
				{
					id: 'r-dup',
					kind: 'image',
					source: 'Attachments/other.jpg',
					displayName: 'other',
				},
			]),
		],
	});
	assert.strictEqual(options.length, 2, 'receipt + one dedup vault ref');
	console.log('PASS: media-edit-form-logic dedupes duplicate resources');
}

function testBuildEditRequestShape() {
	const base = { sourceType: 'receipt' as const, ref: 'art-1' };
	const req = buildEditRequest({
		prompt: 'make it snow',
		presetId: EDIT_PRESET_IDS.default,
		base,
	});
	assert.strictEqual(req.kind, 'image');
	assert.strictEqual(req.operation, 'edit');
	assert.strictEqual(req.route, 'auto');
	assert.strictEqual(req.presetId, 'edit-default');
	assert.deepStrictEqual(req.referenceImages, [base]);
	assert.strictEqual(req.maskImage, undefined);
	console.log('PASS: media-edit-form-logic request shape');
}

function testBuildEditRequestWithMask() {
	const base = { sourceType: 'receipt' as const, ref: 'art-base' };
	const mask = { sourceType: 'vault' as const, ref: 'Attachments/mask.png' };
	const req = buildEditRequest({
		prompt: 'replace sky',
		presetId: EDIT_PRESET_IDS.fill,
		base,
		mask,
	});
	assert.strictEqual(req.presetId, 'edit-fill');
	assert.deepStrictEqual(req.maskImage, mask);
	console.log('PASS: media-edit-form-logic mask threads through');
}

function testFailedReceiptBuilder() {
	const req = buildEditRequest({
		prompt: 'make it snow',
		presetId: EDIT_PRESET_IDS.default,
		base: { sourceType: 'receipt', ref: 'art-base' },
	});
	const receipt = buildEditFailedReceipt({
		runId: 'ui-edit-1',
		conversationId: 'conv-1',
		request: req,
		reason: 'preset-missing:edit-default',
		createdAt: 2000,
	});
	assert.strictEqual(receipt.state, 'failed');
	assert.strictEqual(receipt.kind, 'image');
	assert.strictEqual(receipt.runId, 'ui-edit-1');
	assert.deepStrictEqual(receipt.availableActions, ['retry']);
	assert.ok(receipt.error?.message.includes('preset-missing'));
	assert.strictEqual(receipt.direction, 'generated');
	assert.strictEqual(receipt.preview?.kind, 'none');
	console.log('PASS: media-edit-form-logic failed receipt');
}

testOptionsIncludeSavedReceipts();
testOptionsSkipUnsavedOrNonImage();
testOptionsIncludeVaultImageResources();
testOptionsDedupeReceiptAndResource();
testBuildEditRequestShape();
testBuildEditRequestWithMask();
testFailedReceiptBuilder();
