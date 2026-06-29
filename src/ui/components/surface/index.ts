/**
 * Surface grammar — cross-screen UI primitives one layer above
 * src/ui/components/primitives. Pure display layer: React + lucide +
 * primitives + display utils only. No imports from @/app, @/service,
 * obsidian, AppContext, Zustand store writes, or new Notice.
 *
 * Real consumers and the migrations that justify each export are listed
 * in T11X-B implementation note (docs/superpowers/refactor-ops/).
 */
export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';
