/**
 * Peak Composer — applicability resolver (WP3, spec §5.3).
 *
 * Projects the registry into the frozen `ComposerActionDescriptor` list for
 * one surface + one frozen context snapshot. Distinctions the UI must never
 * guess (spec §5.3):
 *   - `hidden`   → the action simply does not appear (wrong surface / target
 *     kind / guard says irrelevant);
 *   - `disabled` → the action appears with a mandatory `disabledReason`
 *     (stale snapshot, empty target, guard-reported unavailability).
 *
 * Titles/icons come from config via the presentation resolver — the chrome
 * renders them but never branches on them.
 */

import type {
	ComposerActionDescriptor,
	ComposerActionSurface,
	ComposerBlockKind,
	ComposerCapabilityDefinition,
	ComposerContextSnapshot,
} from '@/core/composer';
import type { ComposerCapabilitiesConfigProvider } from './capabilityConfig';
import { resolvePresentation } from './capabilityConfig';
import type { ComposerCapabilityRegistry } from './registry';

export interface ResolveActionsDeps {
	registry: ComposerCapabilityRegistry;
	config: ComposerCapabilitiesConfigProvider;
	/** Current live revision of the bound document session. */
	currentRevision: () => string;
	/** Parsed kind of a block in the CURRENT snapshot (undefined when missing). */
	resolveBlockKind: (blockId: string) => ComposerBlockKind | undefined;
}

function targetBlockKind(
	snapshot: ComposerContextSnapshot,
	deps: ResolveActionsDeps,
): ComposerBlockKind | undefined {
	if (snapshot.target.kind === 'document') return undefined;
	return deps.resolveBlockKind(snapshot.target.blockId);
}

function matchesTargetKind(
	def: ComposerCapabilityDefinition,
	snapshot: ComposerContextSnapshot,
	blockKind: ComposerBlockKind | undefined,
): boolean {
	if (snapshot.target.kind === 'document') return def.targetKinds.includes('document');
	if (!blockKind) return false;
	return def.targetKinds.includes(blockKind);
}

/** Compute the display-ordered action descriptors for one surface. */
export function resolveComposerActions(
	deps: ResolveActionsDeps,
	snapshot: ComposerContextSnapshot,
	surface: ComposerActionSurface,
): ComposerActionDescriptor[] {
	const config = deps.config();
	const stale = snapshot.revision !== deps.currentRevision();
	const blockKind = targetBlockKind(snapshot, deps);
	const descriptors: ComposerActionDescriptor[] = [];

	for (const def of deps.registry.list()) {
		if (!def.surfaces.includes(surface)) continue;
		// Target-kind filter. On a STALE snapshot the target block id may no
		// longer resolve in the live session (content-derived ids drift); the
		// action must still project — disabled with the stale reason — instead
		// of silently vanishing, so an unresolvable kind only filters when the
		// snapshot is fresh.
		if (!matchesTargetKind(def, snapshot, blockKind)) {
			const unresolvableWhileStale = stale && snapshot.target.kind !== 'document' && blockKind === undefined;
			if (!unresolvableWhileStale) continue;
		}

		const presentation = resolvePresentation(config, def.configKey, def.presentationFallback);
		const base: ComposerActionDescriptor = {
			capabilityId: def.manifest.id,
			surface,
			title: presentation.title,
			...(presentation.description ? { description: presentation.description } : {}),
			lucideIcon: presentation.lucideIcon,
			group: def.executionMode === 'deterministic' ? 'deterministic' : 'ai',
			...(def.acceptsInstruction ? { acceptsInstruction: true } : {}),
		};

		if (stale) {
			descriptors.push({ ...base, disabledReason: config.strings.staleSnapshot });
			continue;
		}

		const verdict = def.evaluate({
			snapshot,
			surface,
			...(blockKind !== undefined ? { blockKind } : {}),
		});
		if (verdict.state === 'hidden') continue;
		if (verdict.state === 'disabled') {
			descriptors.push({ ...base, disabledReason: verdict.reason });
			continue;
		}
		descriptors.push(base);
	}
	return descriptors;
}
