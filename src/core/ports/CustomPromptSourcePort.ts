// T11Y-7d: shared read port for custom prompt definitions.
//
// Custom prompts are user-authored markdown files that consumers
// (Copilot action runtime today; potentially others) load and parse.
// Before T11Y-7d the contract lived inside `CopilotCustomPromptPort`
// next to the action runtime, which conflated "find user prompts on
// disk" with "compose them into action definitions". The port now sits
// in `src/core/ports/` so other consumers can take it without
// importing Copilot-action types.
//
// `CustomPromptDefShape` mirrors the parsed-def fields the source
// produces. The richer `CustomPromptDef` in
// `@/service/copilot/CustomPromptRegistry` is structurally compatible
// with this shape (extends optional callbacks for action building) and
// the service-side type is kept as the single live definition. The
// port stays free of any service-layer import so the core boundary
// scan stays clean.

export interface CustomPromptDefShape {
	id: string;
	label: string;
	description: string;
	category: 'document' | 'vault' | 'writing';
	template: string;
	filePath: string;
	/** Optional action-local model within the active provider profile. */
	modelId?: string;
}

/**
 * Source of parsed custom prompt definitions. Implementations decide
 * where to scan (vault folder, plugin bundle, remote registry); callers
 * only see parsed defs.
 */
export interface CustomPromptSourcePort {
	loadAll(): Promise<CustomPromptDefShape[]>;

	/**
	 * Observe source changes that can alter the parsed definition list.
	 *
	 * A source may not be live (for example, a static test fixture), so
	 * consumers must treat this as optional. Live adapters must return an
	 * idempotent cleanup function that releases every host subscription.
	 */
	watch?(onChange: () => void): () => void;
}

/**
 * A writable owner for Custom Prompt definitions. The read/watch contract
 * above stays deliberately small because most consumers only need a catalog;
 * the Control Center receives this extension from the app-owned Vault adapter.
 */
export interface CustomPromptEditorPort extends CustomPromptSourcePort {
	create(input: {
		label: string;
		description?: string;
		category?: CustomPromptDefShape['category'];
		template: string;
		modelId?: string;
	}): Promise<CustomPromptDefShape>;
	update(input: {
		filePath: string;
		label: string;
		description?: string;
		category?: CustomPromptDefShape['category'];
		template: string;
		modelId?: string;
	}): Promise<CustomPromptDefShape>;
	delete(filePath: string): Promise<void>;
}
