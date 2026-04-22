/**
 * VaultSearchAgent: thin router that delegates to VaultSearchAgentSDK.
 *
 * Desktop-only: AI features are not supported on mobile.
 * All queries go through the Claude Agent SDK path (VaultSearchAgentSDK).
 */

import type { AIServiceManager } from '@/service/chat/service-manager';
import type { VaultSearchEvent } from './vault/types';
import { VaultSearchAgentSDK } from './VaultSearchAgentSDK';
import { AppContext } from '@/app/context/AppContext';

export class VaultSearchAgent {
	constructor(
		private readonly aiServiceManager: AIServiceManager,
	) {}

	/**
	 * Start a new vault search session.
	 * Always delegates to VaultSearchAgentSDK (Claude Agent SDK).
	 */
	async *startSession(userQuery: string): AsyncGenerator<VaultSearchEvent> {
		const ctx = AppContext.getInstance();
		const pluginSettings = ctx.plugin?.settings;

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
