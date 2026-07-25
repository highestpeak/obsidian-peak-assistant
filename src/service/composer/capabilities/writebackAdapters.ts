/**
 * Peak Composer — writeback adapter registry (WP3, spec §9).
 *
 * A writeback adapter compiles one typed result envelope into the reversible
 * `ComposerOperation`s that the WP2 transaction hub commits on accept.
 * Dispatch is by adapter ID + result kind (never label). The spec §9 safety
 * boundary maps onto the WP2 machinery as follows:
 *
 *   - `revalidate`  → the hub/engine revision guard: `acceptCandidate` refuses
 *     a stale candidate; the engine re-reads the live file, applies atomically,
 *     and rejects on revision mismatch or block-fusion (nothing persisted);
 *   - `commit`      → `ComposerTransactionHub.acceptCandidate` (atomic write +
 *     History + Undo push in one step);
 *   - `invert`      → the engine derives exact inverse operations for every
 *     committed transaction (undo/rollback replay them);
 *   - `preview`     → the candidate renderer renders the envelope payload; the
 *     adapter itself never touches the DOM.
 *
 * The adapter's own responsibility is therefore exactly one thing: build
 * CORRECT operations against the FROZEN invocation-time anchors, and fail
 * closed when the target cannot be addressed (never guess a new position).
 */

import type {
	ComposerOperation,
	ComposerResultEnvelope,
	ComposerResultKind,
	ComposerTarget,
	ComposerWritebackAdapterId,
} from '@/core/composer';
import { COMPOSER_TEXT_PATCH_WRITEBACK_ID } from '@/core/composer';
import { ComposerTextPatchPayloadSchema } from '@/core/schemas/composer';

/** Frozen addressing info captured at invocation time (base-revision coords). */
export interface WritebackTargetContext {
	target: ComposerTarget;
	/** Source range of the targeted block/unit in the candidate's base revision. */
	anchor?: { from: number; to: number };
}

export interface ComposerWritebackAdapter {
	readonly id: ComposerWritebackAdapterId;
	readonly resultKinds: readonly ComposerResultKind[];
	/**
	 * Compile the envelope into base-revision operations. MUST throw (fail
	 * closed) when the target cannot be addressed — never relocate silently.
	 */
	buildOperations(envelope: ComposerResultEnvelope, ctx: WritebackTargetContext): ComposerOperation[];
}

export class ComposerWritebackAdapterRegistry {
	private readonly byId = new Map<string, ComposerWritebackAdapter>();

	register(adapter: ComposerWritebackAdapter): void {
		if (this.byId.has(adapter.id)) {
			throw new Error(`writeback adapter '${adapter.id}' already registered`);
		}
		this.byId.set(adapter.id, adapter);
	}

	getById(id: ComposerWritebackAdapterId): ComposerWritebackAdapter | null {
		return this.byId.get(id) ?? null;
	}

	resolve(envelope: ComposerResultEnvelope): ComposerWritebackAdapter {
		if (!envelope.writebackAdapterId) {
			throw new Error(`result of kind '${envelope.resultKind}' declares no writeback adapter`);
		}
		const adapter = this.byId.get(envelope.writebackAdapterId);
		if (!adapter) throw new Error(`unknown writeback adapter '${envelope.writebackAdapterId}'`);
		if (!adapter.resultKinds.includes(envelope.resultKind)) {
			throw new Error(
				`writeback adapter '${adapter.id}' does not accept result kind '${envelope.resultKind}'`,
			);
		}
		return adapter;
	}
}

/**
 * Text-patch adapter: replaces the targeted range's exact source bytes
 * `[from,to)` with the replacement text — one atomic `replaceRange`. `ctx.anchor`
 * is whatever the runtime resolved for the target: a block's full span, a unit's
 * span, OR a selection's sub-range (a `selection` target pre-anchors its own
 * `[from,to)`), so a selection-scoped AI action replaces ONLY the selected bytes.
 * The inter-block separator lives in the gap and is never absorbed (WP1 patch
 * contract); the engine's block-delta guard rejects a fusing patch whole.
 */
export function createTextPatchWritebackAdapter(): ComposerWritebackAdapter {
	return {
		id: COMPOSER_TEXT_PATCH_WRITEBACK_ID,
		resultKinds: ['text-patch'],
		buildOperations(envelope, ctx): ComposerOperation[] {
			const payload = ComposerTextPatchPayloadSchema.parse(envelope.payload);
			if (!ctx.anchor) {
				throw new Error(
					'text-patch writeback: no source anchor for target — refusing to guess a position',
				);
			}
			return [
				{ kind: 'replaceRange', from: ctx.anchor.from, to: ctx.anchor.to, text: payload.replacementText },
			];
		},
	};
}

/** Default adapter set for the WP3 slice (grows per pack in WP5–8). */
export function createDefaultWritebackAdapters(): ComposerWritebackAdapterRegistry {
	const registry = new ComposerWritebackAdapterRegistry();
	registry.register(createTextPatchWritebackAdapter());
	return registry;
}
