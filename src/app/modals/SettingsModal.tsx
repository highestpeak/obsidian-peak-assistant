import { ReactModalHost, type ReactModalShellOptions } from '@/app/shell/ReactModalHost';
import { createReactElementWithServices } from '@/app/react/ReactElementFactory';
import { SettingsRoot } from '@/ui/view/SettingsView';

export class SettingsModal extends ReactModalHost {
	protected readonly shell: ReactModalShellOptions = {
		contentClasses: ['peak-settings-modal', 'peak-design-root', 'pktw-root'],
		width: '860px',
		maxHeight: 'calc(100vh - 120px)',
	};

	protected renderElement(): React.ReactElement {
		return createReactElementWithServices(SettingsRoot, {}, this.appContext);
	}
}
