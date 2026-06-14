// T11B (2026-06-14): Single composition point for the Copilot manual
// action runtime.
//
// One place wires every concrete dependency (Obsidian `App`,
// AIServiceManager, SearchClient, sqliteStoreManager, ProfileRegistry,
// custom prompt vault folder, Agent SDK) into the
// {@link CopilotActionPorts} bag and constructs the runtime
// implementation. Called from `main.ts` at plugin boot.
//
// Service-layer code stays pure orchestration over the port bag.

import type { App } from 'obsidian';
import { AppContext } from '@/app/context/AppContext';
import type { SearchClient } from '@/service/search/SearchClient';
import type { CopilotActionRuntime } from '@/service/copilot/actions/CopilotActionRuntime';
import { CopilotActionRuntimeImpl } from '@/service/copilot/actions/CopilotActionRuntimeImpl';
import type { CopilotActionPorts } from '@/service/copilot/actions/CopilotActionPorts';
import { AppCopilotActionAiAdapter } from './AppCopilotActionAiAdapter';
import { ObsidianCopilotActionVaultAdapter } from './ObsidianCopilotActionVaultAdapter';
import { AppCopilotActionSearchAdapter } from './AppCopilotActionSearchAdapter';
import { SqliteCopilotActionSemanticGraphAdapter } from './SqliteCopilotActionSemanticGraphAdapter';
import { SqliteCopilotActionTagsAdapter } from './SqliteCopilotActionTagsAdapter';
import { createAppCopilotActionAgentAdapter } from './AppCopilotActionAgentAdapter';
import { ObsidianCustomPromptSourceAdapter } from './ObsidianCustomPromptSourceAdapter';

/**
 * Compose the manual Copilot action runtime. The caller hands the
 * Obsidian `App`; everything else (AI manager, plugin id, search
 * client, settings) is resolved through the always-present `AppContext`
 * static accessors so the composition file stays a single readable
 * page.
 */
export function composeCopilotActionRuntime(app: App): CopilotActionRuntime {
	const appContext = AppContext.getInstance();
	const pluginId = appContext.plugin.manifest.id;

	const ports: CopilotActionPorts = {
		ai: new AppCopilotActionAiAdapter(appContext.manager),
		vault: new ObsidianCopilotActionVaultAdapter(app),
		// T11B-R: search / semantic / tags adapters tolerate a null
		// SearchClient or unavailable SQLite — they return empty results
		// instead of crashing the catalog. The runtime stays usable on
		// mobile and during the SQLite-deferred window.
		search: new AppCopilotActionSearchAdapter(() => safeGetSearchClient()),
		semanticGraph: new SqliteCopilotActionSemanticGraphAdapter(),
		tags: new SqliteCopilotActionTagsAdapter(appContext.manager),
		agent: createAppCopilotActionAgentAdapter({
			app,
			pluginId,
			resolveSearchClient: () => safeGetSearchClient(),
		}),
		customPrompts: new ObsidianCustomPromptSourceAdapter({
			app,
			resolveFolder: () => AppContext.getSettings().customPromptsFolder ?? '_prompts',
		}),
	};

	return new CopilotActionRuntimeImpl(ports);
}

/**
 * Read the active `SearchClient` if one is bound, otherwise `null`.
 * `AppContext.searchClient` is typed non-null but initialized to a null
 * placeholder until `initializeSearchService()` completes. On mobile or
 * during the SQLite-deferred window the placeholder stays — so we
 * normalize to `null` and let the adapter degrade.
 */
function safeGetSearchClient(): SearchClient | null {
	try {
		const client = AppContext.getSearchClient();
		return client ?? null;
	} catch {
		return null;
	}
}
