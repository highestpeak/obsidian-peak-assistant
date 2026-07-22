// Composer send-time gate for audio/video attachments (zero-gap C1).

import assert from 'assert';
import {
	evaluateAttachmentUnderstanding,
	classifyFileMediaKind,
} from '@/ui/view/chat-view/hooks/understandingGate';
import { MediaUnderstandingRuntime } from '@/service/media/MediaUnderstandingRuntime';

function testClassify() {
	assert.strictEqual(classifyFileMediaKind({ name: 'clip.mp3', type: 'audio/mpeg' }), 'audio');
	assert.strictEqual(classifyFileMediaKind({ name: 'clip.mov', type: '' }), 'video');
	assert.strictEqual(classifyFileMediaKind({ name: 'doc.pdf', type: 'application/pdf' }), 'other');
	console.log('PASS: T1 classify by mime and extension');
}

function testGateWarnsOnDegrade() {
	const runtime = new MediaUnderstandingRuntime({ transcription: null, audioExtractor: null });
	const verdict = evaluateAttachmentUnderstanding({
		files: [{ name: 'song.mp3', type: 'audio/mpeg' }],
		runtime,
		modelCapabilities: { vision: false, pdfInput: false, tools: false, webSearch: false },
	});
	assert.strictEqual(verdict.kind, 'warn');
	if (verdict.kind === 'warn') {
		assert.strictEqual(verdict.degraded.length, 1);
		assert.strictEqual(verdict.degraded[0].file, 'song.mp3');
		assert.ok(verdict.message.includes('song.mp3'), 'confirm message lists file');
	}
	console.log('PASS: T2 gate warns when no runtime available');
}

function testGateOkWhenNativeVideo() {
	const runtime = new MediaUnderstandingRuntime({ transcription: null, audioExtractor: null });
	const verdict = evaluateAttachmentUnderstanding({
		files: [{ name: 'clip.mp4', type: 'video/mp4' }],
		runtime,
		modelCapabilities: { vision: true, pdfInput: false, tools: false, webSearch: false, videoInput: true },
	});
	assert.strictEqual(verdict.kind, 'ok');
	console.log('PASS: T3 gate ok when model accepts video natively');
}

function testGateOkWhenTranscriptionConfigured() {
	const runtime = new MediaUnderstandingRuntime({
		transcription: { isConfigured: () => true, transcribeAudio: async () => ({ transcript: '', provider: 'x', modelId: 'y' }) },
		audioExtractor: null,
	});
	const verdict = evaluateAttachmentUnderstanding({
		files: [{ name: 'song.mp3', type: 'audio/mpeg' }],
		runtime,
		modelCapabilities: { vision: false, pdfInput: false, tools: false, webSearch: false },
	});
	assert.strictEqual(verdict.kind, 'ok');
	console.log('PASS: T4 gate ok when transcription configured');
}

testClassify();
testGateWarnsOnDegrade();
testGateOkWhenNativeVideo();
testGateOkWhenTranscriptionConfigured();
console.log('All understanding-gate tests passed');
