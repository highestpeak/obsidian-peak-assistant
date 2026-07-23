/**
 * T11I (2026-06-26): vault-write port for analysis-doc persistence.
 *
 * `persistSessionToVault` previously reached into
 * `@/ui/view/quick-search/callbacks/save-ai-analyze-to-md` to perform
 * AppContext + Obsidian Vault writes. That coupled service to UI and
 * UI to Obsidian internals. This port lets the service ask "create this
 * markdown file" / "overwrite this markdown file" without knowing about
 * `AppContext`, `app.vault.create`, `TFile`, folder normalization, or
 * filename sanitization — those live in the app-layer adapter
 * (`src/app/search/AppAnalysisDocVaultWriterAdapter.ts`).
 *
 * Rules:
 * - There is no module-level default writer in this file. Callers must
 *   explicitly construct + pass an adapter. This keeps `persistSessionToVault`
 *   honest: missing the writer is a compile error, not a runtime fallback.
 * - Path normalization, ensureFolder, filename sanitization, and the
 *   collision-suffix rule are adapter concerns. The port speaks in
 *   intent, not vault primitives.
 */

import type { AiAnalysisStoreVaultAdapter } from '@/core/storage/vault/search-docs/AiAnalysisJsonStore';

/**
 * Extends `AiAnalysisStoreVaultAdapter` so the same app-layer adapter serves
 * both the (legacy, explicit-export) Markdown writes and the JSON-store
 * primitives (`ensureFolder` / `exists` / `create` / `read` / `listJsonPaths`)
 * that `persistSessionToVault` now drives via `AiAnalysisJsonStore`.
 */
export interface AnalysisDocVaultWriterPort extends AiAnalysisStoreVaultAdapter {
	/**
	 * Create a new markdown file inside the given folder. The adapter
	 * normalizes the folder path, ensures the folder exists, sanitizes
	 * the filename, appends a `.md` extension, and applies a
	 * timestamp-suffix on collision. Returns the final vault-relative
	 * path the file was created at.
	 */
	createDoc(input: {
		folderPath: string;
		fileName: string;
		content: string;
	}): Promise<{ path: string }>;

	/**
	 * Overwrite the existing markdown file at the given vault-relative
	 * path. Silent no-op if the file does not exist (matches the legacy
	 * behavior of `persistAnalysisDocToPath`).
	 */
	overwriteDoc(path: string, content: string): Promise<void>;
}
