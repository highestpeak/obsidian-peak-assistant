/**
 * Peak Composer — capability runtime composition (WP3, spec §6.1/§12).
 *
 * The single place that assembles the Composer capability runtime: registry
 * (packs registered explicitly), result materializers, writeback adapters,
 * executor adapter and config. The factory is held by the app-owned
 * {@link DocumentComposerRuntime} (itself a slot on `AppRuntimeRegistry`), so
 * runtime ownership stays in the app composition path — no service-side
 * singleton, no `AppContext.getInstance()` inside service code.
 *
 * Per open document, `forDocument(session, hub)` produces the
 * {@link ComposerCapabilityDocumentRuntime} that implements BOTH the frozen
 * `ComposerCapabilityProjectionPort` (the editing chrome's port — the
 * integration pass swaps `stubComposerCapabilityProjection` for this) and the
 * `ComposerCandidateRuntimePort` the candidate UI consumes.
 */

import { AppContext } from '@/app/context/AppContext';
import type { IAgentPrompter } from '@/core/llm/IAgentPrompter';
import {
	ComposerCapabilityDocumentRuntime,
	ComposerCapabilityRegistry,
	createDefaultResultMaterializers,
	createDefaultWritebackAdapters,
	createLinkCapabilityPack,
	createNativeCapabilityPack,
	createProseCapabilityPack,
	loadComposerCapabilitiesConfig,
	DEFAULT_COMPOSER_CAPABILITIES_CONFIG,
	type ComposerCapabilitiesConfig,
	type ComposerCapabilityExecutorPort,
	type ComposerDocumentSession,
	type ComposerTransactionHub,
} from '@/service/composer';
import { ComposerAiExecutorAdapter } from './ComposerAiExecutorAdapter';

export interface ComposerCapabilityRuntimeFactory {
	/** Build the capability runtime bound to one open document. */
	forDocument(
		session: ComposerDocumentSession,
		hub: ComposerTransactionHub,
	): ComposerCapabilityDocumentRuntime;
}

export interface ComposeComposerCapabilityRuntimeOptions {
	/** Test seam — defaults to the production AI executor adapter. */
	executor?: ComposerCapabilityExecutorPort;
	/** Test seam — defaults to lazy AppContext resolution. */
	resolvePrompter?: () => IAgentPrompter;
}

export function composeComposerCapabilityRuntime(
	options: ComposeComposerCapabilityRuntimeOptions = {},
): ComposerCapabilityRuntimeFactory {
	// Config loads asynchronously (same contract as the transaction config):
	// runtimes created before it lands use the compiled default, which is
	// drift-guarded against the JSON by the registry test.
	let config: ComposerCapabilitiesConfig = DEFAULT_COMPOSER_CAPABILITIES_CONFIG;
	void loadComposerCapabilitiesConfig().then((loaded) => {
		config = loaded;
	});
	const configProvider = () => config;

	const registry = new ComposerCapabilityRegistry(configProvider);
	registry.registerPack(createProseCapabilityPack(configProvider));
	// WP8 — native objects (mermaid / code AI edits) + link tidy. Both packs ride
	// the text-patch rail, so the default materializer/adapter set covers them.
	registry.registerPack(createNativeCapabilityPack(configProvider));
	registry.registerPack(createLinkCapabilityPack(configProvider));

	const materializers = createDefaultResultMaterializers();
	const writebacks = createDefaultWritebackAdapters();
	registry.validateBindings(materializers, writebacks);

	const executor =
		options.executor ??
		new ComposerAiExecutorAdapter(
			options.resolvePrompter ?? (() => AppContext.getInstance().manager),
		);

	return {
		forDocument: (session, hub) =>
			new ComposerCapabilityDocumentRuntime({
				registry,
				config: configProvider,
				executor,
				materializers,
				writebacks,
				session,
				hub,
			}),
	};
}
