import type { SearchResultItem } from '@/core/search/searchTypes';

/**
 * Tree data model for Vault Search's tree view. See the mockup at
 * `docs/research/2026-07-08-tree-view-mockup/index.html`.
 *
 * We build a nested folder structure from the flat result list, keeping only
 * folders that lead to at least one hit. Sort order within each folder: all
 * folders first (alpha), then all files (alpha) — matching Obsidian's own
 * File Explorer convention. This gives Obsidian users a familiar spatial map,
 * which is Tree view's whole point (List view already handles score-sort).
 */

export interface TreeFile {
	kind: 'file';
	name: string;         // basename without extension for markdown
	path: string;         // full vault path
	result: SearchResultItem;
	hitCount: number;     // number of highlight spans; falls back to 1 when unknown
}

export interface TreeFolder {
	kind: 'folder';
	name: string;         // last path segment
	path: string;         // full folder path
	children: TreeNode[]; // folders + files interleaved (folders first after sort)
	fileCount: number;    // aggregate files in the subtree
	hitCount: number;     // aggregate hits in the subtree
}

export type TreeNode = TreeFile | TreeFolder;

/** Convert a flat result list into a nested tree of folders + files. */
export function buildResultTree(results: SearchResultItem[]): TreeNode[] {
	const root: TreeFolder = {
		kind: 'folder',
		name: '',
		path: '',
		children: [],
		fileCount: 0,
		hitCount: 0,
	};

	for (const r of results) {
		if (!r.path) continue;
		const segments = r.path.split('/').filter((s) => s.length > 0);
		if (segments.length === 0) continue;
		const fileName = segments.pop() as string;
		let cursor = root;
		let currentPath = '';
		for (const seg of segments) {
			currentPath = currentPath ? `${currentPath}/${seg}` : seg;
			let child = cursor.children.find(
				(c) => c.kind === 'folder' && c.name === seg,
			) as TreeFolder | undefined;
			if (!child) {
				child = {
					kind: 'folder',
					name: seg,
					path: currentPath,
					children: [],
					fileCount: 0,
					hitCount: 0,
				};
				cursor.children.push(child);
			}
			cursor = child;
		}
		cursor.children.push({
			kind: 'file',
			name: fileName,
			path: r.path,
			result: r,
			hitCount: countHits(r),
		});
	}

	sortInPlace(root);
	aggregate(root);
	return root.children;
}

/** Flatten only files in visible (non-collapsed) order — for keyboard nav. */
export function flattenVisibleFiles(
	nodes: TreeNode[],
	collapsedFolders: Set<string>,
): TreeFile[] {
	const out: TreeFile[] = [];
	function walk(node: TreeNode): void {
		if (node.kind === 'file') {
			out.push(node);
			return;
		}
		if (collapsedFolders.has(node.path)) return;
		for (const c of node.children) walk(c);
	}
	for (const n of nodes) walk(n);
	return out;
}

/** Every folder path on the ancestor chain of a given file, useful when
 * auto-expanding to reveal a cursor position. */
export function ancestorFolderPaths(filePath: string): string[] {
	const segments = filePath.split('/').filter((s) => s.length > 0);
	segments.pop(); // drop filename
	const out: string[] = [];
	let acc = '';
	for (const seg of segments) {
		acc = acc ? `${acc}/${seg}` : seg;
		out.push(acc);
	}
	return out;
}

function sortInPlace(folder: TreeFolder): void {
	folder.children.sort((a, b) => {
		if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
		return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
	});
	for (const c of folder.children) {
		if (c.kind === 'folder') sortInPlace(c);
	}
}

function aggregate(folder: TreeFolder): void {
	let files = 0;
	let hits = 0;
	for (const c of folder.children) {
		if (c.kind === 'file') {
			files += 1;
			hits += c.hitCount;
		} else {
			aggregate(c);
			files += c.fileCount;
			hits += c.hitCount;
		}
	}
	folder.fileCount = files;
	folder.hitCount = hits;
}

function countHits(r: SearchResultItem): number {
	const spans = r.highlight?.highlights?.length ?? 0;
	// A result exists even without span metadata (e.g. matched title but the
	// snippet came from fallback text); count that as 1 hit so the badge is
	// never blank.
	return spans > 0 ? spans : 1;
}
