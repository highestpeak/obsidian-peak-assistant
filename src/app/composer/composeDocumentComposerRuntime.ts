/**
 * Peak Composer — runtime composition (WP1).
 *
 * The single place that wires Obsidian adapters into the app-owned
 * {@link DocumentComposerRuntime}. Called from `main.onload`; the result is
 * bound on `AppRuntimeRegistry` via `setDocumentComposerRuntime` and released
 * in `onunload` via `clearDocumentComposerRuntime`.
 */

import type { App } from 'obsidian';
import {
	compileUncheckedTaskPattern,
	createComposerBlockDraftGenerationPort,
	ComposerSourceRevisionService,
	DEFAULT_IMAGE_DOMAIN_CONFIG,
	loadImageDomainConfig,
	type ImageDomainConfig,
} from '@/service/composer';
import { loadComposerTransactionConfig } from '@/ui/view/composer';
import { DEFAULT_SIDECAR_CONFIG, loadSidecarConfig, type SidecarConfig } from '@/ui/view/composer/sidecar/sidecarConfig';
import { AppContext } from '@/app/context/AppContext';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { modelRegistry } from '@/core/providers/model-registry';
import { getAIMediaFolder } from '@/core/config/folderPaths';
import type { DefaultDocumentView } from '@/core/composer';
import type { SearchClient } from '@/service/search/SearchClient';
import type { ProduceMediaInput, ProduceMediaOutcome } from '@/service/media/MediaGenerationService';
import {
	ObsidianComposerCommentPersistence,
	ObsidianComposerFileEventsAdapter,
	ObsidianComposerIntelligenceTelemetry,
	ObsidianComposerLinkMetadata,
	ObsidianComposerRelatedMaterials,
	ObsidianComposerSourceAdapter,
	ObsidianComposerVaultInventory,
	ObsidianComposerWriteAdapter,
} from './ObsidianComposerAdapters';
import {
	ComposerMediaImageEditAdapter,
	ObsidianComposerImageAttachmentAdapter,
	ObsidianComposerImageReferenceAdapter,
	type ComposerMediaProducer,
} from './ObsidianComposerImageAdapters';
import { DocumentComposerRuntime } from './DocumentComposerRuntime';
import { ComposerDocumentRouter } from './ComposerDocumentRouter';
import { ObsidianComposerWorkspaceStatePersistence } from './ObsidianComposerWorkspaceStatePersistence';
import { ObsidianComposerEmbedAnchorAdapter } from './ObsidianComposerEmbedAnchorAdapter';
import { ObsidianComposerNativeFileAdapter, ObsidianComposerNativePreviewAdapter } from './ObsidianNativeFileAdapter';
import { ObsidianComposerNativeEmbedRenderer } from './ObsidianComposerNativeEmbedRenderer';
import { composeComposerCapabilityRuntime } from './capabilities/composeComposerCapabilityRuntime';
import { ComposerAiExecutorAdapter } from './capabilities/ComposerAiExecutorAdapter';
import { createComposerFormulaDetailGenerator } from './capabilities/ComposerFormulaDetailGenerator';
import { createComposerImageTextAdapter } from './capabilities/ComposerImageTextAdapter';
import { NativeMarkdownIntelligenceModal } from './NativeMarkdownIntelligenceModal';
import { joinAdapterPath } from './ObsidianComposerDataStore';
import { loadComposerStorageConfig } from './ComposerStorageConfig';

const LEGACY_COMMENT_STORE_SUBDIR = 'composer-comments';
const LEGACY_TELEMETRY_SUBDIR = 'telemetry';
const LEGACY_WORKSPACE_STATE_SUBDIR = 'composer-state';
const LEGACY_WORKSPACE_STATE_FILE = 'composer-workspace-state.jsonl';
const LEGACY_TELEMETRY_FILE = 'composer-intelligence.jsonl';

/**
 * Read the active `SearchClient` if one is bound, else `null`. It is typed
 * non-null on `AppContext` but stays a null placeholder until the SQLite-backed
 * search service initializes (and on mobile), so the related-material port must
 * degrade rather than throw during that window.
 */
function safeGetSearchClient(): SearchClient | null {
	try {
		return AppContext.getSearchClient() ?? null;
	} catch {
		return null;
	}
}

/**
 * Resolve the media attachment folder for pasted / generated images. Honours the
 * user's `settings.ai.mediaAttachmentFolder` override, else the canonical
 * ChatFolder-scoped `<root>/Attachments/media` (shared with the media-generation
 * pipeline). Resolved lazily per call so a settings change takes effect without
 * recomposing the runtime.
 */
function resolveMediaAttachmentFolder(): string {
	const ai = AppContext.getSettings().ai;
	const override = ai?.mediaAttachmentFolder;
	if (typeof override === 'string' && override.trim().length > 0) return override.trim();
	return getAIMediaFolder(ai?.rootFolder ?? '');
}

/**
 * Lazy media producer for the composer AI 改图 flow. Reuses the ONE
 * `MediaGenerationService` composed at boot (shared adapter / job / receipt state
 * with the Chat `media_generate` tool); confirmations are bypassed because the
 * composer's own candidate review IS the user confirmation. Throws a real reason
 * (surfaced on the candidate card via `run-failed`) when media is not yet wired —
 * never a fake success.
 */
function composerMediaProducer(): ComposerMediaProducer {
	return {
		async produce(input: ProduceMediaInput): Promise<ProduceMediaOutcome> {
			const service = AppContext.getManager().conv.getMediaGenerationService?.();
			if (!service) {
				throw new Error('Media generation is not configured (Settings → AI → Media generation).');
			}
			return service.produce(input, { bypassConfirmation: true });
		},
	};
}

/**
 * Wire Obsidian adapters into the app-owned {@link DocumentComposerRuntime}.
 * Canonical machine data lives under `dataStoreDir`, never the plugin
 * installation/source directory. `legacyPluginDir` is read-only migration input.
 */
export interface ComposeDocumentComposerRuntimeOptions {
	legacyPluginDir?: string;
	getDefaultDocumentView(): DefaultDocumentView;
	setDefaultDocumentView(view: DefaultDocumentView): Promise<void>;
	getIntelligenceManualOpen(): boolean;
	setIntelligenceManualOpen(open: boolean): Promise<void>;
}

export async function composeDocumentComposerRuntime(
	app: App,
	dataStoreDir: string,
	options?: ComposeDocumentComposerRuntimeOptions,
): Promise<DocumentComposerRuntime> {
	const source = new ObsidianComposerSourceAdapter(app);
	const write = new ObsidianComposerWriteAdapter(app);
	const events = new ObsidianComposerFileEventsAdapter(app);
	const revisionService = new ComposerSourceRevisionService();
	const storage = await loadComposerStorageConfig();
	const commentBaseDir = joinAdapterPath(dataStoreDir, storage.commentsSubdir);
	const telemetryBaseDir = joinAdapterPath(dataStoreDir, storage.telemetrySubdir);
	const workspaceStateBaseDir = joinAdapterPath(dataStoreDir, storage.workspaceStateSubdir);
	const legacyPluginDir = options?.legacyPluginDir;
	const legacyCommentBaseDir = legacyPluginDir
		? joinAdapterPath(legacyPluginDir, LEGACY_COMMENT_STORE_SUBDIR)
		: undefined;
	const legacyWorkspaceStateFile = legacyPluginDir
		? joinAdapterPath(
				legacyPluginDir,
				LEGACY_WORKSPACE_STATE_SUBDIR,
				LEGACY_WORKSPACE_STATE_FILE,
			)
		: undefined;
	const legacyTelemetryFile = legacyPluginDir
		? joinAdapterPath(legacyPluginDir, LEGACY_TELEMETRY_SUBDIR, LEGACY_TELEMETRY_FILE)
		: undefined;
	let fallbackDefaultView: DefaultDocumentView = 'markdown';
	let fallbackIntelligenceManualOpen = false;
	const navigation = new ComposerDocumentRouter(app, {
		getDefaultView: options?.getDefaultDocumentView ?? (() => fallbackDefaultView),
		setDefaultView: options?.setDefaultDocumentView ?? (async (view) => {
			fallbackDefaultView = view;
		}),
		openIntelligenceCompanion: (filePath) => {
			new NativeMarkdownIntelligenceModal(AppContext.getInstance(), filePath).open();
		},
	});
	// One shared capability executor over the AI service (lazy prompter resolution,
	// so plugin boot order is a non-issue). It backs BOTH the candidate-runtime
	// capabilities AND the math block's bespoke formula-detail generator, so math
	// AI rides the one shared AI service rather than a separate provider path.
	const executor = new ComposerAiExecutorAdapter(() => AppContext.getInstance().manager);
	// WP7 image domain config (naming noise tokens / layout defaults / edit preset):
	// same async-load-with-fallback contract as the transaction / capabilities config.
	let imageConfig: ImageDomainConfig = DEFAULT_IMAGE_DOMAIN_CONFIG;
	void loadImageDomainConfig().then((loaded) => {
		imageConfig = loaded;
	});
	const imageConfigProvider = (): ImageDomainConfig => imageConfig;
	let sidecarConfig: SidecarConfig = DEFAULT_SIDECAR_CONFIG;
	void loadSidecarConfig().then((loaded) => {
		sidecarConfig = loaded;
	});
	const runtime = new DocumentComposerRuntime(source, write, events, revisionService, undefined, {
		navigation,
		intelligenceVisibilityPreference: {
			get: options?.getIntelligenceManualOpen ?? (() => fallbackIntelligenceManualOpen),
			set: options?.setIntelligenceManualOpen ?? (async (open) => {
				fallbackIntelligenceManualOpen = open;
			}),
		},
		workspaceStatePersistence: new ObsidianComposerWorkspaceStatePersistence(
			app,
			workspaceStateBaseDir,
			{
				fileName: storage.workspaceStateFile,
				legacyFilePath: legacyWorkspaceStateFile,
				compactionEventThreshold: storage.workspaceCompactionEventThreshold,
			},
		),
		commentPersistence: new ObsidianComposerCommentPersistence(
			app,
			commentBaseDir,
			legacyCommentBaseDir,
		),
		linkPort: new ObsidianComposerLinkMetadata(app),
		// WP9 §12.4 — related materials over the existing vector search (lazy client
		// resolution, degrades to empty before SQLite search initializes).
		relatedMaterials: new ObsidianComposerRelatedMaterials(safeGetSearchClient),
		// WP9 §12.7 — privacy-safe, bounded evaluation telemetry under DataStore.
		intelligenceTelemetry: new ObsidianComposerIntelligenceTelemetry(
			app,
			telemetryBaseDir,
			{
				fileName: storage.telemetryFile,
				legacyFilePath: legacyTelemetryFile,
				rotationBytes: storage.telemetryRotationBytes,
				retentionFiles: storage.telemetryRetentionFiles,
			},
		),
		openWritingMoves: () => ({
			uncheckedTaskReason: sidecarConfig.strings.openTaskReasonPrefix,
			uncheckedTaskSummary: sidecarConfig.strings.openTaskSummary,
			uncheckedTaskTargetLabel: sidecarConfig.strings.openTaskTargetLabel,
			uncheckedTaskEvidenceLabel: sidecarConfig.strings.openTaskEvidenceLabel,
			uncheckedTaskPattern: compileUncheckedTaskPattern(sidecarConfig.strings.openTaskUncheckedPattern),
		}),
		briefSensing: () => ({
			idleRefreshDelayMs: sidecarConfig.idleRefreshDelayMs,
			continuousRefreshMinIntervalMs: sidecarConfig.continuousRefreshMinIntervalMs,
		}),
		// WP5 §8.2 — Vault property library scan over the metadata cache (lazy + cached).
		vaultInventory: new ObsidianComposerVaultInventory(app),
		// WP5 §10.2 — formula detail (explain / split / variables) generation.
		formulaDetailGenerator: createComposerFormulaDetailGenerator(executor),
		// WP7 — image ports: vault attachment read/write + rename, media-generation
		// AI 改图, and the caption/layout text flow over the shared AI executor. One
		// coordinator is composed per open document inside `composeEditing`.
		imagePorts: {
			attachment: new ObsidianComposerImageAttachmentAdapter(app, resolveMediaAttachmentFolder),
			reference: new ObsidianComposerImageReferenceAdapter(app),
			edit: new ComposerMediaImageEditAdapter(composerMediaProducer(), imageConfigProvider().edit.presetId),
			text: createComposerImageTextAdapter(executor),
			config: imageConfigProvider,
		},
		nativePreviewPort: new ObsidianComposerNativePreviewAdapter(app),
		nativeEmbedRenderer: new ObsidianComposerNativeEmbedRenderer(app),
		embedSelectionAnchorPort: new ObsidianComposerEmbedAnchorAdapter(app),
		blockDraftGeneration: createComposerBlockDraftGenerationPort(executor),
		modelSelection: {
			choices: () => {
				const profile = ProfileRegistry.getInstance().getActiveAgentProfile();
				if (!profile) return [];
				return modelRegistry.getModelsForProvider(profile.kind).map((model) => ({
					id: model.id,
					displayName: model.displayName ?? model.id,
					providerLabel: profile.name,
				}));
			},
			defaultModelId: () =>
				ProfileRegistry.getInstance().getActiveAgentProfile()?.primaryModel ?? null,
		},
	});
	// The transaction-timing config lives in composer.json; load it asynchronously
	// and apply once resolved. Hubs created before it lands use the compiled
	// default (identical value, drift-guarded), so there is no race hazard.
	void loadComposerTransactionConfig().then((config) => runtime.setTransactionConfig(config));
	// WP3: the capability runtime factory (registry + executor + writeback).
	// The AI prompter is resolved lazily per run, so boot order is a non-issue.
	// WP-INT: the native-file port backs Base/Canvas/Excalidraw structural edits —
	// revision-guarded reads/writes of the separate object file on accept.
	runtime.setCapabilityRuntimeFactory(
		composeComposerCapabilityRuntime({ executor, nativeFilePort: new ObsidianComposerNativeFileAdapter(app) }),
	);
	return runtime;
}
