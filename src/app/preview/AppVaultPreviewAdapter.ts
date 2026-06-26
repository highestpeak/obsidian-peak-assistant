// T11N: Concrete Obsidian implementation of `VaultPreviewPort`. This is
// the ONLY place that closes over `app.vault.readBinary` /
// `app.vault.read` / `app.vault.getResourcePath` for the streamdown /
// chat-attachment hover-preview surface.
//
// Constructed at boot inside `AppContext` (see
// `src/app/preview/composeVaultPreview.ts`) and published through
// `ReactElementFactory` -> `ServiceProvider` -> `useServiceContext().vaultPreview`.

import type { App, TFile } from 'obsidian';
import type { VaultPreviewPort } from '@/service/preview/VaultPreviewPort';

function isFile(f: unknown): f is TFile {
	return !!f && typeof f === 'object' && 'extension' in (f as Record<string, unknown>);
}

export class AppVaultPreviewAdapter implements VaultPreviewPort {
	constructor(private readonly app: App) {}

	async readBinary(path: string): Promise<ArrayBuffer | null> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!isFile(file)) return null;
		return this.app.vault.readBinary(file);
	}

	async readText(path: string): Promise<string | null> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!isFile(file)) return null;
		return this.app.vault.read(file);
	}

	getResourcePath(path: string): string | null {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!isFile(file)) return null;
		return this.app.vault.getResourcePath(file);
	}
}
