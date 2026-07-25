/**
 * Peak Composer — active-file lifecycle controller (WP1).
 *
 * Owns the state machine behind one DocumentComposerView: which file is open,
 * its parsed session, and how it reacts to the file switching, being renamed,
 * deleted, or modified externally. Deliberately depends ONLY on the
 * framework-neutral service ports + session — it has NO runtime `obsidian`
 * import — so the lifecycle is unit-testable with fakes and the same code runs
 * under the real Obsidian adapters composed in `composeDocumentComposerRuntime`.
 *
 * WP1 is a read-only viewer, so a `modify` event is always treated as an
 * external change: the controller surfaces `stale` (never silently overwrites)
 * and exposes `revalidate()` to adopt the new source. WP2 replaces the
 * auto-adopt with transaction-aware conflict handling.
 */

import type { ComposerStateSource, DocumentComposerState } from '@/core/composer';
import {
	ComposerDocumentSession,
	ComposerSourceRevisionService,
	type ComposerFileEvent,
	type ComposerFileEventsPort,
	type ComposerSourcePort,
} from '@/service/composer';

export type { ComposerLifecycleStatus, DocumentComposerState } from '@/core/composer';

export interface DocumentComposerControllerDeps {
	source: ComposerSourcePort;
	events: ComposerFileEventsPort;
	revisionService?: ComposerSourceRevisionService;
}

export class DocumentComposerController implements ComposerStateSource {
	private readonly source: ComposerSourcePort;
	private readonly events: ComposerFileEventsPort;
	private readonly revisionService: ComposerSourceRevisionService;

	private session: ComposerDocumentSession | null = null;
	private state: DocumentComposerState = { status: 'empty', filePath: null, snapshot: null };
	private readonly subscribers = new Set<(s: DocumentComposerState) => void>();
	private unsubscribers: Array<() => void> = [];
	private inflight: Promise<void> = Promise.resolve();

	constructor(deps: DocumentComposerControllerDeps) {
		this.source = deps.source;
		this.events = deps.events;
		this.revisionService = deps.revisionService ?? new ComposerSourceRevisionService();
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
		this.session = null;
	}

	getState(): DocumentComposerState {
		return this.state;
	}

	subscribe(cb: (state: DocumentComposerState) => void): () => void {
		this.subscribers.add(cb);
		return () => this.subscribers.delete(cb);
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
				this.session = session;
				this.setState({ status: 'loaded', filePath, snapshot: session.snapshot });
			} catch (err) {
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

	// ── internals ─────────────────────────────────────────────────────────────

	private run(fn: () => Promise<void>): void {
		this.inflight = this.inflight.then(fn, fn);
	}

	private setState(next: DocumentComposerState): void {
		this.state = next;
		for (const cb of this.subscribers) cb(next);
	}
}
