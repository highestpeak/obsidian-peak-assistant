// T11N: Composition root for the vault-navigation + editor-command ports.
// Called once from `AppContext`'s constructor — keeps adapter
// construction in app-owned code so service / UI never instantiate the
// concrete adapters directly.
//
// T11P (Track I): Also composes the `WikilinkPort` resolver used by
// `StreamdownIsolated` + `WikilinkHoverPreview`.

import type { App } from 'obsidian';
import type { VaultNavigationPort } from '@/core/ports/VaultNavigationPort';
import type { EditorCommandsPort } from '@/core/ports/EditorCommandsPort';
import type { WikilinkPort } from '@/core/ports/WikilinkPort';
import { AppVaultNavigationAdapter } from './AppVaultNavigationAdapter';
import { AppEditorCommandsAdapter } from './AppEditorCommandsAdapter';
import { AppWikilinkAdapter } from './AppWikilinkAdapter';
import type { ComposerDocumentRouter } from '@/app/composer/ComposerDocumentRouter';

export function composeVaultNavigation(
	app: App,
	getComposerRouter?: () => ComposerDocumentRouter | null,
): VaultNavigationPort {
	return new AppVaultNavigationAdapter(app, getComposerRouter);
}

export function composeEditorCommands(app: App): EditorCommandsPort {
	return new AppEditorCommandsAdapter(app);
}

export function composeWikilink(app: App): WikilinkPort {
	return new AppWikilinkAdapter(app);
}
