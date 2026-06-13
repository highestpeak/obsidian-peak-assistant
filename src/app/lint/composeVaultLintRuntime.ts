// T6/T7 Vault Lint Ports — runtime composition.
//
// This file is the ONE place that wires app-shell singletons
// (`AppContext`, `sqliteStoreManager`) and Obsidian-bound helpers
// (semantic neighbor search, graph repos) into the engine's ports. It
// runs from `main.onload` after sqlite is initialized. Everything
// below this line is allowed to reach `AppContext`, `sqliteStoreManager`
// or `getSemanticNeighbors`; everything above it (the engine, the
// runner, the detectors, the contract) is not.
//
// T6R returns a fully-constructed `VaultLintRuntime` that `main.ts`
// stores via `AppContext.setVaultLintRuntime(...)` on the app-owned
// `AppRuntimeRegistry`. Consumers read it via
// `AppContext.getVaultLintRuntime()` or React `ServiceContext`.
// T7 adds the detector context adapter alongside the existing
// vault/config/persistence adapters.

import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { VaultLintService } from '@/service/lint/VaultLintService';
import { DEFAULT_VAULT_LINT_CONFIG } from '@/service/lint/config/VaultLintDefaults';
import type { VaultLintRuntime } from '@/service/lint/VaultLintRuntime';
import type { VaultLintPorts } from '@/service/lint/ports/VaultLintPorts';
import { InMemoryDetectorRegistry } from '@/service/lint/runtime/InMemoryDetectorRegistry';
import { DefaultVaultLintIdFactory } from '@/service/lint/runtime/defaultIdFactory';
import { DefaultVaultLintClock } from '@/service/lint/runtime/defaultClock';
import { ObsidianVaultLintConfigAdapter } from './ObsidianVaultLintConfigAdapter';
import { ObsidianVaultLintVaultAdapter } from './ObsidianVaultLintVaultAdapter';
import { ObsidianVaultLintDetectorContextAdapter } from './ObsidianVaultLintDetectorContextAdapter';
import { SqliteVaultLintPersistenceAdapter } from './SqliteVaultLintPersistenceAdapter';

export function composeVaultLintRuntime(): VaultLintRuntime {
	const detectorRegistry = new InMemoryDetectorRegistry();
	// One-shot init at boot: registers built-in detectors with
	// DEFAULT_VAULT_LINT_CONFIG so consumers like `VaultDigestService`
	// can deserialize cached scan findings without first triggering a
	// scan. The engine also calls `ensureInitialized` defensively at
	// the start of each scan; that call is idempotent.
	detectorRegistry.ensureInitialized(DEFAULT_VAULT_LINT_CONFIG);

	const ports: VaultLintPorts = {
		config: new ObsidianVaultLintConfigAdapter(),
		vault: new ObsidianVaultLintVaultAdapter(),
		persistence: new SqliteVaultLintPersistenceAdapter(
			sqliteStoreManager.getVaultLintRepo(),
		),
		detectorRegistry,
		detectorContext: new ObsidianVaultLintDetectorContextAdapter(),
		idFactory: new DefaultVaultLintIdFactory(),
		clock: new DefaultVaultLintClock(),
	};

	return new VaultLintService(ports);
}
