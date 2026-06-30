// T6 Vault Lint Ports — Obsidian-backed vault adapter.
//
// The Vault Lint engine only needs the markdown file count at scan
// time. The full `App.vault.getMarkdownFiles()` array is not exposed:
// growing this port requires real engine demand, not speculation.

import { AppContext } from '@/app/context/AppContext';
import type { VaultLintVaultPort } from '@/core/ports/VaultLintPorts';

export class ObsidianVaultLintVaultAdapter implements VaultLintVaultPort {
	getMarkdownFileCount(): number {
		return AppContext.getInstance().app.vault.getMarkdownFiles().length;
	}
}
