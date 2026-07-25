/**
 * Peak Composer — context assembler (WP3, handoff §12.2 / spec §5.4).
 *
 * Builds the FROZEN `ComposerContextSnapshot` a run executes against. The
 * snapshot is assembled once at invocation time from the live document
 * session; later focus/selection/document changes never mutate an in-flight
 * run (Object.freeze + verbatim slices, no live references).
 */

import type { ComposerContextSnapshot, ComposerTarget } from '@/core/composer';
import type { ComposerDocumentSession } from '../documentSession';

export interface AssembleContextOptions {
	/** Frozen selection text when invoked from a selection surface. */
	selectionText?: string;
	/** Bounded window (chars) of surrounding source captured before/after. */
	nearbyChars: number;
}

/** Resolve the verbatim source range `[from,to)` of a target inside the session. */
function targetRange(session: ComposerDocumentSession, target: ComposerTarget): { from: number; to: number } {
	if (target.kind === 'document') {
		return { from: 0, to: session.snapshot.sourceText.length };
	}
	const block = session.getBlock(target.blockId);
	if (!block) throw new Error(`composer context: block '${target.blockId}' not found in current snapshot`);
	if (target.kind === 'block') return { from: block.source.from, to: block.source.to };
	const unit = block.units.find((u) => u.unitId === target.unitId);
	if (!unit) {
		throw new Error(
			`composer context: unit '${target.unitId}' not found in block '${target.blockId}'`,
		);
	}
	return { from: unit.from, to: unit.to };
}

/**
 * Assemble and freeze the invocation-time context snapshot. Throws when the
 * target cannot be located in the CURRENT session snapshot (the caller must
 * re-resolve, never guess).
 */
export function assembleComposerContextSnapshot(
	session: ComposerDocumentSession,
	target: ComposerTarget,
	options: AssembleContextOptions,
): ComposerContextSnapshot {
	const source = session.snapshot.sourceText;
	const { from, to } = targetRange(session, target);
	const window = Math.max(0, options.nearbyChars);
	const snapshot: ComposerContextSnapshot = {
		documentId: session.snapshot.documentId,
		revision: session.baseRevision,
		target,
		targetSource: source.slice(from, to),
		...(options.selectionText !== undefined ? { selectionText: options.selectionText } : {}),
		nearby: {
			before: source.slice(Math.max(0, from - window), from),
			after: source.slice(to, Math.min(source.length, to + window)),
		},
	};
	Object.freeze(snapshot.nearby);
	Object.freeze(snapshot.target);
	return Object.freeze(snapshot);
}
