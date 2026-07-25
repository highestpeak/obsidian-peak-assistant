/**
 * Temporary compatibility re-export. The tree builder moved to the shared
 * Result Browser package (`@/ui/component/result-browser/model/buildTree`) in
 * the 2026-07-21 extraction. Quick Search's existing import sites resolve
 * through this shim; it will be removed once all call sites import the shared
 * module directly.
 */
export {
	buildResultTree,
	flattenVisibleFiles,
	ancestorFolderPaths,
} from '@/ui/component/result-browser/model/buildTree';
export type {
	TreeFile,
	TreeFolder,
	TreeNode,
} from '@/ui/component/result-browser/model/buildTree';
