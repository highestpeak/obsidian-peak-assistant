/**
 * Decide whether a mounted block needs the full editor runtime.
 *
 * Short documents retain the eager editing surface. Long documents keep the
 * same visual projection but only hydrate the explicitly active block or an
 * editor-critical pin (editor focus, IME, drag or panel). Native selection
 * endpoints are mount-only pins: upgrading their row would replace the DOM
 * nodes that own the Range and destroy the selection.
 */
export function shouldHydrateComposerBlockEditor(
	editingEnabled: boolean,
	staticProjection: boolean,
	blockId: string,
	hydratedBlockId: string | null,
	editorPinnedBlockIds: ReadonlySet<string>,
): boolean {
	if (!editingEnabled) return false;
	if (!staticProjection) return true;
	return hydratedBlockId === blockId || editorPinnedBlockIds.has(blockId);
}
