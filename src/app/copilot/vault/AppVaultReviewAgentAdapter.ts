// T9: App-side adapter for the Vault Review agent port.
//
// Pre-T9, `buildVaultMetaAgentStream(...)` inside
// `src/service/copilot/vault/VaultMetaAgentStream.ts` resolved
// `AppContext.getInstance()` to grab `app`, `plugin.manifest.id`, and
// `searchClient`, then constructed the Vault + Copilot MCP servers
// and dispatched a Claude Agent SDK round.
//
// T9 keeps the prompt construction + MCP wiring inside the service
// file but as a function that receives `app + pluginId + searchClient`
// as explicit parameters. This adapter binds those concrete deps so
// the service layer no longer needs AppContext.

import type { App } from 'obsidian';
import type { LLMStreamEvent } from '@/core/providers/types';
import { AppContext } from '@/app/context/AppContext';
import {
	buildVaultMetaAgentStream,
	type VaultMetaAgentOptions,
} from '@/service/copilot/vault/VaultMetaAgentStream';
import type { VaultReviewAgentPort } from '@/service/copilot/vault/ports/VaultReviewPorts';

export class AppVaultReviewAgentAdapter implements VaultReviewAgentPort {
	constructor(private readonly app: App) {}

	runRound(options: VaultMetaAgentOptions): AsyncGenerator<LLMStreamEvent> {
		const appContext = AppContext.getInstance();
		return buildVaultMetaAgentStream(
			{
				app: this.app,
				pluginId: appContext.plugin.manifest.id,
				searchClient: appContext.searchClient,
			},
			options,
		);
	}
}
