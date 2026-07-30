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
	ComposerWorkspaceIntelligenceRuntime,
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
	type ComposerWorkspaceStatePersistencePort,
	type FrozenComposerReviewSnapshot,
	type OpenWritingMovesConfig,
	type VaultPropertyScanPort,
} from '@/service/composer';
import {
	DEFAULT_TRANSACTION_CONFIG,
	type ComposerCapabilityProjectionPort,
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
import type { ComposerDocumentRouter } from './ComposerDocumentRouter';

export interface DocumentComposerRuntimeAdapters {
	/** App-owned Markdown/Composer navigation policy and same-leaf converter. */
	navigation?: ComposerDocumentRouter;
	/** Persisted workspace preference for explicit Intelligence open/close. */
	intelligenceVisibilityPreference?: {
		get(): boolean;
		set(open: boolean): Promise<void>;
	};
	/** Canonical JSONL persistence for workspace scope, segments and Frozen Runs. */
	workspaceStatePersistence?: ComposerWorkspaceStatePersistencePort;
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
	private readonly documentEntries = new Map<string, {
		runtime: ComposerEditingRuntime;
		refs: number;
		lastAccessedAt: number;
		offRun?: () => void;
		offReview?: () => void;
		reviewsRestorePromise?: Promise<void>;
	}>();

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
	private readonly intelligenceVisibilityPreference?: DocumentComposerRuntimeAdapters['intelligenceVisibilityPreference'];
	readonly navigation?: ComposerDocumentRouter;
	readonly workspaceIntelligence: ComposerWorkspaceIntelligenceRuntime;

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
		this.intelligenceVisibilityPreference = adapters.intelligenceVisibilityPreference;
		this.navigation = adapters.navigation;
		this.workspaceIntelligence = new ComposerWorkspaceIntelligenceRuntime(
			adapters.workspaceStatePersistence,
		);
		void this.workspaceIntelligence.hydrate();
	}

	getIntelligenceManualOpen(): boolean {
		return this.intelligenceVisibilityPreference?.get() ?? false;
	}

	async setIntelligenceManualOpen(open: boolean): Promise<void> {
		await this.intelligenceVisibilityPreference?.set(open);
	}

	/** Override the transaction config once the runtime JSON resolves (async). */
	setTransactionConfig(config: ComposerTransactionConfig): void {
		this.transactionConfig = config;
	}

	/** A fresh lifecycle controller for one explicitly file-bound view instance. */
	createController(
		originHostId?: string,
		originHost: 'composer' | 'markdown' = 'composer',
	): DocumentComposerController {
		return new DocumentComposerController({
			source: this.source,
			events: this.events,
			revisionService: this.revisionService,
			originHostId,
			originHost,
			editing: {
				acquire: (session, hostId, host) => this.acquireEditing(session, hostId, host),
				rename: (oldPath, newPath, session) => this.renameDocument(oldPath, newPath, session),
			},
		});
	}

	/**
	 * Acquire the canonical app-owned runtime for a document. Closing a leaf only
	 * releases its reference; pending candidates and active runs survive until
	 * plugin shutdown.
	 */
	acquireEditing(
		session: ComposerDocumentSession,
		originHostId?: string,
		originHost: 'composer' | 'markdown' = 'composer',
	): {
		runtime: ComposerEditingRuntime;
		release(): void;
	} {
		let entry = this.documentEntries.get(session.filePath);
		if (!entry) {
			const runtime = this.composeEditing(session);
			const offRun = runtime.candidateRuntime?.onRunEvent((event) => {
				const review = this.snapshotCandidateReview(runtime, event.candidateId);
				if (event.type === 'run-started') {
					const candidate = runtime.hub
						.projection()
						.candidates
						.find((item) => item.candidateId === event.candidateId);
					if (!candidate) return;
					this.workspaceIntelligence.startRun({
						event,
						candidate,
						documentId: runtime.session.snapshot.documentId,
						filePath: runtime.session.filePath,
						originHost: 'composer',
						...(review ? { review } : {}),
					});
					return;
				}
				this.workspaceIntelligence.applyRunEvent(event, review);
			});
			const offReview = runtime.hub.on((event) => {
				if (event.type === 'committed' && event.transaction.runId) {
					this.workspaceIntelligence.markRunAccepted(
						event.transaction.runId,
						event.transaction.transactionId,
					);
					return;
				}
				if (event.type === 'candidate-changed') {
					if (event.status === 'discarded') {
						this.workspaceIntelligence.markCandidateNotAdopted(event.candidateId);
						return;
					}
					if (event.status === 'accepted') {
						const review = this.snapshotCandidateReview(runtime, event.candidateId);
						if (review) {
							this.workspaceIntelligence.updateCandidateReview(
								event.candidateId,
								review,
							);
						}
						this.workspaceIntelligence.markCandidateAccepted(event.candidateId);
						return;
					}
					this.deferCandidateReviewSync(runtime, event.candidateId);
					return;
				}
				if (event.type !== 'candidates-revalidated') return;
				for (const candidateId of event.staleIds) {
					this.deferCandidateReviewSync(runtime, candidateId);
				}
			});
			entry = {
				runtime,
				refs: 0,
				lastAccessedAt: Date.now(),
				...(offRun ? { offRun } : {}),
				offReview,
			};
			this.documentEntries.set(session.filePath, entry);
		} else if (entry.runtime.session.baseRevision !== session.baseRevision) {
			const previous = entry.runtime.session.snapshot;
			entry.runtime.hub.adoptExternalSnapshot(session.snapshot);
			entry.runtime.comments.revalidate(previous, entry.runtime.session.snapshot);
			entry.runtime.intelligence?.onReparse(previous, entry.runtime.session.snapshot);
			this.workspaceIntelligence.markDocumentRunsStale(previous.documentId);
		}
		this.workspaceIntelligence.trackDocument(
			entry.runtime.session.snapshot.documentId,
			entry.runtime.session.filePath,
		);
		entry.reviewsRestorePromise ??= this.workspaceIntelligence.hydrate().then(() => {
			this.restorePersistedReviews(entry!.runtime);
		});
		entry.refs += 1;
		entry.lastAccessedAt = Date.now();
		let released = false;
		return {
			runtime: this.forOriginHost(entry.runtime, originHostId, originHost),
			release: () => {
				if (released) return;
				released = true;
				entry!.refs = Math.max(0, entry!.refs - 1);
				entry!.lastAccessedAt = Date.now();
			},
		};
	}

	/** Preserve the document runtime and stable document id across a vault rename. */
	renameDocument(oldPath: string, newPath: string, session: ComposerDocumentSession): void {
		if (oldPath === newPath) return;
		const entry = this.documentEntries.get(oldPath);
		if (!entry) return;
		if (entry.runtime.session !== session) return;
		this.documentEntries.delete(oldPath);
		this.documentEntries.set(newPath, entry);
		this.workspaceIntelligence.renameDocument(session.snapshot.documentId, newPath);
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
			workspaceIntelligence: this.workspaceIntelligence,
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
		for (const entry of this.documentEntries.values()) {
			entry.offRun?.();
			entry.offReview?.();
			for (const candidate of entry.runtime.hub.projection().candidates) {
				if (candidate.status !== 'streaming') continue;
				entry.runtime.candidateRuntime?.cancel(candidate.candidateId);
			}
			entry.runtime.intelligence?.dispose();
		}
		this.documentEntries.clear();
		this.navigation?.dispose();
		this.events.dispose();
	}

	private snapshotCandidateReview(
		runtime: ComposerEditingRuntime,
		candidateId: string,
	): FrozenComposerReviewSnapshot | undefined {
		const candidate = runtime.hub
			.projection()
			.candidates
			.find((item) => item.candidateId === candidateId);
		const runtimeSnapshot =
			runtime.candidateRuntime?.exportCandidateRuntimeState?.(candidateId);
		if (!candidate || !runtimeSnapshot) return undefined;
		return { candidate, runtime: runtimeSnapshot };
	}

	private deferCandidateReviewSync(
		runtime: ComposerEditingRuntime,
		candidateId: string,
	): void {
		void Promise.resolve().then(() => {
			const review = this.snapshotCandidateReview(runtime, candidateId);
			if (!review) return;
			this.workspaceIntelligence.updateCandidateReview(candidateId, review);
		});
	}

	private restorePersistedReviews(runtime: ComposerEditingRuntime): void {
		const candidateRuntime = runtime.candidateRuntime;
		if (!candidateRuntime?.restoreCandidateRuntimeState) return;
		const reviews = this.workspaceIntelligence.reviewsForDocument(
			runtime.session.snapshot.documentId,
		);
		for (const review of reviews) {
			const candidateId = review.candidate.candidateId;
			const alreadyLive = runtime.hub
				.projection()
				.candidates
				.some((candidate) => candidate.candidateId === candidateId);
			if (alreadyLive) continue;
			const candidate =
				review.candidate.baseRevision === runtime.session.baseRevision
					? review.candidate
					: { ...review.candidate, status: 'stale' as const };
			const rebound = candidateRuntime.restoreCandidateRuntimeState(
				candidate,
				review.runtime,
			);
			if (!rebound) continue;
			runtime.hub.restoreCandidateSnapshot(candidate);
		}
	}

	private forOriginHost(
		runtime: ComposerEditingRuntime,
		originHostId?: string,
		originHost: 'composer' | 'markdown' = 'composer',
	): ComposerEditingRuntime {
		if (!originHostId || !runtime.projection) return runtime;
		return {
			...runtime,
			projection: this.wrapProjection(runtime.projection, originHostId, originHost),
		};
	}

	private wrapProjection(
		projection: ComposerCapabilityProjectionPort,
		originHostId: string,
		originHost: 'composer' | 'markdown',
	): ComposerCapabilityProjectionPort {
		const wrapped: ComposerCapabilityProjectionPort = {
			actionsFor: (snapshot, surface) => projection.actionsFor(snapshot, surface),
			invoke: (capabilityId, snapshot, options) => {
				const handle = projection.invoke(capabilityId, snapshot, options);
				this.workspaceIntelligence.attachOriginHost(handle.runId, originHostId, originHost);
				return handle;
			},
		};
		if (projection.catalogFor) {
			wrapped.catalogFor = (snapshot) => projection.catalogFor!(snapshot);
		}
		return wrapped;
	}
}

/** Real file basename for the initial document-level Brief focus; no UI copy is invented here. */
function defaultBriefFocus(filePath: string, documentId: string): { anchorId: string; label: string } {
	const separator = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
	const label = filePath.slice(separator + 1) || documentId;
	return { anchorId: documentId, label };
}
