// T2 Port Sketches — ProviderPort.
//
// Read-only view of the provider registry so the harness, T4
// CapabilityRunner, and observability surfaces can depend on a narrow
// interface instead of the concrete `MultiProviderChatService` class.
//
// Scope of this port (intentionally narrow, mirrors `ToolPort`'s
// read-only carve-out):
//   - `hasProvider(id)`   — does a provider by this id exist / enabled?
//   - `listProviders()`   — snapshot of every enabled provider (meta).
//   - `getProviderMeta(id)` — fetch one provider's metadata.
//
// Explicitly OUT of this port (kept on concrete class for now):
//   - Streaming / completion invocation. The runner's caller-supplied
//     `execute` function owns that surface; the port stays pure-info.
//   - Provider registration / mutation. Registration is composition
//     work, not read work.
//
// Boundary discipline: this file MUST NOT import runtime code from
// service/*, app/*, ui/*, or `obsidian`. Uses only `ProviderMetaData`
// from `@/core/providers/types` (already core).

import type { ProviderMetaData } from '@/core/providers/types';

/**
 * Enrichment on top of `ProviderMetaData` used by the port —
 * indicates whether a provider is *ready* (has credentials, not
 * disabled) so callers don't need to reach into a settings object.
 */
export interface ProviderInfo extends ProviderMetaData {
	/** True when the provider can currently accept requests. */
	readonly ready: boolean;
}

/**
 * Read-only view of the LLM provider registry. Concrete implementations
 * (currently `MultiProviderChatService`) provide additional streaming /
 * completion methods; consumers that only need to *look up* which
 * providers exist depend on this narrower shape.
 */
export interface ProviderPort {
	/** True when a provider with `id` is registered and enabled. */
	hasProvider(id: string): boolean;
	/** Snapshot of every registered provider, in registration order. */
	listProviders(): ProviderInfo[];
	/** Fetch one provider's metadata; undefined if not registered. */
	getProviderInfo(id: string): ProviderInfo | undefined;
}
