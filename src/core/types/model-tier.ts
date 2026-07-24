// Three-tier model routing primitive. Extracted to core so that
// `core/ports/*` (e.g. ToolPort) can reference the tier vocabulary
// without inverting the layering.
//
// Full tier machinery (bindings, policy, capabilities, defaults) stays
// in `service/agents/harness/tier/types.ts` — those types depend on
// runtime concerns (Vercel AI SDK `LanguageModel`) that belong in
// service/. This file exports only the identifier union.

// Product-facing "model slot" vocabulary — one name per configurable model
// binding, aligned 1:1 with the Settings → AI Setup rows. This is the single
// vocabulary every consumer resolves against (via `ProfileRegistry.resolveSlot`),
// replacing the older split between harness tiers and ProfileRegistry roles
// (agent-fast/agent/chat) and the misleading `local-*` tier prefix (the
// "local-deep" tier is routinely bound to a cloud model).
//
//   fast           ← Fast Lookup      (cascade tier)
//   research       ← Research         (cascade tier — the deep-work workhorse)
//   stronger       ← Use stronger …   (cascade tier — escalation target)
//   conversation   ← Conversation     (chat; also stronger's fallback)
//   knowledgeIndex ← Knowledge Index  (embedding)
export type ModelSlot = 'fast' | 'research' | 'stronger' | 'conversation' | 'knowledgeIndex';

// The three slots that double as the harness cascade tiers (fast → research →
// stronger). The tier axis is exactly this subset of the slot axis, so tier
// identifiers ARE slot identifiers — no more separate local-fast/local-deep/
// online vocabulary to reconcile.
export type ModelTier = 'fast' | 'research' | 'stronger';

/** @deprecated alias kept for readability at call sites; identical to ModelTier. */
export type TierSlot = ModelTier;
