export interface VisibleGraphDocument {
	path: string;
}

export interface VisibleFolderGroup {
	id: string;
	path: string;
	label: string;
	parentId?: string;
	depth: number;
	top: string;
}

function folderPathOf(documentPath: string): string {
	const parts = documentPath.split('/').filter(Boolean);
	parts.pop();
	return parts.join('/');
}

function ancestorPaths(folderPath: string): string[] {
	const parts = folderPath.split('/').filter(Boolean);
	const paths: string[] = [];
	let current = '';
	for (const part of parts) {
		current = current ? `${current}/${part}` : part;
		paths.push(current);
	}
	return paths;
}

/**
 * Build the compound-node projection from the currently visible documents.
 *
 * A folder earns a frame only when it directly owns visible content. Empty
 * transit folders are omitted and descendants attach to their nearest visible
 * ancestor. Full paths remain on both document and group data, so the collapse
 * changes layout only.
 */
export function buildVisibleFolderGroups(
	documents: ReadonlyArray<VisibleGraphDocument>,
): VisibleFolderGroup[] {
	const directFolders = new Set<string>();
	for (const document of documents) {
		const folderPath = folderPathOf(document.path);
		if (folderPath) directFolders.add(folderPath);
	}

	const sorted = [...directFolders].sort((left, right) => {
		const depthDelta = left.split('/').length - right.split('/').length;
		if (depthDelta !== 0) return depthDelta;
		return left.localeCompare(right);
	});

	return sorted.map((path) => {
		const ancestors = ancestorPaths(path);
		const parentPath = [...ancestors]
			.slice(0, -1)
			.reverse()
			.find((candidate) => directFolders.has(candidate));
		const parts = path.split('/');
		return {
			id: `group:folder:${path}`,
			path,
			label: parts[parts.length - 1] ?? path,
			parentId: parentPath ? `group:folder:${parentPath}` : undefined,
			depth: parts.length - 1,
			top: parts[0] ?? '',
		};
	});
}

export function visibleFolderGroupIdForDocument(documentPath: string): string | undefined {
	const folderPath = folderPathOf(documentPath);
	return folderPath ? `group:folder:${folderPath}` : undefined;
}
