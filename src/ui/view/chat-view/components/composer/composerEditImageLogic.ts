/**
 * Pure logic for the Edit-image Composer form (zero-gap §4 A1).
 *
 * Extracted from the React component so tests can drive:
 *   • option builder — receipts + message resources → picker rows
 *   • request builder — form state → MediaGenerationRequest
 *   • failed receipt builder — reason → ChatArtifactReceipt (state='failed')
 *
 * No React imports here. All values are frozen data.
 */

import type { ChatArtifactReceipt } from '@/core/types/chat-studio';
import type { ChatMessage, ChatResourceRef } from '@/service/chat/types';
import type {
	MediaGenerationRequest,
	MediaReferenceInput,
} from '@/core/types/media-generation';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';

/** The three edit presets the user can pick. Stable ids so tests can lock them. */
export const EDIT_PRESET_IDS = {
	default: 'edit-default',
	fill: 'edit-fill',
	native: 'native-edit',
} as const;
export type EditPresetId = typeof EDIT_PRESET_IDS[keyof typeof EDIT_PRESET_IDS];

/** One row in the base/mask picker. Sortable/renderable by React. */
export interface EditImageOption {
	/** Stable value used as `<option value>` — encodes source + ref. */
	value: string;
	label: string;
	ref: MediaReferenceInput;
}

const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|bmp|tiff|avif|heic|heif)$/i;

function isImageResource(resource: ChatResourceRef): boolean {
	if (resource.kind === 'image') return true;
	return IMAGE_EXT_RE.test(resource.source);
}

/**
 * Build picker rows from the current conversation. Rules:
 *   • Include image ChatArtifactReceipts that are `saved` AND have a
 *     `vaultPath` — those are addressable by receipt id (the resolver
 *     converts receipt id → bytes via getArtifactReceipt/vaultPath).
 *   • Include image ChatResourceRef from message resources whose source is
 *     a Vault path (best-effort: not a URL and not empty).
 *   • Deduplicate by ref key (`sourceType:ref`) so a receipt and its own
 *     resource ref do not appear twice.
 *   • Preserve insertion order (receipts first — freshest usually — then
 *     message resources in reverse-chronological to match reading order).
 */
export interface BuildOptionsInput {
	receipts: ChatArtifactReceipt[];
	messages: ChatMessage[];
}

export function buildEditImageOptions(input: BuildOptionsInput): EditImageOption[] {
	const out: EditImageOption[] = [];
	const seen = new Set<string>();
	// Receipts first — most explicit.
	for (const receipt of input.receipts) {
		if (receipt.kind !== 'image') continue;
		if (receipt.state !== 'saved') continue;
		if (!receipt.vaultPath) continue;
		const ref: MediaReferenceInput = {
			sourceType: 'receipt',
			ref: receipt.artifactId,
			label: receipt.title,
			mimeType: receipt.contentType,
		};
		const key = `${ref.sourceType}:${ref.ref}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({ value: key, label: receipt.title || receipt.vaultPath, ref });
	}
	// Message resources — reverse chronological so the most recent lands
	// near the receipts.
	for (let i = input.messages.length - 1; i >= 0; i -= 1) {
		const msg = input.messages[i];
		for (const resource of msg.resources ?? []) {
			if (!isImageResource(resource)) continue;
			if (!resource.source || /^https?:/i.test(resource.source)) continue;
			const ref: MediaReferenceInput = {
				sourceType: 'vault',
				ref: resource.source,
				label: resource.displayName ?? resource.source,
			};
			const key = `${ref.sourceType}:${ref.ref}`;
			if (seen.has(key)) continue;
			seen.add(key);
			out.push({ value: key, label: resource.displayName ?? resource.source, ref });
		}
	}
	return out;
}

/**
 * Compose the `MediaGenerationRequest` the service consumes. `operation` is
 * always `'edit'`, kind is `'image'`, route is `'auto'` — the preflight and
 * preset drive the concrete route.
 */
export interface BuildEditRequestInput {
	prompt: string;
	presetId: EditPresetId;
	base: MediaReferenceInput;
	mask?: MediaReferenceInput;
	/** Extra reference images beyond the base (optional). */
	additional?: MediaReferenceInput[];
}

export function buildEditRequest(input: BuildEditRequestInput): MediaGenerationRequest {
	const referenceImages: MediaReferenceInput[] = [input.base, ...(input.additional ?? [])];
	return {
		kind: 'image',
		prompt: input.prompt,
		operation: 'edit',
		route: 'auto',
		presetId: input.presetId,
		referenceImages,
		maskImage: input.mask,
		quantity: 1,
	};
}

/**
 * Build a `failed`-state ChatArtifactReceipt when `service.produce()` throws.
 * The service normally writes receipts on success only; on failure the UI
 * (this form + the receipt card retry action) needs a real record so the
 * user can see the error next to their conversation without spelunking
 * through Notices.
 */
export interface BuildEditFailedReceiptInput {
	runId: string;
	conversationId: string;
	request: MediaGenerationRequest;
	reason: string;
	createdAt: number;
	messageId?: string;
	projectId?: string;
}

export function buildEditFailedReceipt(input: BuildEditFailedReceiptInput): ChatArtifactReceipt {
	const title = `edit — ${input.request.prompt.trim().slice(0, 60) || 'image'}`;
	const receipt: ChatArtifactReceipt = {
		artifactId: `art-${generateUuidWithoutHyphens()}`,
		runId: input.runId,
		messageId: input.messageId ?? '',
		conversationId: input.conversationId,
		projectId: input.projectId,
		direction: 'generated',
		kind: 'image',
		title,
		preview: { kind: 'none' },
		state: 'failed',
		availableActions: ['retry'],
		createdAt: input.createdAt,
		error: {
			message: input.reason,
			// keep the tag simple — the message contains the useful detail
			code: 'media-edit-failed',
		},
	};
	return receipt;
}
