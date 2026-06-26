/**
 * VaultSearchAgent: thin router that delegates to VaultSearchAgentSDK.
 *
 * Desktop-only: AI features are not supported on mobile.
 * All queries go through the Claude Agent SDK path (VaultSearchAgentSDK).
 */

import type { AppHandle } from '@/core/ports/AppHandle';
import type { AIServiceManager } from '@/service/chat/service-manager';
import type { SearchClient } from '@/service/search/SearchClient';
import type { VaultSearchEvent } from './vault/types';
import { VaultSearchAgentSDK } from './VaultSearchAgentSDK';

/**
 * Harness tier: local-deep (delegates to VaultSearchAgentSDK for the online SDK path).
 *
 * T11J B1: explicit app/pluginId/searchClient deps instead of AppContext lookups.
 */
export class VaultSearchAgent {
	constructor(
		private readonly app: AppHandle,
		private readonly pluginId: string,
		private readonly searchClient: SearchClient,
		private readonly aiServiceManager: AIServiceManager,
	) {}

	/**
	 * Start a new vault search session.
	 * Always delegates to VaultSearchAgentSDK (Claude Agent SDK).
	 */
	async *startSession(userQuery: string): AsyncGenerator<VaultSearchEvent> {
		const v2 = new VaultSearchAgentSDK({
			app: this.app,
			pluginId: this.pluginId,
			searchClient: this.searchClient,
			aiServiceManager: this.aiServiceManager,
		});
		// Non-blocking warmup — errors are logged, not propagated
		v2.warmup().catch(() => undefined);

		for await (const ev of v2.startSession(userQuery)) {
			yield ev as VaultSearchEvent;
		}
	}
}
