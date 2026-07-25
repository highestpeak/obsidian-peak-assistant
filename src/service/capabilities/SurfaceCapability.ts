/**
 * Surface capability readiness contract.
 *
 * Each UI surface (Chat, Vault Search, AI Analysis, Copilot, Web-enabled Chat)
 * exposes one or more capabilities via getCapabilityStatus(). Settings consumes
 * these to render the readiness table without knowing each surface's internals.
 *
 * User-facing capability vocabulary is fixed (Conversation / Research /
 * Knowledge Index / Fast Lookup / Web Access / Safety). Do NOT add internal
 * terminology (harness, tiers, embedding model names, MCP) here.
 */

/** User-facing capability names. Closed set — extend with care. */
export type CapabilityName =
	| 'Conversation'
	| 'Research'
	| 'Fast Lookup'
	| 'Knowledge Index'
	| 'Web Access'
	| 'Safety';

/** Readiness state. Mirrors the chip color: green/yellow/red/neutral. */
export type ReadinessStatus = 'ready' | 'needs-attention' | 'not-ready' | 'optional';

/** A surface's reported status for ONE capability. */
export interface CapabilityStatus {
	/** Which capability this status describes. */
	capability: CapabilityName;
	/** Current readiness — drives chip color in Settings. */
	status: ReadinessStatus;
	/**
	 * Short user-facing reason when status is not 'ready'.
	 * Examples: "Index is 3 days stale", "No Conversation model selected".
	 * Leave undefined when ready/optional.
	 */
	reason?: string;
	/**
	 * Repair affordance — Settings renders this as a CTA button.
	 * `label` is the button text ("Choose Conversation model"); `action` is invoked on click.
	 * Undefined when no repair is meaningful (e.g., optional + not-configured).
	 */
	repair?: {
		label: string;
		action: () => void | Promise<void>;
	};
}

/** Identifies which surface a capability belongs to. */
export type SurfaceId =
	| 'chat'
	| 'vault-search'
	| 'ai-analysis'
	| 'copilot'
	| 'web-chat'
	| 'composer';

/** Surfaces self-register adapters that report capability statuses. */
export interface SurfaceCapabilityAdapter {
	/** Which surface this adapter speaks for. */
	surfaceId: SurfaceId;
	/**
	 * Human-readable surface name (matches Settings IA).
	 * E.g. 'Chat', 'Vault Search', 'AI Analysis', 'Copilot', 'Web-enabled Chat'.
	 */
	surfaceLabel: string;
	/**
	 * Compute current status for every capability this surface depends on.
	 * Called by Settings on render and after settings changes.
	 * Should be cheap (synchronous reads of in-memory config); async I/O
	 * (e.g., index freshness check) should be debounced/cached by the adapter.
	 */
	getCapabilityStatus(): Promise<CapabilityStatus[]>;
}
