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
	ComposerSourceRevisionService,
	ComposerTransactionEngine,
	ComposerTransactionHub,
	type ComposerDocumentSession,
} from '@/service/composer';
import { DEFAULT_TRANSACTION_CONFIG, type ComposerTransactionConfig } from '@/core/composer';
import {
	ObsidianComposerFileEventsAdapter,
	ObsidianComposerSourceAdapter,
	ObsidianComposerWriteAdapter,
} from './ObsidianComposerAdapters';
import { DocumentComposerController } from './DocumentComposerController';

export class DocumentComposerRuntime {
	private transactionConfig: ComposerTransactionConfig;

	constructor(
		private readonly source: ObsidianComposerSourceAdapter,
		private readonly write: ObsidianComposerWriteAdapter,
		private readonly events: ObsidianComposerFileEventsAdapter,
		private readonly revisionService: ComposerSourceRevisionService,
		transactionConfig: ComposerTransactionConfig = DEFAULT_TRANSACTION_CONFIG,
	) {
		this.transactionConfig = transactionConfig;
	}

	/** Override the transaction config once the runtime JSON resolves (async). */
	setTransactionConfig(config: ComposerTransactionConfig): void {
		this.transactionConfig = config;
	}

	/** A fresh lifecycle controller for one view instance. */
	createController(): DocumentComposerController {
		return new DocumentComposerController({
			source: this.source,
			events: this.events,
			revisionService: this.revisionService,
		});
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

	/** Detach the shared Obsidian event listeners. Idempotent. */
	dispose(): void {
		this.events.dispose();
	}
}
