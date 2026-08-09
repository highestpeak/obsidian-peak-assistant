export interface FolderTreeDocument {
	id: string;
	path: string;
}

export interface VisibleFolderTreeNode {
	id: string;
	path: string;
	label: string;
	parentId?: string;
	depth: number;
	directDocumentIds: string[];
	documentIds: string[];
}

export interface FolderTreeRow {
	id: string;
	kind: 'folder' | 'document';
	depth: number;
	path: string;
}

export interface VisibleFolderTreeProjection {
	folders: VisibleFolderTreeNode[];
	rows: FolderTreeRow[];
	documentFolderIdById: Map<string, string | undefined>;
}

interface MutableFolderTreeNode {
	path: string;
	directDocumentIds: string[];
	documentIds: Set<string>;
}

const folderNodeId = (path: string): string => `group:folder:${path}`;

function pathParts(path: string): string[] {
	return path.split('/').filter(Boolean);
}

function comparePath(left: string, right: string): number {
	return left.localeCompare(right, 'zh');
}

/**
 * Project visible result documents into one stable, full-depth folder tree.
 * Every visible ancestor is retained because folder nodes are interaction
 * targets, not decorative compound frames.
 */
export function buildVisibleFolderTree(
	documents: ReadonlyArray<FolderTreeDocument>,
): VisibleFolderTreeProjection {
	const mutableByPath = new Map<string, MutableFolderTreeNode>();
	const documentFolderIdById = new Map<string, string | undefined>();
	const documentById = new Map(documents.map((document) => [document.id, document]));

	for (const document of documents) {
		const parts = pathParts(document.path);
		const folderParts = parts.slice(0, -1);
		if (folderParts.length === 0) {
			documentFolderIdById.set(document.id, undefined);
			continue;
		}

		for (let index = 0; index < folderParts.length; index += 1) {
			const path = folderParts.slice(0, index + 1).join('/');
			const mutable = mutableByPath.get(path) ?? {
				path,
				directDocumentIds: [],
				documentIds: new Set<string>(),
			};
			mutable.documentIds.add(document.id);
			mutableByPath.set(path, mutable);
		}

		const directFolderPath = folderParts.join('/');
		mutableByPath.get(directFolderPath)?.directDocumentIds.push(document.id);
		documentFolderIdById.set(document.id, folderNodeId(directFolderPath));
	}

	const folders = [...mutableByPath.values()]
		.sort((left, right) => {
			const depthDelta = pathParts(left.path).length - pathParts(right.path).length;
			return depthDelta || comparePath(left.path, right.path);
		})
		.map((folder): VisibleFolderTreeNode => {
			const parts = pathParts(folder.path);
			const parentPath = parts.slice(0, -1).join('/');
			return {
				id: folderNodeId(folder.path),
				path: folder.path,
				label: parts[parts.length - 1] ?? folder.path,
				parentId: parentPath ? folderNodeId(parentPath) : undefined,
				depth: Math.max(0, parts.length - 1),
				directDocumentIds: [...folder.directDocumentIds].sort((left, right) => (
					comparePath(documentById.get(left)?.path ?? left, documentById.get(right)?.path ?? right)
				)),
				documentIds: [...folder.documentIds],
			};
		});

	const folderById = new Map(folders.map((folder) => [folder.id, folder]));
	const childFoldersByParent = new Map<string | undefined, VisibleFolderTreeNode[]>();
	for (const folder of folders) {
		const siblings = childFoldersByParent.get(folder.parentId) ?? [];
		siblings.push(folder);
		childFoldersByParent.set(folder.parentId, siblings);
	}
	for (const siblings of childFoldersByParent.values()) {
		siblings.sort((left, right) => comparePath(left.label, right.label));
	}

	const rows: FolderTreeRow[] = [];
	const appendFolder = (folder: VisibleFolderTreeNode): void => {
		rows.push({ id: folder.id, kind: 'folder', depth: folder.depth, path: folder.path });
		for (const child of childFoldersByParent.get(folder.id) ?? []) appendFolder(child);
		for (const documentId of folder.directDocumentIds) {
			const document = documentById.get(documentId);
			if (!document) continue;
			rows.push({
				id: document.id,
				kind: 'document',
				depth: folder.depth + 1,
				path: document.path,
			});
		}
	};

	for (const rootFolder of childFoldersByParent.get(undefined) ?? []) appendFolder(rootFolder);
	for (const document of documents.filter((item) => !documentFolderIdById.get(item.id)).sort((left, right) => comparePath(left.path, right.path))) {
		rows.push({ id: document.id, kind: 'document', depth: 0, path: document.path });
	}

	// Fail loudly during development if a parent id drifted from the projection.
	for (const folder of folders) {
		if (folder.parentId && !folderById.has(folder.parentId)) {
			throw new Error(`Folder tree parent missing: ${folder.parentId}`);
		}
	}

	return { folders, rows, documentFolderIdById };
}

export function folderTreeSelectionScope(
	projection: VisibleFolderTreeProjection,
	selectedNodeId: string | null,
): { documentIds: Set<string>; folderIds: Set<string> } {
	const documentIds = new Set<string>();
	const folderIds = new Set<string>();
	if (!selectedNodeId) return { documentIds, folderIds };

	const selectedFolder = projection.folders.find((folder) => folder.id === selectedNodeId);
	if (!selectedFolder) {
		if (projection.rows.some((row) => row.kind === 'document' && row.id === selectedNodeId)) {
			documentIds.add(selectedNodeId);
		}
		return { documentIds, folderIds };
	}

	for (const documentId of selectedFolder.documentIds) documentIds.add(documentId);
	for (const folder of projection.folders) {
		if (folder.path === selectedFolder.path || folder.path.startsWith(`${selectedFolder.path}/`)) {
			folderIds.add(folder.id);
		}
	}
	return { documentIds, folderIds };
}

export function toggleFolderTreeSelection(
	currentNodeId: string | null,
	nextNodeId: string,
): string | null {
	return currentNodeId === nextNodeId ? null : nextNodeId;
}
