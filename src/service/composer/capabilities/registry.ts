/**
 * Peak Composer — capability registry (WP3, spec §6/§12).
 *
 * Stable-ID storage for registered Composer capability definitions plus the
 * registration-time validation gate. Registration is explicit at app
 * composition (packs are passed in); there is NO self-registering global
 * singleton — the app layer owns the instance (runtime-ownership rule).
 *
 * Validation failures (spec §12) are thrown at registration so a broken pack
 * can never half-project into the UI:
 *   - duplicate capability id/version;
 *   - missing input/result schema;
 *   - a model capability without PromptId / prompt-variable builder;
 *   - a mutation-producing capability without a writeback adapter id;
 *   - a capability bound to Composer without 'composer' in its surface binding;
 *   - empty surfaces / target kinds / renderer id.
 *
 * `validateBindings` is the second gate run after materializers and writeback
 * adapters are composed: every definition's result kind must have a
 * materializer and every declared adapter id must resolve.
 */

import type {
	ComposerCapabilityDefinition,
	ComposerCapabilityPack,
} from '@/core/composer';
import type { ComposerCapabilitiesConfigProvider } from './capabilityConfig';
import { resolvePresentation } from './capabilityConfig';
import type { ComposerResultMaterializerRegistry } from './resultMaterializers';
import type { ComposerWritebackAdapterRegistry } from './writebackAdapters';

const MODEL_BACKED_MODES = new Set(['model-stream', 'agent', 'media-generation', 'hybrid']);

function validateDefinition(def: ComposerCapabilityDefinition): void {
	const id = def.manifest?.id;
	if (!id) throw new Error('composer capability registration: manifest.id is required');
	const where = `capability '${id}'`;
	if (!def.version) throw new Error(`${where}: version is required`);
	if (!def.configKey) throw new Error(`${where}: configKey is required`);
	if (!def.surfaces || def.surfaces.length === 0) throw new Error(`${where}: at least one surface is required`);
	if (!def.targetKinds || def.targetKinds.length === 0) throw new Error(`${where}: at least one target kind is required`);
	if (!def.inputSchema || typeof def.inputSchema.parse !== 'function') {
		throw new Error(`${where}: inputSchema (RuntimeSchema) is required`);
	}
	if (!def.resultSchema || typeof def.resultSchema.parse !== 'function') {
		throw new Error(`${where}: resultSchema (RuntimeSchema) is required`);
	}
	if (!def.rendererId) throw new Error(`${where}: rendererId is required`);
	if (!def.manifest.surfaceBinding.includes('composer')) {
		throw new Error(`${where}: manifest.surfaceBinding must include 'composer'`);
	}
	if (MODEL_BACKED_MODES.has(def.executionMode)) {
		if (!def.promptId) throw new Error(`${where}: model-backed capability requires a promptId`);
		if (typeof def.buildPromptVariables !== 'function') {
			throw new Error(`${where}: model-backed capability requires buildPromptVariables()`);
		}
	}
	if (def.effectKind !== 'analyze' && !def.writebackAdapterId) {
		throw new Error(`${where}: mutation-producing capability requires a writebackAdapterId`);
	}
}

export class ComposerCapabilityRegistry {
	private readonly definitions = new Map<string, ComposerCapabilityDefinition>();

	constructor(private readonly config: ComposerCapabilitiesConfigProvider) {}

	registerPack(pack: ComposerCapabilityPack): void {
		for (const def of pack.definitions()) this.register(def);
	}

	register(def: ComposerCapabilityDefinition): void {
		validateDefinition(def);
		const key = def.manifest.id;
		const existing = this.definitions.get(key);
		if (existing) {
			throw new Error(
				`composer capability '${key}' (v${def.version}) already registered (v${existing.version})`,
			);
		}
		this.definitions.set(key, def);
	}

	getById(id: string): ComposerCapabilityDefinition | null {
		return this.definitions.get(id) ?? null;
	}

	require(id: string): ComposerCapabilityDefinition {
		const def = this.definitions.get(id);
		if (!def) throw new Error(`unknown composer capability '${id}'`);
		return def;
	}

	/**
	 * All definitions in STABLE order: presentation `order` ascending, then
	 * capability id — independent of registration order (spec §15.1).
	 */
	list(): ComposerCapabilityDefinition[] {
		const config = this.config();
		return [...this.definitions.values()].sort((a, b) => {
			const pa = resolvePresentation(config, a.configKey, a.presentationFallback);
			const pb = resolvePresentation(config, b.configKey, b.presentationFallback);
			if (pa.order !== pb.order) return pa.order - pb.order;
			return a.manifest.id.localeCompare(b.manifest.id);
		});
	}

	size(): number {
		return this.definitions.size;
	}

	/**
	 * Cross-registry conformance gate (spec §12): every result kind must have a
	 * materializer; every declared writeback adapter id must resolve and accept
	 * the definition's result kind. Throws with the offending capability id.
	 */
	validateBindings(
		materializers: ComposerResultMaterializerRegistry,
		writebacks: ComposerWritebackAdapterRegistry,
	): void {
		for (const def of this.definitions.values()) {
			const where = `capability '${def.manifest.id}'`;
			if (!materializers.has(def.resultKind)) {
				throw new Error(`${where}: no result materializer registered for kind '${def.resultKind}'`);
			}
			if (!def.writebackAdapterId) continue;
			const adapter = writebacks.getById(def.writebackAdapterId);
			if (!adapter) {
				throw new Error(`${where}: writeback adapter '${def.writebackAdapterId}' is not registered`);
			}
			if (!adapter.resultKinds.includes(def.resultKind)) {
				throw new Error(
					`${where}: adapter '${def.writebackAdapterId}' does not accept result kind '${def.resultKind}'`,
				);
			}
		}
	}
}
