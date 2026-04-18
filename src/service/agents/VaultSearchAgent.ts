/**
 * VaultSearchAgent: thin router that delegates to VaultSearchAgentSDK (desktop)
 * or MobileVaultSearchAgent (mobile).
 *
 * The V1 hand-rolled classify/decompose/recon/report pipeline has been removed.
 * All desktop queries now go through the Claude Agent SDK path.
 */

import type { LLMStreamEvent } from '@/core/providers/types';
import type { AIServiceManager } from '@/service/chat/service-manager';
import type { VaultSearchEvent } from './vault/types';
import { VaultSearchAgentSDK } from './VaultSearchAgentSDK';
import { MobileVaultSearchAgent } from './MobileVaultSearchAgent';
import { AppContext } from '@/app/context/AppContext';
import { isMobile } from '@/core/platform';

export class VaultSearchAgent {
	constructor(
		private readonly aiServiceManager: AIServiceManager,
	) {}

	/**
	 * Start a new vault search session.
	 * Desktop → VaultSearchAgentSDK (Claude Agent SDK).
	 */
	async *startSession(userQuery: string): AsyncGenerator<VaultSearchEvent> {
		const ctx = AppContext.getInstance();

		// Mobile: simplified no-RAG agent
		if (isMobile()) {
			const mobileAgent = new MobileVaultSearchAgent(ctx.app, this.aiServiceManager);
			for await (const ev of mobileAgent.startSession(userQuery)) {
				yield ev as VaultSearchEvent;
			}
			return;
		}

		// Desktop: always use Agent SDK
		const pluginSettings = ctx.plugin?.settings;

		// Desktop: always use Agent SDK
		const v2 = new VaultSearchAgentSDK({
			app: ctx.app,
			pluginId: ctx.plugin.manifest.id,
			searchClient: ctx.searchClient,
			aiServiceManager: this.aiServiceManager,
			settings: pluginSettings,
		});
		// Non-blocking warmup — errors are logged, not propagated
		v2.warmup().catch(() => undefined);

		for await (const ev of v2.startSession(userQuery)) {
			yield ev as VaultSearchEvent;
		}
	}
}
