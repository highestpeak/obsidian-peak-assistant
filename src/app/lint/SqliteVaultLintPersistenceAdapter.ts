// T6 Vault Lint Ports — sqlite-backed persistence adapter.
//
// Wraps `VaultLintRepo`. The repo itself is constructed by
// `sqliteStoreManager` at boot; the adapter just delegates. Keeping
// this in the app layer means the engine never imports
// `sqliteStoreManager` or the repo type directly.

import type { VaultLintRepo } from '@/core/storage/sqlite/repositories/VaultLintRepo';
import type { VaultLintPersistencePort } from '@/core/ports/VaultLintPorts';
import type { LintDismissal, LintScanResult } from '@/service/lint/types';

export class SqliteVaultLintPersistenceAdapter implements VaultLintPersistencePort {
	constructor(private readonly repo: VaultLintRepo) {}

	loadActiveDismissals(): Promise<LintDismissal[]> {
		return this.repo.loadActiveDismissals();
	}

	getLastFullScanTimestamp(): Promise<number | null> {
		return this.repo.getLastFullScanTimestamp();
	}

	saveScanResult(result: LintScanResult): Promise<void> {
		return this.repo.saveScanResult(result);
	}

	loadLatestScan(): Promise<LintScanResult | null> {
		return this.repo.loadLatestScan();
	}
}
