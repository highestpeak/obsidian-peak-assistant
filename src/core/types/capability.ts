// Capability contract seed — T1 in the architecture modernization plan.
//
// A CapabilityManifest describes ONE product capability (e.g. "review the
// current document", "vault search") as data. It does not run anything by
// itself; a CapabilityRunner (T4, Wave 3.B) will read manifests, pick a
// backend, and dispatch. Until then, this type + fixtures serve as the
// design lock.
//
// Vocabulary note:
//   - `id` (this file) is the *contract* identifier, e.g. 'doc.review.current'
//     or 'vault.search'. Stable, machine-readable, referenced by RunSession
//     .capabilityId and by SkillManifest.
//   - `CapabilityName` from src/service/capabilities/SurfaceCapability.ts is
//     the *user-facing* label ('Conversation', 'Research', ...). The two
//     namespaces stay separate: one is code, one is UI copy.
//   - `CapabilitySurfaceId` (this file) duplicates the closed set of surface
//     ids that also lives in `service/capabilities/SurfaceCapability.ts`.
//     The duplication is deliberate: `core/` MUST NOT depend on `service/`.
//     Both sets are locked by shape-guard tests; if a new surface is added,
//     both files change in the same PR.
//
// Layering rule (checked by test/capability-manifest-shape.test.ts):
//   - This file MUST NOT import from `@/service/*`, `@/app/*`, `@/ui/*`, or
//     `obsidian`. It is a pure-type module.
//
// See docs/superpowers/specs/2026-07-02-architecture-modernization-completion-plan.md
// §Wave 1.B for the design rationale.

/**
 * Surface id — mirrors service/capabilities/SurfaceCapability.SurfaceId.
 * Duplicated in core because core cannot import from service. Adding a new
 * surface requires updating both files in the same PR.
 */
export type CapabilitySurfaceId =
	| 'chat'
	| 'vault-search'
	| 'ai-analysis'
	| 'copilot'
	| 'web-chat'
	| 'composer';

/**
 * Permission required by a capability. Aligns with the harness
 * `permissionMode` vocabulary so a future CapabilityRunner can map this
 * directly to backend policy.
 */
export type PermissionKind = 'read' | 'acceptEdits' | 'bypassPermissions';

/**
 * Cost tier the capability targets. Drives model / backend selection.
 * `fast` = cheap+quick lookups, `deep` = long-context reasoning,
 * `premium` = top-of-line reasoning (e.g. Opus-class).
 */
export type CostTier = 'fast' | 'deep' | 'premium';

/**
 * Backend that will physically execute a run.
 * adding a new entry here is a breaking change and requires handbook edit.
 */
export type BackendKind = 'hermes-harness' | 'provider-direct';

/**
 * Policy for picking a backend. Runtime executes only `preferred` and fails
 * loudly when it is unavailable. `fallback` is retained as declarative legacy
 * metadata and is never consulted by the production resolver.
 */
export interface BackendPolicy {
	readonly preferred: BackendKind;
	readonly fallback: readonly BackendKind[];
}

/**
 * Reference to a Skill by its stable id. The compiled skill (T6) resolves
 * this at run-time and enforces the allowed-tools quarantine.
 */
export type SkillRef = string;

/**
 * Minimal input/output shape descriptor. Kept as JSON-shaped structural
 * hint rather than a runtime schema (Zod, valibot, …) so this file has
 * zero non-type imports. When T4 runner lands, it may co-locate a runtime
 * schema alongside; the two must not shape-drift.
 */
export interface CapabilityContractShape {
	readonly kind: 'object' | 'string' | 'array' | 'custom';
	readonly description: string;
	readonly fields?: Readonly<Record<string, string>>;
}

/**
 * Full capability contract. Every field is required — partial manifests
 * are a design smell (see spec §Cross-Cutting Rules "No Dual System").
 */
export interface CapabilityManifest {
	readonly id: string;
	readonly title: string;
	readonly description: string;

	readonly inputContract: CapabilityContractShape;
	readonly outputContract: CapabilityContractShape;

	readonly permissionKind: PermissionKind;
	readonly costTier: CostTier;
	readonly backendPolicy: BackendPolicy;

	readonly skillRef: SkillRef;
	readonly surfaceBinding: readonly CapabilitySurfaceId[];
}
