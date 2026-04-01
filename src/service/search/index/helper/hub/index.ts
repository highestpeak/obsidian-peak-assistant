/**
 * Hub discovery, HubDoc generation, and weighted local hub graphs.
 * For settings-only types (`HubDiscoverSettings`, etc.), import from `./types` to avoid circular deps with `app/settings`.
 */
export {
	HubDocService,
	HubMarkdownService,
	materializeHubDocFromCandidate,
} from './hubDocServices';
export type { MaterializeHubDocFromCandidateResult } from './hubDocServices';
export * from './types';
export {
	buildLocalHubGraphForPath,
} from './localGraphAssembler';
export {
	HubCandidateDiscoveryService,
	applySemanticMergePlanToFinalSelected,
	buildFolderHubDiscoveryDiagnostics,
	buildFolderHubEnrichmentMap,
	buildSemanticMergeHubCardsPayload,
	computeDocumentHubRepresentativeCandidateLimit,
	estimateCandidateCoverageBits,
	folderHubDiscoveryAdjustedRank,
	mergeHubAssemblyHintsGroup,
	mergeSemanticHubGroup,
	nestFolderHubRelationLegacy,
	thinDocumentHubCandidatesRepresentative,
} from './hubDiscover';
export type { FolderHubDiscoveryDiagnosticsRow } from './hubDiscover';
export type { FolderHubEnrichment } from './folderHubTopicPurity';
export { buildNavigationHubGroups, partitionNavigationGroupsAndLongTail } from './navigationHubGroups';
