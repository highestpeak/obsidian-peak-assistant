// T11M: Hook that exposes the Copilot result-panel host bundle to React
// callers. Panels and the Result/AutoRun/Picker/Vault-review modals
// consume named operations (`appendToFile`, `applyArtifacts`,
// `writeFrontmatterTags`, `openNote`, etc.) and the modal navigator
// (`openSettings`, `openCopilotPicker`) through this single hook — never
// `AppContext.getInstance()` or raw `app.vault.*`.

import { useServiceContext } from '@/ui/context/ServiceContext';
import type {
	CopilotPanelVaultPort,
	CopilotPanelNavigator,
} from '@/core/ports/CopilotPanelPorts';

export interface CopilotPanelHost {
	vault: CopilotPanelVaultPort;
	navigator: CopilotPanelNavigator;
}

export function useCopilotPanelVault(): CopilotPanelHost {
	const { copilotPanelVault } = useServiceContext();
	return copilotPanelVault;
}
