// T6 Vault Lint Ports — Obsidian-backed config adapter.
//
// Wraps the existing `TemplateManager.loadJson<VaultLintConfig>` lookup.
// Returns `null` when the template is missing or fails to parse — the
// engine merges that with `DEFAULT_VAULT_LINT_CONFIG`. This adapter
// lives in `src/app/` because reaching `AppContext.getInstance` is now
// reserved to the app layer; the service layer must not touch it.

import { AppContext } from '@/app/context/AppContext';
import { ConfigTemplateId } from '@/core/template/TemplateRegistry';
import type { VaultLintConfigPort } from '@/service/lint/ports/VaultLintPorts';
import type { VaultLintConfig } from '@/service/lint/types';

export class ObsidianVaultLintConfigAdapter implements VaultLintConfigPort {
	async loadConfig(): Promise<Partial<VaultLintConfig> | null> {
		try {
			const templateManager = AppContext.getInstance().manager.getTemplateManager?.();
			if (!templateManager) return null;
			const parsed = await templateManager.loadJson<Partial<VaultLintConfig>>(
				ConfigTemplateId.VaultLintConfig,
			);
			return parsed ?? null;
		} catch {
			// Template missing or invalid JSON — engine uses defaults.
			return null;
		}
	}
}
