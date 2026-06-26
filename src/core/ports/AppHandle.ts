/**
 * Loosely-typed Obsidian app handle.
 *
 * Most service-tier callers used to type a constructor parameter as
 * `App` from `obsidian` solely to forward it deeper, or to call one
 * specific method (`app.vault.cachedRead`, `app.metadataCache.getFileCache`,
 * …). That single import attaches the entire `obsidian` API surface to
 * the file even when nothing else is used — the boundary audit then
 * (correctly) flags it.
 *
 * `AppHandle` is the escape hatch. It declares "this code uses some
 * subset of Obsidian's host runtime but does not want to spell the full
 * `App` shape." The trade-off is that callers lose IntelliSense for
 * `app.vault.X` chains — the type is intentionally permissive
 * (`Record<string, any>`), so any property access compiles. Leaf
 * adapters that need the strict `App` shape (e.g. `vaultMcpServer.ts`,
 * `sdkAgentPool.ts`) keep importing the real `App` directly.
 *
 * Do NOT use `AppHandle` as a generic dependency bag. If a file
 * genuinely needs multiple typed surfaces from the host runtime, prefer
 * a narrow port (e.g. `DocumentVaultReaderPort`, `AnalysisHistoryPort`).
 */
export type AppHandle = Record<string, any>;
