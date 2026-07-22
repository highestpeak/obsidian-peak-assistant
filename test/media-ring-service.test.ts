// MediaRingService orchestrates port + writer; verifies the produce flow
// composes bytes into a written attachment with sanitized basename.

import assert from 'assert';
import { MediaRingService } from '@/service/media/MediaRingService';
import type { MediaGenerationPort, MediaGenerationRequest } from '@/core/ports/MediaGenerationPort';

async function main() {
	await testProduceWritesAttachmentWithSanitizedBasename();
	await testIsConfiguredReflectsPort();
	await testProduceThrowsWhenPortNotConfigured();
	console.log('media-ring-service: ok');
}

function makePort(configured: boolean): MediaGenerationPort {
	return {
		providerId: 'test',
		isConfigured: () => configured,
		supportedKinds: () => ['tts', 'image', 'video', 'music'],
		async generate(req: MediaGenerationRequest) {
			if (!configured) throw new Error('not configured');
			return {
				kind: req.kind,
				bytes: new Uint8Array([1, 2, 3, 4]),
				extension: req.kind === 'tts' ? 'mp3' : 'png',
				mimeType: req.kind === 'tts' ? 'audio/mpeg' : 'image/png',
				modelId: 'test/model',
				latencyMs: 12,
			};
		},
	};
}

async function testProduceWritesAttachmentWithSanitizedBasename() {
	const written: Array<{ path: string; basename: string; extension: string; bytesLen: number }> = [];
	const service = new MediaRingService({
		port: makePort(true),
		writer: {
			async writeAttachment(input) {
				const path = `${input.attachmentFolder}/${input.basename}.${input.extension}`;
				written.push({
					path,
					basename: input.basename,
					extension: input.extension,
					bytesLen: input.bytes.length,
				});
				return { path };
			},
		},
		attachmentFolder: '_attachments/media',
	});
	const result = await service.produce({
		kind: 'tts',
		prompt: 'hello',
		sourceHint: 'tts::note with * special / chars?',
	});
	assert.strictEqual(written.length, 1);
	assert.strictEqual(written[0].extension, 'mp3');
	assert.strictEqual(written[0].bytesLen, 4);
	assert.ok(written[0].basename.startsWith('tts'), 'basename should sanitize but keep sourceHint prefix');
	assert.ok(!/[*/?]/.test(written[0].basename), 'basename must not carry invalid chars');
	assert.strictEqual(result.mimeType, 'audio/mpeg');
	console.log('  ✓ produce writes sanitized attachment');
}

async function testIsConfiguredReflectsPort() {
	const s1 = new MediaRingService({
		port: makePort(false),
		writer: { async writeAttachment() { return { path: 'x' }; } },
		attachmentFolder: 'm',
	});
	assert.strictEqual(s1.isConfigured(), false);
	const s2 = new MediaRingService({
		port: makePort(true),
		writer: { async writeAttachment() { return { path: 'x' }; } },
		attachmentFolder: 'm',
	});
	assert.strictEqual(s2.isConfigured(), true);
	console.log('  ✓ isConfigured delegates to port');
}

async function testProduceThrowsWhenPortNotConfigured() {
	const s = new MediaRingService({
		port: makePort(false),
		writer: { async writeAttachment() { return { path: 'x' }; } },
		attachmentFolder: 'm',
	});
	await assert.rejects(() => s.produce({ kind: 'image', prompt: 'x' }), /not configured/);
	console.log('  ✓ produce throws when port not configured');
}

main().catch((err) => { console.error(err); process.exit(1); });
