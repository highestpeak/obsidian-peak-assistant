/**
 * Peak Composer — image result materializers (WP7).
 *
 * Turn a completed model-stream run into a typed {@link ComposerResultEnvelope}
 * for the image annotation (caption) and layout-suggest capabilities. Dispatch
 * key is the declared `resultKind` (never a label). These register additively
 * onto the shared materializer registry at the composition root — the WP3 core
 * factory is not modified.
 *
 * `image-asset-candidate` has NO materializer here: those envelopes are built
 * directly by the image coordinator (media generation / paste / convert), not
 * from streamed text.
 */

import type { ComposerResultEnvelope } from '@/core/composer';
import type {
	ComposerResultMaterializer,
	ComposerResultMaterializerRegistry,
	MaterializeArgs,
} from '../../capabilities/resultMaterializers';
import {
	ComposerImageAnnotationPatchPayloadSchema,
	ComposerImageLayoutPatchPayloadSchema,
	ComposerImageLayoutSpecSchema,
} from '@/core/schemas/composer';
import { applyCaption } from './imageCaption';
import { renderLayoutHtml } from './imageLayout';

/**
 * `image-annotation-patch`: the streamed text IS the caption. Rebuilds the
 * targeted image block's source with the caption applied (one figure), so the
 * writeback is a single atomic range replace.
 */
export function createImageAnnotationMaterializer(): ComposerResultMaterializer {
	return {
		resultKind: 'image-annotation-patch',
		materialize({ definition, snapshot, text }: MaterializeArgs): ComposerResultEnvelope {
			const caption = text.trim();
			const replacementText = applyCaption(snapshot.targetSource, caption);
			const payload = ComposerImageAnnotationPatchPayloadSchema.parse({
				caption,
				replacementText,
			});
			return {
				resultKind: 'image-annotation-patch',
				rendererId: definition.rendererId,
				...(definition.writebackAdapterId ? { writebackAdapterId: definition.writebackAdapterId } : {}),
				payload,
			};
		},
	};
}

/**
 * `image-layout-patch`: the streamed text is a JSON layout spec (AI "smart
 * layout"). Validates it, renders the deterministic HTML, and packages both.
 */
export function createImageLayoutMaterializer(): ComposerResultMaterializer {
	return {
		resultKind: 'image-layout-patch',
		materialize({ definition, text }: MaterializeArgs): ComposerResultEnvelope {
			const layout = ComposerImageLayoutSpecSchema.parse(parseJson(text));
			const html = renderLayoutHtml(layout);
			const payload = ComposerImageLayoutPatchPayloadSchema.parse({ layout, html });
			return {
				resultKind: 'image-layout-patch',
				rendererId: definition.rendererId,
				...(definition.writebackAdapterId ? { writebackAdapterId: definition.writebackAdapterId } : {}),
				payload,
			};
		},
	};
}

function parseJson(text: string): unknown {
	const trimmed = text.trim();
	// Tolerate a fenced ```json block the model may wrap the spec in.
	const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
	const body = fenced ? fenced[1].trim() : trimmed;
	try {
		return JSON.parse(body);
	} catch {
		throw new Error('image layout materializer: streamed content is not valid layout JSON');
	}
}

/** Register the image materializers onto a shared registry (additive). */
export function registerImageResultMaterializers(registry: ComposerResultMaterializerRegistry): void {
	if (!registry.has('image-annotation-patch')) registry.register(createImageAnnotationMaterializer());
	if (!registry.has('image-layout-patch')) registry.register(createImageLayoutMaterializer());
}
