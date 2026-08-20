import { ReactModalHost, type ReactModalShellOptions } from '@/app/ui-host/ReactModalHost';
import { createReactElementWithServices } from '@/app/ui-host/ReactElementFactory';
import { SettingsRoot } from '@/ui/view/SettingsView';
import type { TabId } from '@/ui/view/settings/types';
import type { AppContext } from '@/app/context/AppContext';

export class SettingsModal extends ReactModalHost {
	protected readonly shell: ReactModalShellOptions = {
		contentClasses: ['peak-settings-modal', 'peak-design-root', 'pktw-root'],
		width: '1020px',
		maxHeight: 'calc(100vh - 72px)',
	};

	constructor(appContext: AppContext, private readonly initialTab?: TabId) {
		super(appContext);
	}

	protected renderElement(): React.ReactElement {
		return createReactElementWithServices(SettingsRoot, {
			initialTab: this.initialTab,
			onOpenAIControlCenter: async () => {
				this.close();
				await this.appContext.viewManager.activateAIControlCenterView();
			},
			onOpenIndexWorkspace: async () => {
				this.close();
				await this.appContext.viewManager.activateKnowledgeIndexWorkspace();
			},
			onOpenCommandGateway: async () => {
				this.close();
				await this.appContext.viewManager.activatePluginCommandGatewayView();
			},
		}, this.appContext);
	}
}
