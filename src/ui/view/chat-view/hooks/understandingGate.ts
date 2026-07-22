/**
 * Composer send-time gate for audio/video attachments (zero-gap C1).
 *
 * The current model may not accept audio/video natively AND the transcription
 * adapter may not be configured — in that case sending would send bytes the
 * LLM can not read, which is worse than telling the user upfront. This helper
 * returns a decision the composer surfaces via `window.confirm` (native to
 * Obsidian) so the user can either configure the provider, switch models, or
 * proceed knowing the attachment will be saved without being understood.
 *
 * Pure function so unit tests can call it without wiring React/Obsidian.
 */

import type { MediaUnderstandingRuntime, UnderstandingSource } from '@/service/media/MediaUnderstandingRuntime';
import type { ModelCapabilities } from '@/core/providers/types';

export type UnderstandingGateVerdict =
	| { kind: 'ok'; sources: Array<{ file: string; source: UnderstandingSource }> }
	| {
			kind: 'warn';
			degraded: Array<{ file: string; reason: string }>;
			supported: Array<{ file: string; source: UnderstandingSource }>;
			/** Explicit message the caller shows in confirm(). */
			message: string;
		};

export interface FileLike {
	name: string;
	type: string;
}

export function classifyFileMediaKind(file: FileLike): 'audio' | 'video' | 'other' {
	const mime = (file.type ?? '').toLowerCase();
	if (mime.startsWith('audio/')) return 'audio';
	if (mime.startsWith('video/')) return 'video';
	const name = (file.name ?? '').toLowerCase();
	if (/\.(mp3|wav|m4a|aac|ogg|flac|oga|opus)$/.test(name)) return 'audio';
	if (/\.(mp4|mov|webm|mkv|m4v|avi|ogv)$/.test(name)) return 'video';
	return 'other';
}

export interface EvaluateAttachmentInput {
	files: FileLike[];
	runtime: MediaUnderstandingRuntime | null;
	modelCapabilities: ModelCapabilities | null;
}

export function evaluateAttachmentUnderstanding(input: EvaluateAttachmentInput): UnderstandingGateVerdict {
	const files = input.files ?? [];
	const supported: Array<{ file: string; source: UnderstandingSource }> = [];
	const degraded: Array<{ file: string; reason: string }> = [];

	for (const f of files) {
		const kind = classifyFileMediaKind(f);
		if (kind === 'other') continue;
		if (kind === 'audio' && input.modelCapabilities?.audioInput) {
			supported.push({ file: f.name, source: 'native-video-input' });
			continue;
		}
		if (kind === 'video' && input.modelCapabilities?.videoInput) {
			supported.push({ file: f.name, source: 'native-video-input' });
			continue;
		}
		const runtime = input.runtime;
		if (!runtime) {
			degraded.push({ file: f.name, reason: 'no-transcription-runtime' });
			continue;
		}
		const plan = runtime.planUnderstanding({
			mediaKind: kind,
			modelAcceptsVideoNatively:
				(kind === 'video' && !!input.modelCapabilities?.videoInput)
				|| (kind === 'audio' && !!input.modelCapabilities?.audioInput),
		});
		if (plan.willProduceUnderstanding) {
			supported.push({ file: f.name, source: plan.source });
			continue;
		}
		degraded.push({ file: f.name, reason: plan.reason ?? 'unsupported' });
	}

	if (degraded.length === 0) {
		return { kind: 'ok', sources: supported };
	}
	const lines = degraded.map((d) => `• ${d.file} — ${d.reason}`);
	const message =
		`The current model can't read these attachments and no transcription is available:\n` +
		lines.join('\n') +
		`\n\nSend anyway? The files will be saved to the vault but their contents will NOT be read by the model.`;
	return { kind: 'warn', degraded, supported, message };
}
