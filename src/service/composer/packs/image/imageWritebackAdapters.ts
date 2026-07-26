/**
 * Peak Composer — image writeback adapters (WP7, spec §9).
 *
 * Compile a typed image result envelope into reversible base-revision
 * operations the WP2 hub commits on accept. Both adapters replace the targeted
 * block's exact source range (`ctx.anchor`) with the payload's fully-rebuilt
 * block text — one atomic `replaceRange`. Fail closed when the target cannot be
 * addressed (never guess a position). Registered additively at the composition
 * root; the WP3 core factory is not modified.
 */

import type { ComposerOperation } from '@/core/composer';
import type {
	ComposerWritebackAdapter,
	ComposerWritebackAdapterRegistry,
} from '../../capabilities/writebackAdapters';
import {
	ComposerImageAnnotationPatchPayloadSchema,
	ComposerImageLayoutPatchPayloadSchema,
} from '@/core/schemas/composer';
import {
	COMPOSER_IMAGE_ANNOTATION_WRITEBACK_ID,
	COMPOSER_IMAGE_LAYOUT_WRITEBACK_ID,
} from './dispatchIds';

/** `image-annotation-patch` → replace the image block with the captioned figure. */
export function createImageAnnotationWritebackAdapter(): ComposerWritebackAdapter {
	return {
		id: COMPOSER_IMAGE_ANNOTATION_WRITEBACK_ID,
		resultKinds: ['image-annotation-patch'],
		buildOperations(envelope, ctx): ComposerOperation[] {
			const payload = ComposerImageAnnotationPatchPayloadSchema.parse(envelope.payload);
			if (!ctx.anchor) {
				throw new Error('image-annotation writeback: no source anchor for target — refusing to guess a position');
			}
			return [{ kind: 'replaceRange', from: ctx.anchor.from, to: ctx.anchor.to, text: payload.replacementText }];
		},
	};
}

/** `image-layout-patch` → replace the layout block with regenerated HTML. */
export function createImageLayoutWritebackAdapter(): ComposerWritebackAdapter {
	return {
		id: COMPOSER_IMAGE_LAYOUT_WRITEBACK_ID,
		resultKinds: ['image-layout-patch'],
		buildOperations(envelope, ctx): ComposerOperation[] {
			const payload = ComposerImageLayoutPatchPayloadSchema.parse(envelope.payload);
			if (!ctx.anchor) {
				throw new Error('image-layout writeback: no source anchor for target — refusing to guess a position');
			}
			return [{ kind: 'replaceRange', from: ctx.anchor.from, to: ctx.anchor.to, text: payload.html }];
		},
	};
}

/** Register the image writeback adapters onto a shared registry (additive). */
export function registerImageWritebackAdapters(registry: ComposerWritebackAdapterRegistry): void {
	if (!registry.getById(COMPOSER_IMAGE_ANNOTATION_WRITEBACK_ID)) {
		registry.register(createImageAnnotationWritebackAdapter());
	}
	if (!registry.getById(COMPOSER_IMAGE_LAYOUT_WRITEBACK_ID)) {
		registry.register(createImageLayoutWritebackAdapter());
	}
}
