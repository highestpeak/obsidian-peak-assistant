// Attachment understanding badge (gap 3). Pure resolveUnderstandingBadge()
// test — covers every understandingSource value + provider/model slot
// filling + reason override.

import assert from 'assert';
import { resolveUnderstandingBadge } from '@/ui/view/chat-view/components/messages/attachmentUnderstandingBadge';

const labels = {
	understandingBadgeNativeVideo: 'Understood natively',
	understandingBadgeTranscribedAudio: 'Transcribed ({model})',
	understandingBadgeTranscribedExtractedAudio: 'Video audio transcribed ({model})',
	understandingBadgeAttachmentOnly: 'Not understood — file attached only',
	understandingBadgeAttachmentOnlyReason: 'Not understood — {reason}',
} as any;

function testNativeVideo() {
	const out = resolveUnderstandingBadge(
		{ understandingSource: 'native-video-input', understandingModel: 'gemini-1.5-pro' },
		labels,
	);
	assert.strictEqual(out, 'Understood natively');
	console.log('PASS: understanding-badge native video');
}

function testTranscribed() {
	const out = resolveUnderstandingBadge(
		{ understandingSource: 'transcript-from-audio', understandingModel: 'whisper-1' },
		labels,
	);
	assert.strictEqual(out, 'Transcribed (whisper-1)');
	console.log('PASS: understanding-badge transcribed');
}

function testExtractedAudio() {
	const out = resolveUnderstandingBadge(
		{ understandingSource: 'transcript-from-extracted-audio', understandingModel: 'whisper-1' },
		labels,
	);
	assert.strictEqual(out, 'Video audio transcribed (whisper-1)');
	console.log('PASS: understanding-badge extracted audio');
}

function testAttachmentOnly() {
	const out = resolveUnderstandingBadge(
		{ understandingSource: 'attachment-only' },
		labels,
	);
	assert.strictEqual(out, 'Not understood — file attached only');
	console.log('PASS: understanding-badge attachment-only');
}

function testAttachmentOnlyWithReason() {
	const out = resolveUnderstandingBadge(
		{ understandingSource: 'attachment-only', understandingReason: 'transcription 401' },
		labels,
	);
	assert.strictEqual(out, 'Not understood — transcription 401');
	console.log('PASS: understanding-badge attachment-only with reason');
}

function testNoneReturnsNull() {
	assert.strictEqual(resolveUnderstandingBadge({ understandingSource: 'none' }, labels), null);
	assert.strictEqual(resolveUnderstandingBadge({}, labels), null);
	console.log('PASS: understanding-badge none/absent returns null');
}

testNativeVideo();
testTranscribed();
testExtractedAudio();
testAttachmentOnly();
testAttachmentOnlyWithReason();
testNoneReturnsNull();
