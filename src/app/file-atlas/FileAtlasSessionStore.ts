import type {
	FileAtlasDocumentSessionState,
	FileAtlasSessionPort,
} from '@/ui/view/file-atlas/FileAtlasSessionPort';
import type { TrayItem } from '@/ui/view/file-atlas/components/AtlasTray';

function cloneDocumentState(state: FileAtlasDocumentSessionState): FileAtlasDocumentSessionState {
	return {
		...state,
		visibleKinds: [...state.visibleKinds],
		collapsedIds: [...state.collapsedIds],
		selection: state.selection ? { ...state.selection } : null,
		graph: {
			...state.graph,
			viewport: state.graph.viewport ? {
				zoom: state.graph.viewport.zoom,
				pan: { ...state.graph.viewport.pan },
			} : null,
		},
	};
}

function cloneTray(items: TrayItem[]): TrayItem[] {
	return items.map((item) => ({ ...item }));
}

/**
 * One in-memory File Atlas registry per AppContext. It intentionally has no
 * persistence adapter: closing/reopening the modal preserves context, while a
 * plugin reload creates a fresh store and clears every snapshot.
 */
export class FileAtlasSessionStore implements FileAtlasSessionPort {
	private readonly documents = new Map<string, FileAtlasDocumentSessionState>();
	private tray: TrayItem[] = [];

	readDocument(path: string): FileAtlasDocumentSessionState | null {
		const state = this.documents.get(path);
		return state ? cloneDocumentState(state) : null;
	}

	writeDocument(path: string, state: FileAtlasDocumentSessionState): void {
		this.documents.set(path, cloneDocumentState(state));
	}

	deleteDocument(path: string): void {
		this.documents.delete(path);
	}

	readTray(): TrayItem[] {
		return cloneTray(this.tray);
	}

	writeTray(items: TrayItem[]): void {
		this.tray = cloneTray(items);
	}
}
