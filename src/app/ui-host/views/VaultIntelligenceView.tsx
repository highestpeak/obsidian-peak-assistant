import React from 'react';
import type { IconName } from 'obsidian';
import { ReactItemViewHost } from '@/app/ui-host/ReactItemViewHost';
import { createReactElementWithServices } from '@/app/ui-host/ReactElementFactory';
import { VAULT_INTELLIGENCE_VIEW_TYPE } from '@/app/ui-host/views/types';
import { VaultIntelligenceWorkspace } from '@/ui/view/vault-intelligence/VaultIntelligenceWorkspace';

export { VAULT_INTELLIGENCE_VIEW_TYPE };

export class VaultIntelligenceView extends ReactItemViewHost {
	protected readonly viewType = VAULT_INTELLIGENCE_VIEW_TYPE;
	protected readonly displayText = 'Vault Intelligence';
	public readonly icon: IconName = 'scan-search';
	protected readonly rootClasses = ['peak-design-root', 'pktw-root', 'peak-vault-intelligence-view'] as const;

	protected renderElement(): React.ReactElement {
		return createReactElementWithServices(VaultIntelligenceWorkspace, {
			runtime: this.appContext.runtimeRegistry.getVaultIntelligenceRuntime(),
		}, this.appContext);
	}
}
