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
	ComposerInvocationPlacement,
	ComposerResultEnvelope,
	ComposerResultKind,
} from '@/core/composer';
import {
	ComposerAnalysisPayloadSchema,
	ComposerBlockInsertionPayloadSchema,
	ComposerListItemPatchPayloadSchema,
	ComposerListItemPatchProposalSchema,
	ComposerTextPatchPayloadSchema,
} from '@/core/schemas/composer';
import { parseComposerDocument } from '../documentParser';

export interface MaterializeArgs {
	definition: ComposerCapabilityDefinition;
	snapshot: ComposerContextSnapshot;
	/** Accumulated streamed text (model-stream runs). */
	text: string;
	/**
	 * Verbatim current bytes of the target's SEPARATE native object file, read by
	 * the runtime before a `native-file-patch` run. The native materializer applies
	 * the model's typed patches against these to compute the next bytes. Absent for
	 * every non-native materializer (they ignore it).
	 */
	nativeBaseText?: string;
	/** Vault path of the target's native object file (native-file-patch runs, display + accept). */
	nativeTargetPath?: string;
	/** Explicit placement selected before the run; overrides model positioning. */
	placement?: ComposerInvocationPlacement;
}

export interface ComposerResultMaterializer {
	readonly resultKind: ComposerResultKind;
	/**
	 * True when the streamed run output is a typed JSON object (table-patch /
	 * chart-source …) rather than human-readable prose. The runtime uses this to
	 * suppress the accumulating half-JSON during streaming (it shows a skeleton
	 * instead) and only materializes on completion. Absent ⇒ the streamed text is
	 * itself the reviewable body (text-patch / formula narrative).
	 */
	readonly streamsTypedObject?: boolean;
	materialize(args: MaterializeArgs): ComposerResultEnvelope;
}

/**
 * Strip a single ```json … ``` (or bare ``` … ```) code fence a model may wrap a
 * typed-object answer in, returning the inner JSON text. No fence ⇒ trimmed input
 * unchanged. Used by typed-object materializers before `JSON.parse`.
 */
export function stripJsonCodeFence(text: string): string {
	const trimmed = text.trim();
	const fenced = /^```(?:json)?[ \t]*\r?\n?([\s\S]*?)\r?\n?```$/i.exec(trimmed);
	return (fenced ? fenced[1] : trimmed).trim();
}

/**
 * Parse a typed-object model answer into a plain JSON value, failing closed with
 * a clear reason (never a raw `Unexpected token` from `JSON.parse`) so a bad
 * candidate lands in the error state instead of writing garbage back.
 */
export function parseTypedObjectJson(text: string, kind: ComposerResultKind): unknown {
	const body = stripJsonCodeFence(text);
	if (body.length === 0) throw new Error(`${kind}: model produced no JSON output`);
	try {
		return JSON.parse(body);
	} catch {
		throw new Error(`${kind}: model output was not valid JSON`);
	}
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

/**
 * `block-insertion` materializer: streamed prose is an additive draft, not a
 * replacement. Trimming keeps separator ownership in the writeback adapter.
 */
export function createBlockInsertionMaterializer(): ComposerResultMaterializer {
	return {
		resultKind: 'block-insertion',
		materialize({ definition, text }): ComposerResultEnvelope {
			const payload = ComposerBlockInsertionPayloadSchema.parse({ insertedText: text.trim() });
			return {
				resultKind: 'block-insertion',
				rendererId: definition.rendererId,
				...(definition.writebackAdapterId !== undefined
					? { writebackAdapterId: definition.writebackAdapterId }
					: {}),
				payload,
			};
		},
	};
}

/**
 * `list-item-patch` materializer: the model chooses one semantic gap and emits
 * one complete Markdown list item. We validate both objects with the production
 * parser and precompute the exact full-list replacement; invalid/multi-item
 * output fails closed before a candidate can become acceptable.
 */
export function createListItemPatchMaterializer(): ComposerResultMaterializer {
	return {
		resultKind: 'list-item-patch',
		streamsTypedObject: true,
		materialize({ definition, snapshot, text, placement }): ComposerResultEnvelope {
			const proposal = ComposerListItemPatchProposalSchema.parse(
				parseTypedObjectJson(text, 'list-item-patch'),
			);
			const insertionIndex =
				placement?.kind === 'list-gap'
					? placement.insertionIndex
					: proposal.insertionIndex;
			const replacementText = insertValidatedListItem(
				snapshot.targetSource,
				insertionIndex,
				proposal.itemMarkdown,
			);
			const payload = ComposerListItemPatchPayloadSchema.parse({
				...proposal,
				insertionIndex,
				itemMarkdown: proposal.itemMarkdown.trim(),
				replacementText,
			});
			return {
				resultKind: 'list-item-patch',
				rendererId: definition.rendererId,
				...(definition.writebackAdapterId !== undefined
					? { writebackAdapterId: definition.writebackAdapterId }
					: {}),
				payload,
			};
		},
	};
}

export function insertValidatedListItem(
	source: string,
	insertionIndex: number,
	itemMarkdown: string,
): string {
	const sourceSnapshot = parseComposerDocument(source);
	const sourceBlock = sourceSnapshot.blocks[0];
	if (
		sourceSnapshot.blocks.length !== 1 ||
		!sourceBlock ||
		(sourceBlock.kind !== 'list' && sourceBlock.kind !== 'task')
	) {
		throw new Error('list-item-patch: target source is not one addressable list');
	}
	const topLevelItems = sourceBlock.units.filter(
		(unit) => unit.unitKind === 'list-item' && !unit.parentUnitId,
	);
	if (insertionIndex > topLevelItems.length) {
		throw new Error(
			`list-item-patch: insertionIndex ${insertionIndex} exceeds ${topLevelItems.length} list gaps`,
		);
	}

	const normalizedItem = itemMarkdown.trim();
	const itemSnapshot = parseComposerDocument(normalizedItem);
	const itemBlock = itemSnapshot.blocks[0];
	const itemRoots = itemBlock?.units.filter(
		(unit) => unit.unitKind === 'list-item' && !unit.parentUnitId,
	) ?? [];
	if (
		itemSnapshot.blocks.length !== 1 ||
		!itemBlock ||
		(itemBlock.kind !== 'list' && itemBlock.kind !== 'task') ||
		itemRoots.length !== 1 ||
		itemBlock.kind !== sourceBlock.kind ||
		Boolean(itemBlock.renderModel.ordered) !== Boolean(sourceBlock.renderModel.ordered)
	) {
		throw new Error(
			'list-item-patch: itemMarkdown must contain exactly one top-level item matching the source list style',
		);
	}

	const newline = source.includes('\r\n') ? '\r\n' : '\n';
	const nextItem = topLevelItems[insertionIndex];
	if (nextItem) {
		return `${source.slice(0, nextItem.from)}${normalizedItem}${newline}${source.slice(nextItem.from)}`;
	}
	const separator = source.endsWith('\n') ? '' : newline;
	return `${source}${separator}${normalizedItem}`;
}

/**
 * Read-only narrative materializer. Analysis candidates deliberately have no
 * writeback adapter, so an explanation can never be mistaken for an edit.
 */
export function createAnalysisMaterializer(): ComposerResultMaterializer {
	return {
		resultKind: 'analysis',
		materialize({ definition, text }): ComposerResultEnvelope {
			return {
				resultKind: 'analysis',
				rendererId: definition.rendererId,
				payload: ComposerAnalysisPayloadSchema.parse({ content: text }),
			};
		},
	};
}

/** Default materializer set for the WP3 slice (grows per pack in WP5–8). */
export function createDefaultResultMaterializers(): ComposerResultMaterializerRegistry {
	const registry = new ComposerResultMaterializerRegistry();
	registry.register(createAnalysisMaterializer());
	registry.register(createBlockInsertionMaterializer());
	registry.register(createListItemPatchMaterializer());
	registry.register(createTextPatchMaterializer());
	return registry;
}
