// T11B: Concrete search port — delegates to {@link SearchClient.vectorSearch}.

import type { SearchClient } from '@/service/search/SearchClient';
import type { CopilotActionSearchPort } from '@/service/copilot/actions/CopilotActionPorts';

export class AppCopilotActionSearchAdapter implements CopilotActionSearchPort {
	constructor(private readonly resolveClient: () => SearchClient) {}

	async vectorSearch(input: { text: string; scopeMode: 'vault' | 'current-note'; topK: number }) {
		const client = this.resolveClient();
		const response = await client.vectorSearch(input);
		return { items: response.items as any[] };
	}
}
