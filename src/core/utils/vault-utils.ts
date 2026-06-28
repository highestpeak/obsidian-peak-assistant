// T11R Phase 2: obsidian-binding vault helpers moved to
// `@/app/vault/vault-helpers`. Only pure path helpers stay re-exported
// from this location so legacy import paths keep resolving for the
// path-only callers.
//
// Callers (app/ui): import from `@/app/vault/vault-helpers`.
// Callers (service): receive the operation through {@link VaultWriterPort}
// / {@link VaultLookupPort}.
export { joinPath, getAbsolutePath, getRelativePath, normalizeVaultPath } from './path-utils';
