/**
 * Narrow app-owned handoff for opening the production Quick Search from UI
 * surfaces (chat-studio §6.2 L-SEARCH-01/02).
 *
 * UI never reaches for the raw plugin or command registry — the app layer
 * composes this port from PeakCommandActions + the real hotkey binding.
 * `hotkeyHint()` returns null when no binding exists (no fake ⌘K badges).
 */
export type QuickSearchAIWorkspaceMode = 'search' | 'graph' | 'vault-intelligence';

export interface QuickSearchGraphCreateOrigin {
	surface: 'ai-search' | 'file-atlas' | 'composer' | 'vault-search' | 'chat-studio';
	contextRef: {
		kind: 'search-query' | 'vault-file' | 'vault-selection' | 'atlas-file' | 'conversation' | 'project';
		ref: string;
		label: string;
		locator?: string;
	};
}

export interface QuickSearchOpenOptions {
	/**
	 * Omitted means a normal open and therefore AI Search. Explicit intents are
	 * allowed to restore a low-frequency workspace without making it sticky.
	 */
	aiMode?: QuickSearchAIWorkspaceMode;
	/** Opens the canonical persisted artifact after the graph workspace mounts. */
	graphId?: string;
	/** Optional immutable version deep link; omitted means the current head. */
	graphVersionId?: string;
	/** Context applied only if this modal creates a new graph. */
	graphCreateOrigin?: QuickSearchGraphCreateOrigin;
	/** Vault inputs prepared by a document-adjacent adapter. */
	selectedVaultPaths?: string[];
	/** Optional query restored by an explicit history/origin jump. */
	initialQuery?: string;
}

export interface QuickSearchLauncherPort {
	open(options?: QuickSearchOpenOptions): void;
	hotkeyHint(): string | null;
}
