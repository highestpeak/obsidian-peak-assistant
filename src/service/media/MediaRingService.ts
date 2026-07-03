// MediaRingService — thin orchestrator that (a) turns a plain text spec into a
// MediaGenerationRequest, (b) delegates to a MediaGenerationPort, and (c) hands
// the raw bytes to a vault-writer callback so attachments land in the right
// folder with a stable naming convention.
//
// See docs/superpowers/plans/2026-07-03-full-backlog-execution-plan.md §D4.

import type {
	MediaGenerationPort,
	MediaGenerationRequest,
	MediaGenerationResult,
	MediaKind,
} from '@/core/ports/MediaGenerationPort';

export interface MediaAttachmentWriter {
	/**
	 * Persist bytes at a vault-relative path under `attachmentFolder`.
	 * Returns the final vault-relative path (adapter may add a collision suffix).
	 * `basename` does NOT include an extension.
	 */
	writeAttachment(input: {
		attachmentFolder: string;
		basename: string;
		extension: string;
		bytes: Uint8Array;
	}): Promise<{ path: string }>;
}

export interface MediaRingRequestSpec {
	kind: MediaKind;
	/** Script (TTS) or prompt (image / video). */
	prompt: string;
	/** Human-friendly basename hint (used to build the attachment filename). */
	sourceHint?: string;
	styleHint?: string;
	negativePrompt?: string;
	aspectRatio?: string;
}

export interface MediaRingProduceResult {
	path: string;
	kind: MediaKind;
	modelId?: string;
	latencyMs?: number;
	mimeType: string;
	extension: string;
	bytesLength: number;
}

export interface MediaRingServiceDeps {
	port: MediaGenerationPort;
	writer: MediaAttachmentWriter;
	attachmentFolder: string;
}

function sanitizeBasename(raw: string): string {
	const trimmed = raw
		.replace(/[^\w一-鿿\- ]+/g, '')
		.trim()
		.replace(/\s+/g, '-');
	return trimmed.length > 0 ? trimmed.slice(0, 60) : 'media';
}

export class MediaRingService {
	constructor(private readonly deps: MediaRingServiceDeps) {}

	isConfigured(): boolean {
		return this.deps.port.isConfigured();
	}

	async produce(spec: MediaRingRequestSpec): Promise<MediaRingProduceResult> {
		const req: MediaGenerationRequest = {
			kind: spec.kind,
			prompt: spec.prompt,
			styleHint: spec.styleHint,
			negativePrompt: spec.negativePrompt,
			aspectRatio: spec.aspectRatio,
		};
		const result: MediaGenerationResult = await this.deps.port.generate(req);
		const basename = sanitizeBasename(
			`${spec.sourceHint ?? spec.kind}-${new Date().toISOString().replace(/[:.]/g, '-')}`,
		);
		const { path } = await this.deps.writer.writeAttachment({
			attachmentFolder: this.deps.attachmentFolder,
			basename,
			extension: result.extension,
			bytes: result.bytes,
		});
		return {
			path,
			kind: result.kind,
			modelId: result.modelId,
			latencyMs: result.latencyMs,
			mimeType: result.mimeType,
			extension: result.extension,
			bytesLength: result.bytes.length,
		};
	}
}
