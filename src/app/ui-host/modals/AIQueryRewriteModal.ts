import React from 'react';
import { ReactModalHost, type ReactModalShellOptions } from '@/app/ui-host/ReactModalHost';
import { AIQueryRewritePanel } from '@/ui/view/quick-search/modals/AIQueryRewritePanel';
import { useSharedStore } from '@/ui/view/quick-search/store/sharedStore';
import { SettingsModal } from '@/app/ui-host/modals/SettingsModal';
import type { AppContext } from '@/app/context/AppContext';
import type { MyPluginSettings } from '@/core/config/settingsTypes';
import type { SuggestHistoryEntry } from '@/ui/view/quick-search/rewrite/SuggestHistoryStore';

/**
 * Overlay modal for AI Query Rewrite (Suggest). Opens over the Vault Search
 * modal; on candidate pick, writes the query into the shared store (which the
 * Search Modal's input mirrors) and closes.
 *
 * See design at `docs/research/2026-07-08-ai-query-rewrite/README.md`.
 */
export class AIQueryRewriteModal extends ReactModalHost {
	protected readonly shell: ReactModalShellOptions = {
		width: '540px',
		maxWidth: '90vw',
		maxHeight: '80vh',
		contentClasses: ['peak-ai-query-rewrite-modal'],
		modalClasses: ['peak-design-root'],
	};

	constructor(
		appContext: AppContext,
		private readonly settings: MyPluginSettings,
		private readonly replayEntry?: SuggestHistoryEntry,
	) {
		super(appContext);
	}

	protected renderElement(): React.ReactElement {
		return React.createElement(AIQueryRewritePanel, {
			app: this.appContext.app,
			settings: this.settings,
			replayEntry: this.replayEntry,
			onClose: () => this.close(),
			onPick: (query: string) => {
				useSharedStore.getState().setVaultSearchQuery(query);
			},
			onOpenAISetup: () => {
				// Land the user directly on the AI Setup tab so Fast Lookup
				// is the first thing they see instead of Overview.
				this.close();
				new SettingsModal(this.appContext, 'aiModels').open();
			},
		});
	}
}
