/**
 * Peak Composer — result materializer registry (WP3, spec §5.6 / handoff §11.4).
 *
 * A materializer turns one completed execution's raw output into the typed
 * `ComposerResultEnvelope` the renderer and writeback adapter dispatch on.
 * Dispatch key is the definition's declared `resultKind` — NEVER an action
 * label or an id substring. Unknown kinds are a registration-time failure
 * (`ComposerCapabilityRegistry.validateBindings`), not a silent fallback.
 */

import type {
	ComposerCapabilityDefinition,
	ComposerContextSnapshot,
	ComposerResultEnvelope,
	ComposerResultKind,
} from '@/core/composer';
import { ComposerTextPatchPayloadSchema } from '@/core/schemas/composer';

export interface MaterializeArgs {
	definition: ComposerCapabilityDefinition;
	snapshot: ComposerContextSnapshot;
	/** Accumulated streamed text (model-stream runs). */
	text: string;
}

export interface ComposerResultMaterializer {
	readonly resultKind: ComposerResultKind;
	materialize(args: MaterializeArgs): ComposerResultEnvelope;
}

export class ComposerResultMaterializerRegistry {
	private readonly byKind = new Map<ComposerResultKind, ComposerResultMaterializer>();

	register(materializer: ComposerResultMaterializer): void {
		if (this.byKind.has(materializer.resultKind)) {
			throw new Error(`result materializer for kind '${materializer.resultKind}' already registered`);
		}
		this.byKind.set(materializer.resultKind, materializer);
	}

	has(kind: ComposerResultKind): boolean {
		return this.byKind.has(kind);
	}

	resolve(kind: ComposerResultKind): ComposerResultMaterializer {
		const materializer = this.byKind.get(kind);
		if (!materializer) throw new Error(`no result materializer registered for kind '${kind}'`);
		return materializer;
	}
}

/**
 * `text-patch` materializer: the streamed text IS the replacement for the
 * target's source range. Payload is schema-validated before it can reach a
 * renderer or adapter.
 */
export function createTextPatchMaterializer(): ComposerResultMaterializer {
	return {
		resultKind: 'text-patch',
		materialize({ definition, text }): ComposerResultEnvelope {
			const payload = ComposerTextPatchPayloadSchema.parse({ replacementText: text });
			return {
				resultKind: 'text-patch',
				rendererId: definition.rendererId,
				...(definition.writebackAdapterId !== undefined
					? { writebackAdapterId: definition.writebackAdapterId }
					: {}),
				payload,
			};
		},
	};
}

/** Default materializer set for the WP3 slice (grows per pack in WP5–8). */
export function createDefaultResultMaterializers(): ComposerResultMaterializerRegistry {
	const registry = new ComposerResultMaterializerRegistry();
	registry.register(createTextPatchMaterializer());
	return registry;
}
