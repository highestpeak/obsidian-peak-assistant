import type { ResultBrowserView } from '@/ui/component/result-browser';

export type SourcesKeyboardIntent =
	| { type: 'open-inspector' }
	| { type: 'close-inspector' }
	| { type: 'open-selected' }
	| { type: 'move-selection'; direction: 1 | -1 };

export interface SourcesKeyboardContext {
	view: ResultBrowserView;
	key: string;
	insideWorkspace: boolean;
	editableTarget: boolean;
	inspectorOpen: boolean;
	hasSelection: boolean;
	resultCount: number;
}

export function resolveSourcesKeyboardIntent(
	context: SourcesKeyboardContext,
): SourcesKeyboardIntent | null {
	// Tree keeps its expand/collapse precedence while focus is inside the
	// projection. Outside it, the mounted Sources surface still owns ←/→ so a
	// query editor or footer button cannot strand the selected source.
	const treeOwnsProjectionKey = context.view === 'tree'
		&& context.insideWorkspace
		&& !context.editableTarget;
	if (treeOwnsProjectionKey) return null;

	if (context.key === 'ArrowRight') {
		return context.hasSelection ? { type: 'open-inspector' } : null;
	}
	if (context.key === 'ArrowLeft') {
		return context.inspectorOpen ? { type: 'close-inspector' } : null;
	}
	if (context.view !== 'list') return null;
	if (!context.insideWorkspace || context.editableTarget) return null;
	if (context.key === 'Enter') {
		return context.hasSelection ? { type: 'open-selected' } : null;
	}
	if (context.resultCount === 0) return null;
	if (context.key === 'ArrowDown') return { type: 'move-selection', direction: 1 };
	if (context.key === 'ArrowUp') return { type: 'move-selection', direction: -1 };
	return null;
}

export function isSourcesDensityVisible(view: ResultBrowserView): boolean {
	return view !== 'graph';
}
