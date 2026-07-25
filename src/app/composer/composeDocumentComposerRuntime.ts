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
import {
	ObsidianComposerFileEventsAdapter,
	ObsidianComposerSourceAdapter,
} from './ObsidianComposerAdapters';
import { DocumentComposerRuntime } from './DocumentComposerRuntime';

export function composeDocumentComposerRuntime(app: App): DocumentComposerRuntime {
	const source = new ObsidianComposerSourceAdapter(app);
	const events = new ObsidianComposerFileEventsAdapter(app);
	const revisionService = new ComposerSourceRevisionService();
	return new DocumentComposerRuntime(source, events, revisionService);
}
