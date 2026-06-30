// T11M: Composition root for the Copilot result-panel write/navigation
// ports. Called once from plugin boot — it constructs the concrete
// adapters and returns the bag that the React `ServiceProvider` publishes
// through `useServiceContext().copilotPanelVault`.
//
// Keeping construction in app/ means service code does not import the
// adapter and the boundary scanner stays clean.

import type { AppContext } from '@/app/context/AppContext';
import type { CopilotPanelHostBundle } from '@/core/ports/CopilotPanelPorts';
import { AppCopilotPanelVaultAdapter } from './AppCopilotPanelVaultAdapter';
import { AppCopilotPanelNavigatorAdapter } from './AppCopilotPanelNavigatorAdapter';

export type { CopilotPanelHostBundle };

export function composeCopilotPanelVault(appContext: AppContext): CopilotPanelHostBundle {
	return {
		vault: new AppCopilotPanelVaultAdapter(appContext.app),
		navigator: new AppCopilotPanelNavigatorAdapter(appContext),
	};
}
