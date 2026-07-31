// T11B (2026-06-14): Single composition point for the Copilot manual
// action runtime.
//
// One place wires every concrete dependency (Obsidian `App`,
// AIServiceManager, SearchClient, sqliteStoreManager, ProfileRegistry,
// custom prompt vault folder, Peak Harness) into the
// {@link CopilotActionPorts} bag and constructs the runtime
// implementation. Called from `main.ts` at plugin boot.
//
// Service-layer code stays pure orchestration over the port bag.

import type { App } from 'obsidian';
import { AppContext } from '@/app/context/AppContext';
import type { SearchClient } from '@/service/search/SearchClient';
import type { CopilotActionRuntime } from '@/service/copilot/actions/CopilotActionRuntime';
import { CopilotActionRuntimeImpl } from '@/service/copilot/actions/CopilotActionRuntimeImpl';
import type { CopilotActionPorts } from '@/core/ports/CopilotActionPorts';
import { AppVaultReaderAdapter } from '@/app/platform/vault/AppVaultReaderAdapter';
import { AppVaultMetadataCacheAdapter } from '@/app/platform/vault/AppVaultMetadataCacheAdapter';
import { AppCopilotActionSearchAdapter } from './AppCopilotActionSearchAdapter';
import { SqliteSemanticLinkReadAdapter } from '@/app/copilot/actions/SqliteSemanticLinkReadAdapter';
import { SemanticLinkSuggestionService } from '@/service/copilot/SemanticLinkSuggestionService';
import { SmartConnectionService } from '@/service/copilot/SmartConnectionService';
import { SqliteCopilotActionTagsAdapter } from './SqliteCopilotActionTagsAdapter';
import { createAppCopilotActionAgentAdapter } from './AppCopilotActionAgentAdapter';
import { ObsidianCustomPromptSourceAdapter } from '@/app/copilot/actions/ObsidianCustomPromptSourceAdapter';
import { getAICustomPromptsFolder } from '@/core/config/folderPaths';

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

	// T11Y-7b: one shared reader adapter covers both narrow vault ports
	// the action runtime needs.
	const vaultReaderAdapter = new AppVaultReaderAdapter(app);

	const ports: CopilotActionPorts = {
		// T11Y-7a: AIServiceManager structurally satisfies IAgentPrompter
		// (the action runtime's AI port is now a type-alias of that
		// shared port), so no bespoke wrapper is needed.
		ai: appContext.manager,
		// T11Y-7b: the bespoke ObsidianCopilotActionVaultAdapter is retired.
		// The shared AppVaultReaderAdapter covers DocumentVaultReaderPort
		// (list files + cached reads) and VaultMetadataResolverPort
		// (linkpath resolution); AppVaultMetadataCacheAdapter is the one
		// new narrow port (per-file cache + resolved-links graph) that the
		// shared adapter does not already expose.
		vaultReader: vaultReaderAdapter,
		linkResolver: vaultReaderAdapter,
		vaultMetadataCache: new AppVaultMetadataCacheAdapter(app),
		// T11B-R: search / semantic / tags adapters tolerate a null
		// SearchClient or unavailable SQLite — they return empty results
		// instead of crashing the catalog. The runtime stays usable on
		// mobile and during the SQLite-deferred window.
		search: new AppCopilotActionSearchAdapter(() => safeGetSearchClient()),
		// T11Y-4b: semantic-link suggestion algorithms now live in the
		// service layer behind a narrow {@link SemanticLinkReadPort}; the
		// sqlite adapter is just a read surface. Bundling the two
		// services satisfies the action-facing
		// {@link CopilotActionSemanticGraphPort} contract unchanged.
		semanticGraph: (() => {
			const reads = new SqliteSemanticLinkReadAdapter();
			return SemanticLinkSuggestionService.bundle(
				new SemanticLinkSuggestionService(reads),
				new SmartConnectionService(reads),
			);
		})(),
		tags: new SqliteCopilotActionTagsAdapter(appContext.manager),
		agent: createAppCopilotActionAgentAdapter({
			app,
			pluginId,
			resolveSearchClient: () => safeGetSearchClient(),
			analysisHistory: appContext.aiAnalysisHistoryService,
			resolvePluginCommandGateway: () =>
				AppContext.tryGetPluginCommandGatewayRuntime(),
		}),
		promptTemplates: {
			render: (template, variables) =>
				appContext.manager.renderDynamicPromptTemplate(template, variables),
		},
		customPrompts: new ObsidianCustomPromptSourceAdapter({
			app,
			resolveFolder: () => {
				const settings = AppContext.getSettings();
				return settings.customPromptsFolder ?? getAICustomPromptsFolder(settings.ai.rootFolder);
			},
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
