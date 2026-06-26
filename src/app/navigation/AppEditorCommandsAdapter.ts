// T11N: Concrete Obsidian implementation of `EditorCommandsPort`. The
// only place in the codebase that imports Obsidian's `MarkdownView` for
// the Ambient push-card "Insert link" affordance.

import { MarkdownView, type App } from 'obsidian';
import type { EditorCommandsPort } from '@/service/editor/EditorCommandsPort';

export class AppEditorCommandsAdapter implements EditorCommandsPort {
	constructor(private readonly app: App) {}

	insertWikilinkAtCursor(label: string): boolean {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return false;
		const editor = view.editor;
		const cursor = editor.getCursor();
		editor.replaceRange(`[[${label}]]`, cursor);
		return true;
	}
}
