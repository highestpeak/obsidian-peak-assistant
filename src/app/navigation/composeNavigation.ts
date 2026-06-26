// T11N: Composition root for the vault-navigation + editor-command ports.
// Called once from `AppContext`'s constructor — keeps adapter
// construction in app-owned code so service / UI never instantiate the
// concrete adapters directly.

import type { App } from 'obsidian';
import type { VaultNavigationPort } from '@/service/navigation/VaultNavigationPort';
import type { EditorCommandsPort } from '@/service/editor/EditorCommandsPort';
import { AppVaultNavigationAdapter } from './AppVaultNavigationAdapter';
import { AppEditorCommandsAdapter } from './AppEditorCommandsAdapter';

export function composeVaultNavigation(app: App): VaultNavigationPort {
	return new AppVaultNavigationAdapter(app);
}

export function composeEditorCommands(app: App): EditorCommandsPort {
	return new AppEditorCommandsAdapter(app);
}
