// T11M: Concrete navigator that opens plugin-modal surfaces from inside
// Copilot result panels without leaking the `AppContext` bag into UI code.
// The picker modal's constructor requires the full `AppContext` (it
// composes a React tree that needs every service); the settings modal does
// the same. We keep that ctor coupling here — UI consumers see only
// `openSettings()` / `openCopilotPicker()`.

import type { AppContext } from '@/app/context/AppContext';
import type { CopilotPanelNavigator } from '@/service/copilot/panels/CopilotPanelPorts';
import type { IntentTabId } from '@/service/copilot/intent-hub';
import { SettingsModal } from '@/app/modals/SettingsModal';
import { CopilotPickerModal } from '@/ui/view/copilot/CopilotPickerModal';

export class AppCopilotPanelNavigatorAdapter implements CopilotPanelNavigator {
	constructor(private readonly appContext: AppContext) {}

	openSettings(): void {
		new SettingsModal(this.appContext).open();
	}

	openCopilotPicker(opts?: { initialTab?: IntentTabId }): void {
		new CopilotPickerModal(this.appContext, opts ? { initialTab: opts.initialTab } : {}).open();
	}
}
