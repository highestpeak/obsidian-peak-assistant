// T11N: Narrow port for editor-mutating affordances triggered from UI
// (currently just `PushCard`'s "Insert link" button, but Ambient/Copilot
// could grow more later). Before T11N the card reached
// `app.workspace.getActiveViewOfType(MarkdownView)` + `editor.replaceRange`
// directly, dragging Obsidian's `MarkdownView` import into UI code.
//
// Implementation: `src/app/adapters/navigation/AppEditorCommandsAdapter.ts`.

export interface EditorCommandsPort {
	/**
	 * Insert `[[label]]` at the cursor in the active markdown view. Resolves
	 * `true` on insert and `false` when no markdown editor is active
	 * (callers may chain a `Notice` or quietly skip).
	 */
	insertWikilinkAtCursor(label: string): boolean;
}
