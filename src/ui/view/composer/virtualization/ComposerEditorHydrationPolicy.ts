/**
 * Decide whether a mounted block needs the full editor runtime.
 *
 * Short documents retain the eager editing surface. Long documents keep the
 * same visual projection but only hydrate the explicitly active block or an
 * interaction-critical hard pin (focus, IME, drag, selection, panel).
 */
export function shouldHydrateComposerBlockEditor(
	editingEnabled: boolean,
	staticProjection: boolean,
	blockId: string,
	hydratedBlockId: string | null,
	pinnedBlockIds: ReadonlySet<string>,
): boolean {
	if (!editingEnabled) return false;
	if (!staticProjection) return true;
	return hydratedBlockId === blockId || pinnedBlockIds.has(blockId);
}
