// Three-tier model routing primitive. Extracted to core so that
// `core/ports/*` (e.g. ToolPort) can reference the tier vocabulary
// without inverting the layering.
//
// Full tier machinery (bindings, policy, capabilities, defaults) stays
// in `service/agents/harness/tier/types.ts` — those types depend on
// runtime concerns (Vercel AI SDK `LanguageModel`) that belong in
// service/. This file exports only the identifier union.

export type ModelTier = 'local-fast' | 'local-deep' | 'online';
