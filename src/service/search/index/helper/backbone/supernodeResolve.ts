/**
 * Maps document paths to backbone supernodes (folder id or virtual id).
 */

import { normalizeVaultPath } from '@/core/utils/vault-path-utils';
import type { BackboneFolderNode, BackboneVirtualNode } from './types';
import { parentFolderOfDocPath } from './digestLoader';

function parentFolderPath(folderPath: string): string {
	const n = normalizeVaultPath(folderPath);
	if (!n) return '';
	const segs = n.split('/').filter(Boolean);
	if (segs.length <= 1) return '';
	return segs.slice(0, -1).join('/');
}

/**
 * Finds the nearest ancestor folder that exists in the scanned folder map.
 */
export function resolveFolderNodeIdForDocPath(
	docPath: string,
	pathToFolderNode: Map<string, BackboneFolderNode>,
): string | undefined {
	let p = parentFolderOfDocPath(docPath);
	while (true) {
		const n = pathToFolderNode.get(p);
		if (n) return n.id;
		if (!p) return undefined;
		p = parentFolderPath(p);
	}
}

export type SupernodeResolver = {
	resolve: (docPath: string) => string | undefined;
	label: (supernodeId: string) => string;
};

/**
 * Builds a resolver: virtual members override folder assignment.
 */
export function buildSupernodeResolver(
	folderNodes: BackboneFolderNode[],
	virtualNodes: BackboneVirtualNode[],
): SupernodeResolver {
	const pathToFolder = new Map<string, BackboneFolderNode>();
	for (const f of folderNodes) {
		pathToFolder.set(normalizeVaultPath(f.path), f);
	}

	const docPathToVirtualId = new Map<string, string>();
	for (const v of virtualNodes) {
		for (const p of v.memberDocPaths) {
			const np = normalizeVaultPath(p);
			if (!docPathToVirtualId.has(np)) docPathToVirtualId.set(np, v.id);
		}
	}

	const idToLabel = new Map<string, string>();
	for (const f of folderNodes) {
		idToLabel.set(f.id, `${f.displayName}/`);
	}
	for (const v of virtualNodes) {
		idToLabel.set(v.id, v.displayName);
	}

	return {
		resolve: (docPath: string) => {
			const np = normalizeVaultPath(docPath);
			const vid = docPathToVirtualId.get(np);
			if (vid) return vid;
			return resolveFolderNodeIdForDocPath(docPath, pathToFolder);
		},
		label: (supernodeId: string) => idToLabel.get(supernodeId) ?? supernodeId,
	};
}
