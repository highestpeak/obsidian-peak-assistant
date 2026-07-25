/**
 * Neutral model for the shared Result Browser — the single source of truth for
 * view vocabulary, stable identity, projection invariants and controlled state
 * transitions. Framework-agnostic and free of stores, services, telemetry and
 * query concerns (those live in host adapters).
 */
export type {
	ResultBrowserView,
	ResultBrowserDensity,
	ResultBrowserGraphPreset,
	ResultItemId,
	ResultBrowserSnapshot,
} from './types';
export { stableItemId, stableIdFrom } from './stableKey';
export {
	buildResultTree,
	flattenVisibleFiles,
	ancestorFolderPaths,
} from './buildTree';
export type { TreeFile, TreeFolder, TreeNode } from './buildTree';
export { intensityTier } from './intensityTier';
export type { IntensityTier } from './intensityTier';
export {
	listItemIds,
	treeFileIds,
	graphResultIds,
	rootItemId,
	listTreeIdsMatch,
	graphIsSubsetOfList,
	graphIncludesRootAndSelected,
	countTreeFiles,
} from './projection';
export {
	projectionChangeTriggersSearch,
	projectionChangeRebuildsSnapshot,
	applyProjectionChange,
} from './state';
export type {
	ResultBrowserProjectionState,
	ResultBrowserProjectionChange,
} from './state';
