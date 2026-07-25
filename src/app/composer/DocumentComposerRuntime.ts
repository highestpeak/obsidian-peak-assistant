/**
 * Peak Composer — app-owned runtime (WP1 skeleton).
 *
 * Holds the view-independent pieces (source port, file-events adapter, revision
 * service) and hands each DocumentComposerView its own lifecycle controller.
 * It is owned by `AppRuntimeRegistry` (one instance per plugin load) — NOT a
 * service-side singleton — matching the four-method slot pattern used by every
 * other capability runtime (handoff §2.3, CLAUDE.md "Runtime ownership").
 *
 * WP2/WP3 grow this into the transaction + capability runtime; WP1 provides the
 * host/session composition only.
 */

import { ComposerSourceRevisionService } from '@/service/composer';
import {
	ObsidianComposerFileEventsAdapter,
	ObsidianComposerSourceAdapter,
} from './ObsidianComposerAdapters';
import { DocumentComposerController } from './DocumentComposerController';

export class DocumentComposerRuntime {
	constructor(
		private readonly source: ObsidianComposerSourceAdapter,
		private readonly events: ObsidianComposerFileEventsAdapter,
		private readonly revisionService: ComposerSourceRevisionService,
	) {}

	/** A fresh lifecycle controller for one view instance. */
	createController(): DocumentComposerController {
		return new DocumentComposerController({
			source: this.source,
			events: this.events,
			revisionService: this.revisionService,
		});
	}

	/** Detach the shared Obsidian event listeners. Idempotent. */
	dispose(): void {
		this.events.dispose();
	}
}
