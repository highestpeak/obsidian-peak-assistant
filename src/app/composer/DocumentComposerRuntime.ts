/**
 * Peak Composer — app-owned runtime (WP1 host + WP2 transactions).
 *
 * Holds the view-independent pieces (source/write ports, revision service,
 * transaction config) and hands each DocumentComposerView its own lifecycle
 * controller and, per open document, a {@link ComposerTransactionHub}. It is
 * owned by `AppRuntimeRegistry` (one instance per plugin load) — NOT a
 * service-side singleton — matching the runtime-ownership rule (CLAUDE.md).
 *
 * WP3 grows this into the capability runtime; WP2 adds the atomic write adapter
 * and the transaction/History/Undo hub composition on top of WP1's host.
 */

import {
	ComposerCommentStore,
	ComposerSourceRevisionService,
	ComposerTransactionEngine,
	ComposerTransactionHub,
	ImageCapabilityCoordinator,
	IntelligenceRuntime,
	detectOpenWritingMoves,
	type ComposerCapabilityDocumentRuntime,
	type ComposerCommentPersistencePort,
	type ComposerBlockDraftGenerationPort,
	type ComposerDocumentSession,
	type ComposerEmbedSelectionAnchorPort,
	type ComposerImageAttachmentPort,
	type ComposerImageEditPort,
	type ComposerImageReferencePort,
	type ComposerImageTextPort,
	type ComposerLinkMetadataPort,
	type ComposerNativePreviewPort,
	type ComposerRelatedMaterialsPort,
	type BriefSensingPolicy,
	type ImageDomainConfigProvider,
	type IntelligenceTelemetryPort,
	type OpenWritingMovesConfig,
	type VaultPropertyScanPort,
} from '@/service/composer';
import {
	DEFAULT_TRANSACTION_CONFIG,
	type ComposerModelSelectionPort,
	type ComposerNativeEmbedRendererPort,
	type ComposerTransactionConfig,
} from '@/core/composer';
import type { FormulaDetailGeneratorPort } from '@/ui/view/composer/blocks/math/formulaDetailStore';
import {
	ObsidianComposerFileEventsAdapter,
	ObsidianComposerSourceAdapter,
	ObsidianComposerWriteAdapter,
} from './ObsidianComposerAdapters';
import {
	DocumentComposerController,
	type ComposerEditingRuntime,
} from './DocumentComposerController';
import type { ComposerCapabilityRuntimeFactory } from './capabilities/composeComposerCapabilityRuntime';
import { CompositeComposerCandidateRuntime } from './CompositeComposerCandidateRuntime';

export interface DocumentComposerRuntimeAdapters {
	/** Per-document comment JSON persistence (plugin-owned store). */
	commentPersistence?: ComposerCommentPersistencePort;
	/** Vault link metadata (Obsidian metadata cache). */
	linkPort?: ComposerLinkMetadataPort;
	/** Related-material snapshot port for the Intelligence Sidecar (WP9). */
	relatedMaterials?: ComposerRelatedMaterialsPort;
	/** Privacy-safe telemetry sink for the §12.7 metric events (WP9). */
	intelligenceTelemetry?: IntelligenceTelemetryPort;
	/** Deterministic source-backed producer for Brief next moves. */
	openWritingMoves?: () => OpenWritingMovesConfig;
	/** Template-backed debounce/throttle policy for Brief sensing. */
	briefSensing?: () => BriefSensingPolicy;
	/** Vault property inventory scan for the Frontmatter property library (WP5 §8.2). */
	vaultInventory?: VaultPropertyScanPort;
	/** Formula-detail generator for the math block's bespoke detail store (WP5 §10.2). */
	formulaDetailGenerator?: FormulaDetailGeneratorPort;
	/**
	 * WP7 — image capability ports (paste / convert asset transactions, AI 改图
	 * media generation, caption + smart-layout text flows). When present, one
	 * {@link ImageCapabilityCoordinator} is composed per open document; absent ⇒ the
	 * image block chrome degrades to disabled affordances (never fake buttons).
	 */
	imagePorts?: {
		attachment: ComposerImageAttachmentPort;
		reference: ComposerImageReferencePort;
		edit: ComposerImageEditPort;
		text?: ComposerImageTextPort;
		config?: ImageDomainConfigProvider;
	};
	/** App-owned native preview loader for Markdown embeds targeting native files. */
	nativePreviewPort?: ComposerNativePreviewPort;
	/** App-owned renderer for native Obsidian `![[...]]` embeds. */
	nativeEmbedRenderer?: ComposerNativeEmbedRendererPort;
	/** App-owned writer for persisted Markdown embed selection anchors. */
	embedSelectionAnchorPort?: ComposerEmbedSelectionAnchorPort;
	/** Shared-AI-backed new-block draft generation port, composed at the app layer. */
	blockDraftGeneration?: ComposerBlockDraftGenerationPort;
	/** Active-profile models exposed to the Composer Copilot selector. */
	modelSelection?: ComposerModelSelectionPort;
}

export class DocumentComposerRuntime {
	private transactionConfig: ComposerTransactionConfig;
	private capabilityFactory: ComposerCapabilityRuntimeFactory | null = null;

	private readonly commentPersistence?: ComposerCommentPersistencePort;
	private readonly linkPort?: ComposerLinkMetadataPort;
	private readonly relatedMaterials?: ComposerRelatedMaterialsPort;
	private readonly intelligenceTelemetry?: IntelligenceTelemetryPort;
	private readonly openWritingMoves?: () => OpenWritingMovesConfig;
	private readonly briefSensing?: () => BriefSensingPolicy;
	private readonly vaultInventory?: VaultPropertyScanPort;
	private readonly formulaDetailGenerator?: FormulaDetailGeneratorPort;
	private readonly imagePorts?: DocumentComposerRuntimeAdapters['imagePorts'];
	private readonly nativePreviewPort?: ComposerNativePreviewPort;
	private readonly nativeEmbedRenderer?: ComposerNativeEmbedRendererPort;
	private readonly embedSelectionAnchorPort?: ComposerEmbedSelectionAnchorPort;
	private readonly blockDraftGeneration?: ComposerBlockDraftGenerationPort;
	private readonly modelSelection?: ComposerModelSelectionPort;

	constructor(
		private readonly source: ObsidianComposerSourceAdapter,
		private readonly write: ObsidianComposerWriteAdapter,
		private readonly events: ObsidianComposerFileEventsAdapter,
		private readonly revisionService: ComposerSourceRevisionService,
		transactionConfig: ComposerTransactionConfig = DEFAULT_TRANSACTION_CONFIG,
		adapters: DocumentComposerRuntimeAdapters = {},
	) {
		this.transactionConfig = transactionConfig;
		this.commentPersistence = adapters.commentPersistence;
		this.linkPort = adapters.linkPort;
		this.relatedMaterials = adapters.relatedMaterials;
		this.intelligenceTelemetry = adapters.intelligenceTelemetry;
		this.openWritingMoves = adapters.openWritingMoves;
		this.briefSensing = adapters.briefSensing;
		this.vaultInventory = adapters.vaultInventory;
		this.formulaDetailGenerator = adapters.formulaDetailGenerator;
		this.imagePorts = adapters.imagePorts;
		this.nativePreviewPort = adapters.nativePreviewPort;
		this.nativeEmbedRenderer = adapters.nativeEmbedRenderer;
		this.embedSelectionAnchorPort = adapters.embedSelectionAnchorPort;
		this.blockDraftGeneration = adapters.blockDraftGeneration;
		this.modelSelection = adapters.modelSelection;
	}

	/** Override the transaction config once the runtime JSON resolves (async). */
	setTransactionConfig(config: ComposerTransactionConfig): void {
		this.transactionConfig = config;
	}

	/** A fresh lifecycle controller for one view instance (with editing composition). */
	createController(): DocumentComposerController {
		return new DocumentComposerController({
			source: this.source,
			events: this.events,
			revisionService: this.revisionService,
			editing: { compose: (session) => this.composeEditing(session) },
		});
	}

	/**
	 * Compose the full per-document editing runtime: transaction hub + capability
	 * runtime (projection + candidate ports, absent when no factory is bound) +
	 * comment store + link port. Owned entirely at the app layer.
	 */
	composeEditing(session: ComposerDocumentSession): ComposerEditingRuntime {
		const hub = this.createTransactionHub(session);
		const capabilityRuntime = this.createCapabilityRuntime(session, hub);
		const comments = new ComposerCommentStore(session.snapshot.documentId, this.commentPersistence);
		// WP7 — one image coordinator per open document (candidate rail + imperative
		// paste/convert/AI-edit/caption/layout entries), sharing this document's hub
		// so image commits land in the same History / Undo timeline. App-owned.
		const imageCoordinator = this.imagePorts
			? new ImageCapabilityCoordinator({
				session,
				hub,
				attachment: this.imagePorts.attachment,
				reference: this.imagePorts.reference,
				edit: this.imagePorts.edit,
				...(this.imagePorts.text ? { text: this.imagePorts.text } : {}),
				...(this.imagePorts.config ? { config: this.imagePorts.config } : {}),
			})
			: undefined;
		const imagePreviewResolver = this.imagePorts
			? (path: string, sourcePath?: string) => this.imagePorts!.attachment.previewUri(path, sourcePath)
			: undefined;
		const candidateRuntime =
			capabilityRuntime && imageCoordinator
				? new CompositeComposerCandidateRuntime(capabilityRuntime, imageCoordinator)
				: capabilityRuntime ?? imageCoordinator;
		// WP9 — one Intelligence runtime per document, bound to this hub for the
		// accepted-change → History receipt bridge. App-owned (no singleton).
		const intelligence = new IntelligenceRuntime({
			hub,
			...(this.relatedMaterials ? { related: this.relatedMaterials } : {}),
			...(this.intelligenceTelemetry ? { telemetry: this.intelligenceTelemetry } : {}),
			getSnapshot: () => session.snapshot,
			produceFindings: (snapshot) => {
				const config = this.openWritingMoves?.();
				return config ? detectOpenWritingMoves(snapshot, config) : [];
			},
			briefSensing: this.briefSensing?.(),
		});
		intelligence.updateBriefFocus(defaultBriefFocus(session.snapshot.filePath, session.snapshot.documentId));
		// Initial Brief content uses the same injected producer as later manual / sensing refreshes.
		// If no producer is composed, the runtime records no fabricated suggestions.
		intelligence.refreshBrief();
		return {
			session,
			hub,
			transactionConfig: this.transactionConfig,
			comments,
			intelligence,
			...(this.linkPort ? { linkPort: this.linkPort } : {}),
			...(this.vaultInventory ? { vaultInventory: this.vaultInventory } : {}),
			...(this.formulaDetailGenerator ? { formulaDetailGenerator: this.formulaDetailGenerator } : {}),
			...(capabilityRuntime ? { projection: capabilityRuntime } : {}),
			...(candidateRuntime ? { candidateRuntime } : {}),
			...(imageCoordinator ? { imageCoordinator } : {}),
			...(this.nativePreviewPort ? { nativePreviewPort: this.nativePreviewPort } : {}),
			...(this.nativeEmbedRenderer ? { nativeEmbedRenderer: this.nativeEmbedRenderer } : {}),
			...(this.embedSelectionAnchorPort ? { embedSelectionAnchorPort: this.embedSelectionAnchorPort } : {}),
			...(this.blockDraftGeneration ? { blockDraftGeneration: this.blockDraftGeneration } : {}),
			...(this.modelSelection ? { modelSelection: this.modelSelection } : {}),
			...(imagePreviewResolver ? { imagePreviewResolver } : {}),
		};
	}

	/**
	 * A transaction hub bound to one open document session. The engine is wired
	 * with the atomic write adapter; WP4 mounts the hub's projection under the
	 * bottom status bar (Undo/Redo) and the History panel.
	 */
	createTransactionHub(session: ComposerDocumentSession): ComposerTransactionHub {
		const engine = new ComposerTransactionEngine(this.source, this.write, this.revisionService);
		return new ComposerTransactionHub(session, { engine, config: this.transactionConfig });
	}

	/** Bind the WP3 capability runtime factory (set once by the composition root). */
	setCapabilityRuntimeFactory(factory: ComposerCapabilityRuntimeFactory): void {
		this.capabilityFactory = factory;
	}

	/**
	 * The capability runtime for one open document (WP3). It implements the
	 * frozen `ComposerCapabilityProjectionPort` — the integration pass hands it
	 * to the editing chrome in place of `stubComposerCapabilityProjection` —
	 * and the `ComposerCandidateRuntimePort` the candidate UI consumes.
	 * Returns null until the composition root has bound the factory.
	 */
	createCapabilityRuntime(
		session: ComposerDocumentSession,
		hub: ComposerTransactionHub,
	): ComposerCapabilityDocumentRuntime | null {
		if (!this.capabilityFactory) return null;
		return this.capabilityFactory.forDocument(session, hub);
	}

	/** Detach the shared Obsidian event listeners. Idempotent. */
	dispose(): void {
		this.events.dispose();
	}
}

/** Real file basename for the initial document-level Brief focus; no UI copy is invented here. */
function defaultBriefFocus(filePath: string, documentId: string): { anchorId: string; label: string } {
	const separator = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
	const label = filePath.slice(separator + 1) || documentId;
	return { anchorId: documentId, label };
}
