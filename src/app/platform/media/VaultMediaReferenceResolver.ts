// VaultMediaReferenceResolver — app-layer implementation of the
// MediaReferenceResolver port. Reads bytes from the Vault (or resolves a
// receipt's vaultPath first), validates MIME + size against the limits the
// caller passes (sourced from templates/config/media-generation.json →
// referenceLimits), and produces data URIs / filenames for adapters.

import type { App } from 'obsidian';
import { normalizePath } from 'obsidian';
import type { MediaReferenceInput } from '@/core/types/media-generation';
import {
	bytesToDataUri,
	MediaReferenceResolutionError,
	type MediaReferenceLimits,
	type MediaReferenceResolver,
	type ResolvedMediaReference,
} from '@/core/ports/MediaReferenceResolver';

export interface VaultMediaReferenceResolverDeps {
	app: App;
	/** artifactId → vaultPath (null when the receipt has no saved file). */
	getReceiptVaultPath: (artifactId: string) => Promise<string | null>;
	/** extension (lowercase, no dot) → MIME. From config referenceLimits.mimeByExtension. */
	getMimeByExtension: () => Promise<Record<string, string>>;
}

export class VaultMediaReferenceResolver implements MediaReferenceResolver {
	constructor(private readonly deps: VaultMediaReferenceResolverDeps) {}

	async resolve(
		inputs: MediaReferenceInput[],
		limits: MediaReferenceLimits,
	): Promise<ResolvedMediaReference[]> {
		if (inputs.length > limits.maxCount) {
			throw new MediaReferenceResolutionError(
				'ref-too-many',
				`Too many reference images: ${inputs.length} > ${limits.maxCount}`,
			);
		}
		const mimeByExtension = await this.deps.getMimeByExtension();
		const resolved: ResolvedMediaReference[] = [];
		for (const input of inputs) {
			resolved.push(await this.resolveOne(input, limits, mimeByExtension));
		}
		return resolved;
	}

	private async resolveOne(
		input: MediaReferenceInput,
		limits: MediaReferenceLimits,
		mimeByExtension: Record<string, string>,
	): Promise<ResolvedMediaReference> {
		const vaultPath = await this.resolveVaultPath(input);
		if (!vaultPath) {
			throw new MediaReferenceResolutionError(
				'ref-not-found',
				`Reference ${input.ref} does not resolve to a vault file`,
				input.ref,
			);
		}
		const extension = (vaultPath.split('.').pop() ?? '').toLowerCase();
		const mimeType = input.mimeType ?? mimeByExtension[extension];
		if (!mimeType || !limits.allowedMimeTypes.includes(mimeType)) {
			throw new MediaReferenceResolutionError(
				'ref-unsupported-mime',
				`Reference ${input.ref} has unsupported type "${mimeType ?? extension}" — allowed: ${limits.allowedMimeTypes.join(', ')}`,
				input.ref,
			);
		}
		let bytes: Uint8Array;
		try {
			const buffer = await this.deps.app.vault.adapter.readBinary(normalizePath(vaultPath));
			bytes = new Uint8Array(buffer);
		} catch (err) {
			throw new MediaReferenceResolutionError(
				'ref-unreadable',
				`Reference ${input.ref} could not be read: ${(err as Error).message}`,
				input.ref,
			);
		}
		if (bytes.byteLength > limits.maxBytesPerImage) {
			throw new MediaReferenceResolutionError(
				'ref-too-large',
				`Reference ${input.ref} is ${bytes.byteLength} bytes (max ${limits.maxBytesPerImage})`,
				input.ref,
			);
		}
		return {
			ref: input.ref,
			mimeType,
			bytes,
			dataUri: bytesToDataUri(bytes, mimeType),
			filename: vaultPath.split('/').pop() ?? `reference.${extension || 'png'}`,
		};
	}

	private async resolveVaultPath(input: MediaReferenceInput): Promise<string | null> {
		if (input.sourceType === 'vault') return input.ref;
		return this.deps.getReceiptVaultPath(input.ref);
	}
}
