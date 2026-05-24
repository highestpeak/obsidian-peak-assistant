/**
 * Curator agent — picks model bindings for the three capability tiers.
 *
 * Public surface: import everything from this barrel.
 */

export * from './types';
export { runCurator, resolveBootstrap } from './CuratorAgent';
export type { BootstrapBinding, RunCuratorOptions } from './CuratorAgent';
export { loadCuratorCatalog, hydrateCatalog, lookupModel, getCatalog, isCatalogLoaded, filterByTier, listModelIds } from './catalog';
export type { CatalogEntry, CatalogFile, LatencyClass } from './catalog';
export { detectEnvironment, summarizeEnvironment, summarizePreferences } from './envProbe';
export { validateRecommendation, hardErrors, formatErrorsForLLM, summarizeForUI } from './validation';
export { buildFallbackRecommendation } from './fallback';
export { buildCuratorPrompt, CURATOR_SYSTEM_PROMPT } from './prompt';
export { RecommendationSchema } from './schema';
