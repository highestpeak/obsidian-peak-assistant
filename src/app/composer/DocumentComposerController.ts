/**
 * Peak Composer — active-file lifecycle controller (WP1 host, WP4.5 editing).
 *
 * Owns the state machine behind one DocumentComposerView: which file is open,
 * its parsed session, and how it reacts to the file switching, being renamed,
 * deleted, or modified externally. Deliberately depends ONLY on the
 * framework-neutral service ports + session — it has NO runtime `obsidian`
 * import — so the lifecycle is unit-testable with fakes and the same code runs
 * under the real Obsidian adapters composed in `composeDocumentComposerRuntime`.
 *
 * WP4.5 makes the controller the single reactive source of BOTH the render state
 * (`ComposerStateSource`) AND the per-document editing runtime: on each newly
 * loaded session it composes the transaction hub + capability runtime + comment
 * store + link port (via an injected app-owned composer) and, after every hub
 * mutation (commit / undo / redo / rollback), re-emits the reparsed snapshot and
 * migrates comment anchors. A `modify` event is treated as an EXTERNAL change
 * only — the hub's own writes reparse the shared session first, so they never
 * trip the stale banner; a genuine out-of-band edit surfaces `stale`.
 */

import type {
	ComposerCandidateRuntimePort,
	ComposerCapabilityProjectionPort,
	ComposerDocumentSnapshot,
	ComposerStateSource,
	DocumentComposerState,
} from '@/core/composer';
import {
	ComposerDocumentSession,
	ComposerSourceRevisionService,
	type ComposerCommentStore,
	type ComposerFileEvent,
	type ComposerFileEventsPort,
	type ComposerLinkMetadataPort,
	type ComposerSourcePort,
	type ComposerTransactionHub,
	type ImageCapabilityCoordinator,
	type IntelligenceRuntime,
	type VaultPropertyScanPort,
} from '@/service/composer';
import type { FormulaDetailGeneratorPort } from '@/ui/view/composer/blocks/math/formulaDetailStore';

export type { ComposerLifecycleStatus, DocumentComposerState } from '@/core/composer';

/**
 * The per-document editing runtime the chrome consumes. Structurally the UI's
 * `ComposerChromeRuntime` (the view passes it straight through); kept as an
 * app/service-typed shape here so the controller stays UI-free. `projection`/
 * `candidateRuntime` are the SAME capability-runtime object (it implements both
 * ports) and are absent when no capability factory is bound (editing without AI).
 */
export interface ComposerEditingRuntime {
	session: ComposerDocumentSession;
	hub: ComposerTransactionHub;
	projection?: ComposerCapabilityProjectionPort;
	candidateRuntime?: ComposerCandidateRuntimePort;
	comments: ComposerCommentStore;
	linkPort?: ComposerLinkMetadataPort;
	/** Vault property inventory scan for the Frontmatter property library (WP5 §8.2). */
	vaultInventory?: VaultPropertyScanPort;
	/** Formula-detail generator for the math block's bespoke detail store (WP5 §10.2). */
	formulaDetailGenerator?: FormulaDetailGeneratorPort;
	/**
	 * WP7 — per-document image coordinator (paste / convert / AI 改图 / caption /
	 * layout). It implements `ComposerCandidateRuntimePort` for its own review cards
	 * AND exposes imperative flow entries the image block chrome calls. Absent ⇒ no
	 * image ports composed (harness / read-only host).
	 */
	imageCoordinator?: ImageCapabilityCoordinator;
	/** App-owned Intelligence Sidecar runtime (WP9); absent ⇒ no sidecar. */
	intelligence?: IntelligenceRuntime;
}

/** Builds the editing runtime for one open session (app-owned composition). */
export interface ComposerEditingComposer {
	compose(session: ComposerDocumentSession): ComposerEditingRuntime;
}

export interface DocumentComposerControllerDeps {
	source: ComposerSourcePort;
	events: ComposerFileEventsPort;
	revisionService?: ComposerSourceRevisionService;
	/** App-owned editing composer; absent ⇒ read-only host (no hub, disabled chrome). */
	editing?: ComposerEditingComposer;
}

interface ActiveEditing extends ComposerEditingRuntime {
	dispose(): void;
}

export class DocumentComposerController implements ComposerStateSource {
	private readonly source: ComposerSourcePort;
	private readonly events: ComposerFileEventsPort;
	private readonly revisionService: ComposerSourceRevisionService;
	private readonly editingComposer?: ComposerEditingComposer;

	private session: ComposerDocumentSession | null = null;
	private editing: ActiveEditing | null = null;
	private lastSnapshot: ComposerDocumentSnapshot | null = null;
	private state: DocumentComposerState = { status: 'empty', filePath: null, snapshot: null };
	private readonly subscribers = new Set<(s: DocumentComposerState) => void>();
	private unsubscribers: Array<() => void> = [];
	private inflight: Promise<void> = Promise.resolve();

	constructor(deps: DocumentComposerControllerDeps) {
		this.source = deps.source;
		this.events = deps.events;
		this.revisionService = deps.revisionService ?? new ComposerSourceRevisionService();
		this.editingComposer = deps.editing;
	}

	/** Begin tracking: subscribe to file events and load the active file. */
	start(): void {
		this.unsubscribers.push(this.events.onActiveFileChange((path) => this.onActiveFileChange(path)));
		this.unsubscribers.push(this.events.onFileEvent((event) => this.onFileEvent(event)));
		this.onActiveFileChange(this.events.getActiveFilePath());
	}

	/** Stop tracking and drop subscriptions. Idempotent. */
	stop(): void {
		for (const off of this.unsubscribers) off();
		this.unsubscribers = [];
		this.subscribers.clear();
		this.disposeEditing();
		this.session = null;
	}

	getState(): DocumentComposerState {
		return this.state;
	}

	subscribe(cb: (state: DocumentComposerState) => void): () => void {
		this.subscribers.add(cb);
		return () => this.subscribers.delete(cb);
	}

	/** The current per-document editing runtime, or undefined for the read-only host. */
	getRuntime(): ComposerEditingRuntime | undefined {
		return this.editing ?? undefined;
	}

	/** The current Intelligence Sidecar runtime, or undefined (WP9). */
	getIntelligence(): IntelligenceRuntime | undefined {
		return this.editing?.intelligence;
	}

	/** Resolves once the most recent async transition has settled (for tests). */
	settled(): Promise<void> {
		return this.inflight;
	}

	/** Re-read the current file and adopt it, clearing a stale flag. */
	revalidate(): void {
		if (!this.state.filePath) return;
		this.load(this.state.filePath);
	}

	// ── event handlers ──────────────────────────────────────────────────────

	private onActiveFileChange(path: string | null): void {
		if (!path) {
			this.disposeEditing();
			this.session = null;
			this.setState({ status: 'empty', filePath: null, snapshot: null });
			return;
		}
		if (path === this.state.filePath && this.state.status === 'loaded') return;
		this.load(path);
	}

	private onFileEvent(event: ComposerFileEvent): void {
		const current = this.state.filePath;
		if (!current) return;
		if (event.type === 'rename' && event.oldPath === current) {
			this.setState({ ...this.state, filePath: event.path });
			return;
		}
		if (event.type === 'delete' && event.path === current) {
			this.disposeEditing();
			this.session = null;
			this.setState({ status: 'missing', filePath: current, snapshot: null });
			return;
		}
		if (event.type === 'modify' && event.path === current) {
			this.markStaleIfChanged(current);
		}
	}

	private markStaleIfChanged(filePath: string): void {
		this.run(async () => {
			const text = await this.source.readSource(filePath);
			// The hub reparses the shared session synchronously on commit, so a write
			// we originated is already adopted → not stale. Only a genuine external
			// edit still differs from the session snapshot.
			if (this.session && this.session.isStale(text)) {
				this.setState({ ...this.state, status: 'stale' });
			}
		});
	}

	private load(filePath: string): void {
		this.setState({ status: 'loading', filePath, snapshot: this.state.snapshot });
		this.run(async () => {
			try {
				const session = await ComposerDocumentSession.load(this.source, filePath, this.revisionService);
				this.disposeEditing();
				this.session = session;
				this.lastSnapshot = session.snapshot;
				this.composeEditingFor(session);
				this.setState({ status: 'loaded', filePath, snapshot: session.snapshot });
			} catch (err) {
				this.disposeEditing();
				this.session = null;
				this.setState({
					status: 'error',
					filePath,
					snapshot: null,
					error: err instanceof Error ? err.message : String(err),
				});
			}
		});
	}

	// ── editing runtime lifecycle ───────────────────────────────────────────────

	private composeEditingFor(session: ComposerDocumentSession): void {
		if (!this.editingComposer) return;
		const runtime = this.editingComposer.compose(session);
		// Re-emit the reparsed snapshot + migrate comment anchors after every hub
		// mutation. `hub.subscribe` fires immediately; we only react once a real
		// mutation advances the document (revision change) or candidates move.
		const off = runtime.hub.on((event) => {
			if (
				event.type === 'committed' ||
				event.type === 'undone' ||
				event.type === 'redone' ||
				event.type === 'rolled-back'
			) {
				this.onHubMutation(runtime);
			}
		});
		this.editing = { ...runtime, dispose: off };
		// Hydrate persisted comments (best-effort; store re-emits when it lands).
		void runtime.comments.load();
	}

	private onHubMutation(runtime: ComposerEditingRuntime): void {
		const next = runtime.session.snapshot;
		if (this.lastSnapshot && this.lastSnapshot !== next) {
			runtime.comments.revalidate(this.lastSnapshot, next);
			// Re-anchor Intelligence findings across the reparse (matchBlocks) so the
			// shared body ⇄ brief entity survives edits or goes stale (§5.4).
			runtime.intelligence?.onReparse(this.lastSnapshot, next);
		}
		this.lastSnapshot = next;
		if (this.state.filePath) {
			this.setState({ status: 'loaded', filePath: this.state.filePath, snapshot: next });
		}
	}

	private disposeEditing(): void {
		this.editing?.intelligence?.dispose();
		this.editing?.dispose();
		this.editing = null;
	}

	// ── internals ─────────────────────────────────────────────────────────────

	private run(fn: () => Promise<void>): void {
		this.inflight = this.inflight.then(fn, fn);
	}

	private setState(next: DocumentComposerState): void {
		this.state = next;
		for (const cb of this.subscribers) cb(next);
	}
}
