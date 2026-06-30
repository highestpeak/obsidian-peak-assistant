// T11B / T11B-R / T11Y-7c: concrete search port — delegates to
// {@link SearchClient.vectorSearch}.
//
// T11B-R (2026-06-14): the resolver may return `null`/`undefined` when
// SQLite has not finished initializing yet (or never will, on mobile).
// T11Y-7c (2026-06-30): we now distinguish that boot-order /
// degraded-mode case from "search ran and returned zero hits" by
// emitting the discriminated {@link SearchAvailabilityResult} shape.
// The previous `{ items: [] }` short-circuit conflated the two; UI
// surfaces can now render a clear "Search not ready" empty state.

import type { SearchClient } from '@/service/search/SearchClient';
import type { SearchAvailabilityPort, SearchAvailabilityResult } from '@/core/ports/SearchAvailabilityPort';

export class AppCopilotActionSearchAdapter implements SearchAvailabilityPort {
	constructor(private readonly resolveClient: () => SearchClient | null | undefined) {}

	async vectorSearch(input: { text: string; scopeMode: 'vault' | 'current-note'; topK: number }): Promise<SearchAvailabilityResult> {
		const client = this.resolveClient();
		if (!client) {
			// Boot order or mobile mode: search index is not available.
			// Surface the explicit unavailable branch so callers can
			// render "Search not ready" instead of "no results found".
			return { available: false, reason: 'search-client-unavailable' };
		}
		const response = await client.vectorSearch(input);
		return { available: true, items: response.items as any[] };
	}
}
