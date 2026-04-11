import { App, Vault } from 'obsidian';
import { AppContext } from '@/app/context/AppContext';

/**
 * Abstraction layer for vault access so core services can be decoupled from Obsidian runtime.
 */
export interface IVaultAccess {
	getApp(): App;
	getVault(): Vault;
}

export class ObsidianVaultAccess implements IVaultAccess {
	getApp(): App {
		return AppContext.getApp();
	}

	getVault(): Vault {
		return this.getApp().vault;
	}
}

export const defaultVaultAccess = new ObsidianVaultAccess();
