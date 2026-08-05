import type { RawBlockKind } from '@/core/document/atlas/types';
import type { AtlasGraphPreset, AtlasGraphViewport } from '@/ui/component/graph/AtlasGraphCanvas';
import type { TrayItem } from './components/AtlasTray';

export type FileAtlasSubview = 'tree' | 'graph';
export type FileAtlasGraphScope = 'one-hop' | 'two-hop' | 'ai';

export interface FileAtlasSelectionSnapshot {
	id: string;
	kind: RawBlockKind;
	contentHash: string;
	lineStart: number;
	title: string;
}

export interface FileAtlasGraphSessionState {
	scope: FileAtlasGraphScope;
	semantic: boolean;
	layout: AtlasGraphPreset;
	viewport: AtlasGraphViewport | null;
}

export function defaultFileAtlasGraphSessionState(): FileAtlasGraphSessionState {
	return {
		scope: 'one-hop',
		semantic: false,
		layout: 'constellation',
		viewport: null,
	};
}

export interface FileAtlasDocumentSessionState {
	subview: FileAtlasSubview;
	searchTerm: string;
	flattened: boolean;
	activePreset: string;
	presetModified: boolean;
	visibleKinds: RawBlockKind[];
	collapsedIds: string[];
	selection: FileAtlasSelectionSnapshot | null;
	treeScrollTop: number;
	inspectorScrollTop: number;
	graph: FileAtlasGraphSessionState;
}

/** Session-only state. The app owns the implementation and drops it on plugin unload. */
export interface FileAtlasSessionPort {
	readDocument(path: string): FileAtlasDocumentSessionState | null;
	writeDocument(path: string, state: FileAtlasDocumentSessionState): void;
	deleteDocument(path: string): void;
	readTray(): TrayItem[];
	writeTray(items: TrayItem[]): void;
}
