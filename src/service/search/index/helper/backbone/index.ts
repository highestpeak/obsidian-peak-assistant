/**
 * Backbone map: folder tree + virtual clusters + cross-folder highway edges.
 */

export {
	buildBackboneMap, topTokensFromBasenames,
	normalizeVaultFolderPath, isPathExcludedByPrefixes, visibleChildFolders,
	scanFolderTree, getBackboneExcludedPrefixes, shouldIgnoreFolderForBackbone,
} from './buildBackboneMap';
export type { FolderScanRow, TagGlobalStats, TagRankCategory } from './buildBackboneMap';
export type {
	BackboneEdge,
	BackboneEnv,
	BackboneFolderNode,
	BackboneMapResult,
	BackboneMetrics,
	BackbonePage,
	BackboneVirtualNode,
	BuildBackboneMapOptions,
} from './types';
