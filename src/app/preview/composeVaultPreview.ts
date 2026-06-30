// T11N: Composition root for the vault preview port. Called once from
// `AppContext`'s constructor — keeps adapter construction in app-owned
// code so service / UI never instantiate the concrete adapter directly.

import type { App } from 'obsidian';
import type { VaultPreviewPort } from '@/core/ports/VaultPreviewPort';
import { AppVaultPreviewAdapter } from './AppVaultPreviewAdapter';

export function composeVaultPreview(app: App): VaultPreviewPort {
	return new AppVaultPreviewAdapter(app);
}
