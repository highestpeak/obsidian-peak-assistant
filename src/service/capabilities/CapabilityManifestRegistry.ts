// T1 / T4 — CapabilityManifest registry.
//
// This is the "product capability" registry (Doc Review, Vault Search,
// Analysis Round, …). It is **separate** from `CapabilityRegistry` in
// this same directory — that one tracks surface *readiness* for the
// Settings pane (Conversation / Research / Fast Lookup / …). The two
// vocabularies stay apart on purpose: one is code (capability
// contracts), one is UI copy (readiness labels).
//
// Owned by the app layer via `AppRuntimeRegistry` (a slot for this
// registry will be added when the first callsite consumes it — the
// registry itself is a stateless-ish cache of manifests, safe to
// construct in the composition root).
//
// Public surface (deliberately small):
//   - `register(manifest)` — add or replace a manifest by id.
//   - `getById(id)`         — lookup; null when unknown.
//   - `getAll()`            — snapshot in registration order.
//   - `size()`              — count for header rendering.
//
// A CapabilityRunner (`runCapability` in this directory) reads the
// registry, resolves the skill via `SkillRegistry.compile`, and drives
// the backend the manifest's `backendPolicy` names.

import type { CapabilityManifest } from '@/core/types/capability';

export class CapabilityManifestRegistry {
	private manifests = new Map<string, CapabilityManifest>();

	register(manifest: CapabilityManifest): void {
		this.manifests.set(manifest.id, manifest);
	}

	getById(id: string): CapabilityManifest | null {
		return this.manifests.get(id) ?? null;
	}

	getAll(): CapabilityManifest[] {
		return [...this.manifests.values()];
	}

	size(): number {
		return this.manifests.size;
	}
}
