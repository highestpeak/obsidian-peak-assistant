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
	createFrontmatterCapabilityPack,
	createMathCapabilityPack,
	createTableCapabilityPack,
	createChartCapabilityPack,
	createMetadataFieldPatchMaterializer,
	createMetadataFieldPatchWritebackAdapter,
	createFormulaAnnotationMaterializer,
	createTablePatchMaterializer,
	createTablePatchWritebackAdapter,
	createChartSourceMaterializer,
	createChartSourceWritebackAdapter,
	registerImageResultMaterializers,
	registerImageWritebackAdapters,
	createNativeFilePatchMaterializer,
	createNativeFilePatchWritebackAdapter,
	loadComposerCapabilitiesConfig,
	DEFAULT_COMPOSER_CAPABILITIES_CONFIG,
	type ComposerCapabilitiesConfig,
	type ComposerCapabilityExecutorPort,
	type ComposerDocumentSession,
	type ComposerNativeFilePort,
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
	/**
	 * Native object file port for the Base/Canvas/Excalidraw structural-edit
	 * capabilities. Absent (a harness with no vault) ⇒ those actions project
	 * disabled and never write; every text/table/chart/image flow is unaffected.
	 */
	nativeFilePort?: ComposerNativeFilePort;
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
	// WP5 packs: frontmatter (AI property suggestion) + math (explain/split/variables).
	registry.registerPack(createFrontmatterCapabilityPack(configProvider));
	registry.registerPack(createMathCapabilityPack(configProvider));
	// WP6 packs: table AI (summarize / add-column / check-units / extract-formula)
	// + chart (generate-chart). Both emit typed JSON results (table-patch /
	// chart-source) with their own materializers + writeback adapters below.
	registry.registerPack(createTableCapabilityPack(configProvider));
	registry.registerPack(createChartCapabilityPack(configProvider));

	const materializers = createDefaultResultMaterializers();
	materializers.register(createMetadataFieldPatchMaterializer());
	materializers.register(createFormulaAnnotationMaterializer());
	materializers.register(createTablePatchMaterializer());
	materializers.register(createChartSourceMaterializer());
	const writebacks = createDefaultWritebackAdapters();
	writebacks.register(createMetadataFieldPatchWritebackAdapter());
	writebacks.register(createTablePatchWritebackAdapter());
	writebacks.register(createChartSourceWritebackAdapter());
	// WP7 — image annotation (caption) + layout typed results. The image flows are
	// coordinated by ImageCapabilityCoordinator (not a registry pack), but their
	// materializer/writeback pair joins the shared registries so any dispatch by
	// `image-annotation-patch` / `image-layout-patch` result kind resolves.
	registerImageResultMaterializers(materializers);
	registerImageWritebackAdapters(writebacks);
	// WP-INT — native structural edits (Base/Canvas/Excalidraw). The materializer
	// applies a model-emitted typed patch through the WP8 functions; the writeback
	// is a no-op marker (the real write is the revision-guarded native-file port on
	// accept). Registered so validateBindings sees a complete native-file-patch chain.
	materializers.register(createNativeFilePatchMaterializer());
	writebacks.register(createNativeFilePatchWritebackAdapter());
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
				...(options.nativeFilePort ? { nativeFilePort: options.nativeFilePort } : {}),
			}),
	};
}
