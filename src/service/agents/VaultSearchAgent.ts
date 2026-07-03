/**
 * VaultSearchAgent: thin router that delegates to VaultSearchAgentSDK.
 *
 * Desktop-only: AI features are not supported on mobile.
 *
 * The delegate class name (`VaultSearchAgentSDK`) reflects the current
 * runtime implementation, not user-visible backend selection — the SDK
 * backend option was retired in 2026-07 F.A. Once the harness-native
 * migration in spec 2026-07-04 lands, this router collapses into a single
 * `VaultSearchAgent` class and this file becomes the primary home.
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
