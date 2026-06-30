// T8 / T11Y-2a: search adapter. Wraps two infrastructure surfaces and
// feeds the pure `ambientSearch` orchestrator:
//   1. `AppContext.getSearchClient().search(...)` for vault search;
//   2. `AmbientPersistencePort.getLearnedPatterns()` for pattern boost.
//
// The 2-hop serendipity traversal that previously lived here moved to
// `src/service/ambient/serendipity/SerendipitySearcher.ts`, which now
// consumes a `SemanticGraphTraversalReadPort`. This adapter receives
// the pre-built searcher and just delegates.

import { AppContext } from '@/app/context/AppContext';
import type { SearchQuery, SearchResponse } from '@/core/search/searchTypes';
import type {
	AmbientContext,
	AmbientPushItem,
	AmbientPushSettings,
} from '@/core/types/ambient';
import type {
	AmbientPersistencePort,
	AmbientSearchDeps,
	AmbientSearchPort,
} from '@/service/ambient/ports/AmbientPorts';
import { ambientSearch } from '@/service/ambient/AmbientSearcher';
import { SerendipitySearcher } from '@/service/ambient/serendipity/SerendipitySearcher';

export class SearchAmbientSearchAdapter implements AmbientSearchPort {
	private readonly deps: AmbientSearchDeps;

	constructor(
		private readonly persistence: AmbientPersistencePort,
		private readonly serendipity: SerendipitySearcher,
	) {
		this.deps = {
			searchVault: (query: SearchQuery): Promise<SearchResponse> =>
				AppContext.getSearchClient().search(query),
			getLearnedPatterns: () => this.persistence.getLearnedPatterns(),
			searchSerendipity: (context, existingOutlinksLower, maxResults) =>
				this.serendipity.search(context, existingOutlinksLower, maxResults),
		};
	}

	search(
		context: AmbientContext,
		maxItems: number,
		pushHistory: ReadonlyMap<string, number>,
		settings: AmbientPushSettings,
	): Promise<AmbientPushItem[]> {
		return ambientSearch(this.deps, context, maxItems, pushHistory, settings);
	}
}
