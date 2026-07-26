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
	IntelligenceRuntime,
	type ComposerCapabilityDocumentRuntime,
	type ComposerCommentPersistencePort,
	type ComposerDocumentSession,
	type ComposerLinkMetadataPort,
	type ComposerRelatedMaterialsPort,
	type IntelligenceTelemetryPort,
} from '@/service/composer';
import { DEFAULT_TRANSACTION_CONFIG, type ComposerTransactionConfig } from '@/core/composer';
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

export interface DocumentComposerRuntimeAdapters {
	/** Per-document comment JSON persistence (plugin-owned store). */
	commentPersistence?: ComposerCommentPersistencePort;
	/** Vault link metadata (Obsidian metadata cache). */
	linkPort?: ComposerLinkMetadataPort;
	/** Related-material snapshot port for the Intelligence Sidecar (WP9). */
	relatedMaterials?: ComposerRelatedMaterialsPort;
	/** Privacy-safe telemetry sink for the §12.7 metric events (WP9). */
	intelligenceTelemetry?: IntelligenceTelemetryPort;
}

export class DocumentComposerRuntime {
	private transactionConfig: ComposerTransactionConfig;
	private capabilityFactory: ComposerCapabilityRuntimeFactory | null = null;

	private readonly commentPersistence?: ComposerCommentPersistencePort;
	private readonly linkPort?: ComposerLinkMetadataPort;
	private readonly relatedMaterials?: ComposerRelatedMaterialsPort;
	private readonly intelligenceTelemetry?: IntelligenceTelemetryPort;

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
		// WP9 — one Intelligence runtime per document, bound to this hub for the
		// accepted-change → History receipt bridge. App-owned (no singleton).
		const intelligence = new IntelligenceRuntime({
			hub,
			...(this.relatedMaterials ? { related: this.relatedMaterials } : {}),
			...(this.intelligenceTelemetry ? { telemetry: this.intelligenceTelemetry } : {}),
		});
		return {
			session,
			hub,
			comments,
			intelligence,
			...(this.linkPort ? { linkPort: this.linkPort } : {}),
			...(capabilityRuntime ? { projection: capabilityRuntime, candidateRuntime: capabilityRuntime } : {}),
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
