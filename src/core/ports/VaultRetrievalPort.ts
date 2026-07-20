/**
 * Port for real Vault retrieval from the chat tool layer (chat-studio RUN-01).
 *
 * The concrete adapter wraps the app-owned SearchClient and is wired at the
 * app layer (main.ts) after SearchClient init — the service layer never
 * imports SearchClient directly. When this port is absent the Vault Search
 * switch must render unavailable; the UI may not pretend retrieval happened.
 */

export interface VaultRetrievalHit {
	id: string;
	path: string;
	title: string;
	snippet?: string;
}

export interface VaultRetrievalPort {
	search(query: string, opts?: { topK?: number; scopeFolder?: string }): Promise<VaultRetrievalHit[]>;
}
