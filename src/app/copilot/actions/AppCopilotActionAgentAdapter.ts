// T11B: Concrete Copilot agent port. Composes the service-side
// {@link createCopilotAgentPort} with the concrete deps the agent loop
// needs (Obsidian `App`, plugin id, active profile resolver, search
// callback). Service code never sees `ProfileRegistry` or `AppContext`.

import type { App } from 'obsidian';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import type { SearchClient } from '@/service/search/SearchClient';
import type { GrepHit } from '@/service/agents/vault/vaultToolImplementations';
import {
	createCopilotAgentPort,
	type CopilotAgentSearchFn,
} from '@/service/copilot/actions/agent-actions';
import type { CopilotActionAgentPort } from '@/core/ports/CopilotActionPorts';
import type { AnalysisHistoryPort } from '@/core/ports/AnalysisHistoryPort';
import type { PluginCommandGatewayPort } from '@/core/ports/PluginCommandGatewayPort';

export interface AppCopilotActionAgentAdapterOptions {
	app: App;
	pluginId: string;
	/** Lazy because the SearchClient is only created after sqlite init. */
	resolveSearchClient: () => SearchClient | null | undefined;
	/** T11L: narrow port handed to the vault MCP server's recent-analysis tool. */
	analysisHistory: AnalysisHistoryPort;
	/** Lazy because the gateway is composed after the manual action catalog. */
	resolvePluginCommandGateway: () => PluginCommandGatewayPort | null;
}

export function createAppCopilotActionAgentAdapter(
	opts: AppCopilotActionAgentAdapterOptions,
): CopilotActionAgentPort {
	const searchFn: CopilotAgentSearchFn = async (q, limit) => {
		const client = opts.resolveSearchClient();
		// T11B-R: agent can run AI/vault tools even when SearchClient
		// isn't ready yet — grep-style helpers degrade to an empty list
		// so the agent loop never throws on boot-order edge cases.
		if (!client) return [];
		const res = await client.search({
			text: q,
			topK: limit,
			searchMode: 'hybrid',
			scopeMode: 'all',
			indexTenant: 'vault',
		} as any);
		return ((res.items ?? []) as any[]).map<GrepHit>((i: any) => ({
			path: i.path,
			snippet: i.title ?? i.path,
			score: i.score ?? 0,
		}));
	};

	return createCopilotAgentPort({
		app: opts.app,
		pluginId: opts.pluginId,
		resolveActiveBinding: () => ProfileRegistry.getInstance().getActiveAgentConfig(),
		search: searchFn,
		analysisHistory: opts.analysisHistory,
		resolvePluginCommandGateway: opts.resolvePluginCommandGateway,
	});
}
