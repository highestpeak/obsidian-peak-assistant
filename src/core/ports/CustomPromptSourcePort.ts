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
}

/**
 * Source of parsed custom prompt definitions. Implementations decide
 * where to scan (vault folder, plugin bundle, remote registry); callers
 * only see parsed defs.
 */
export interface CustomPromptSourcePort {
	loadAll(): Promise<CustomPromptDefShape[]>;
}
