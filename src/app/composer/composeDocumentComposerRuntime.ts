/**
 * Peak Composer — runtime composition (WP1).
 *
 * The single place that wires Obsidian adapters into the app-owned
 * {@link DocumentComposerRuntime}. Called from `main.onload`; the result is
 * bound on `AppRuntimeRegistry` via `setDocumentComposerRuntime` and released
 * in `onunload` via `clearDocumentComposerRuntime`.
 */

import type { App } from 'obsidian';
import { ComposerSourceRevisionService } from '@/service/composer';
import { loadComposerTransactionConfig } from '@/ui/view/composer';
import {
	ObsidianComposerFileEventsAdapter,
	ObsidianComposerSourceAdapter,
	ObsidianComposerWriteAdapter,
} from './ObsidianComposerAdapters';
import { DocumentComposerRuntime } from './DocumentComposerRuntime';
import { composeComposerCapabilityRuntime } from './capabilities/composeComposerCapabilityRuntime';

export function composeDocumentComposerRuntime(app: App): DocumentComposerRuntime {
	const source = new ObsidianComposerSourceAdapter(app);
	const write = new ObsidianComposerWriteAdapter(app);
	const events = new ObsidianComposerFileEventsAdapter(app);
	const revisionService = new ComposerSourceRevisionService();
	const runtime = new DocumentComposerRuntime(source, write, events, revisionService);
	// The transaction-timing config lives in composer.json; load it asynchronously
	// and apply once resolved. Hubs created before it lands use the compiled
	// default (identical value, drift-guarded), so there is no race hazard.
	void loadComposerTransactionConfig().then((config) => runtime.setTransactionConfig(config));
	// WP3: the capability runtime factory (registry + executor + writeback).
	// The AI prompter is resolved lazily per run, so boot order is a non-issue.
	runtime.setCapabilityRuntimeFactory(composeComposerCapabilityRuntime());
	return runtime;
}
