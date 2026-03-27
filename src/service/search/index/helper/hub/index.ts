/**
 * Hub discovery, HubDoc generation, and weighted local hub graphs.
 * For settings-only types (`HubDiscoverSettings`, etc.), import from `./types` to avoid circular deps with `app/settings`.
 */
export { HubDocService } from './hubDocServices';
export * from './types';
export {
	buildLocalHubGraphForPath,
} from './localGraphAssembler';
export {
	HubCandidateDiscoveryService,
	buildHubDiscoverDocCoverageIndex,
	estimateCandidateCoverageBits,
} from './hubDiscover';
