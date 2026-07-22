// MediaReferenceResolver — app-layer port that turns stable reference
// identifiers (vault paths / receipt ids) into provider-consumable bytes.
//
// Contract (zero-gap plan §4 A1):
//   - Only image MIME types are accepted; anything else raises a typed
//     MediaReferenceResolutionError so preflight/tool surfaces an honest
//     failure instead of sending garbage to a paid endpoint.
//   - Limits (count / bytes / allowed MIME) come from
//     `templates/config/media-generation.json → referenceLimits`; the
//     resolver never hardcodes them.
//   - Resolution happens AT EXECUTION TIME (produce / submit / confirm),
//     never at persist time — jobs and receipts store only the stable
//     `MediaReferenceInput` so a reboot re-resolves from the Vault.

import type { MediaReferenceInput } from '@/core/types/media-generation';

/** A reference with bytes materialised, ready for an adapter to consume. */
export interface ResolvedMediaReference {
	/** The stable identifier this was resolved from (input.ref). */
	ref: string;
	mimeType: string;
	bytes: Uint8Array;
	/** `data:<mime>;base64,<payload>` — providers that accept inline uploads (fal) use this. */
	dataUri: string;
	/** Suggested filename for multipart parts (OpenAI edits / Sora input_reference). */
	filename: string;
}

/** Limits enforced during resolution. Sourced from config, never hardcoded. */
export interface MediaReferenceLimits {
	maxCount: number;
	maxBytesPerImage: number;
	allowedMimeTypes: string[];
}

export type MediaReferenceResolutionCode =
	| 'ref-not-found'
	| 'ref-unsupported-mime'
	| 'ref-too-large'
	| 'ref-too-many'
	| 'ref-unreadable';

export class MediaReferenceResolutionError extends Error {
	constructor(
		public readonly code: MediaReferenceResolutionCode,
		message: string,
		public readonly ref?: string,
	) {
		super(message);
		this.name = 'MediaReferenceResolutionError';
	}
}

export interface MediaReferenceResolver {
	/**
	 * Resolve every input or throw `MediaReferenceResolutionError` on the
	 * first violation. Order of the returned array matches the input order
	 * (the first entry is the base image for edits).
	 */
	resolve(
		inputs: MediaReferenceInput[],
		limits: MediaReferenceLimits,
	): Promise<ResolvedMediaReference[]>;
}

/** Shared helper: bytes → base64 data URI (chunked to avoid arg limits). */
export function bytesToDataUri(bytes: Uint8Array, mimeType: string): string {
	let binary = '';
	const CHUNK = 0x8000;
	for (let i = 0; i < bytes.length; i += CHUNK) {
		binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
	}
	// btoa exists in the Obsidian renderer and Node ≥ 16 test runtime.
	return `data:${mimeType};base64,${btoa(binary)}`;
}
