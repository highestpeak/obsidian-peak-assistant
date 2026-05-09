/**
 * Backbone map: folder tree + virtual clusters + cross-folder highway edges.
 */

export { buildBackboneMap, topTokensFromBasenames } from './buildBackboneMap';
export type { TagGlobalStats, TagRankCategory } from './buildBackboneMap';
export type {
	BackboneEdge,
	BackboneFolderNode,
	BackboneMapResult,
	BackboneMetrics,
	BackbonePage,
	BackboneVirtualNode,
	BuildBackboneMapOptions,
} from './types';
