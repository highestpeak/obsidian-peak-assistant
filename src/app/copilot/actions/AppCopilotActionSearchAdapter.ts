// T11B / T11B-R: Concrete search port — delegates to
// {@link SearchClient.vectorSearch}.
//
// T11B-R (2026-06-14): the resolver may return `null`/`undefined` when
// SQLite has not finished initializing yet (or never will, on mobile).
// In that case the port returns an empty item list so search-driven
// actions (`find-related`) render a clear empty result instead of
// crashing the picker / result modal.

import type { SearchClient } from '@/service/search/SearchClient';
import type { CopilotActionSearchPort } from '@/service/copilot/actions/CopilotActionPorts';

export class AppCopilotActionSearchAdapter implements CopilotActionSearchPort {
	constructor(private readonly resolveClient: () => SearchClient | null | undefined) {}

	async vectorSearch(input: { text: string; scopeMode: 'vault' | 'current-note'; topK: number }) {
		const client = this.resolveClient();
		if (!client) {
			// Boot order or mobile mode: search index is not available.
			// Returning an empty list keeps the catalog usable; the
			// `find-related` action surfaces "no items" rather than the
			// caller throwing.
			return { items: [] };
		}
		const response = await client.vectorSearch(input);
		return { items: response.items as any[] };
	}
}
