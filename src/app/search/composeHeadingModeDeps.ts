/**
 * T5 (2026-07-07 heading-mode UI): compose the heading-mode data deps
 * bundle for the React UI. The heading-mode service functions in
 * `service/search/heading/*` are pure — they take a narrow
 * `HeadingFileReaderPort` and read markdown text. This adapter binds
 * that port to Obsidian's `App.vault` at app-composition time so the
 * UI never reaches for `AppContext.getInstance()` inside components.
 *
 * The composed bundle is published on `ServiceContext.headingMode`; the
 * heading-mode components call
 * `headingMode.extractHeadingTree({ filePath, queryText })` etc. with no
 * additional deps.
 */
import type { AppContext } from '@/app/context/AppContext';
import {
	extractHeadingTree,
	getLinkPositions,
	type HeadingFileReaderPort,
} from '@/service/search/heading/headingTree';
import { getSectionSnippets } from '@/service/search/heading/sectionSnippets';
import type { HeadingModeDeps } from '@/core/ports/HeadingModePort';
import type { TFile } from 'obsidian';

// Port definition lives at `@/core/ports/HeadingModePort` so the UI does
// not need to reach into `@/app/**` for the deps type. Re-exported for
// backward compatibility with app-layer imports.
export type { HeadingModeDeps } from '@/core/ports/HeadingModePort';

function isTFile(f: unknown): f is TFile {
	return !!f && typeof f === 'object' && 'extension' in (f as Record<string, unknown>);
}

export function composeHeadingModeDeps(appContext: AppContext): HeadingModeDeps {
	const app = appContext.app;
	const fileReader: HeadingFileReaderPort = {
		async readText(path: string): Promise<string | null> {
			const f = app.vault.getAbstractFileByPath(path);
			if (!isTFile(f)) return null;
			return app.vault.read(f);
		},
	};
	// Backlinks intentionally omitted for the first cut: the edge repo
	// stores node-to-node without per-line offsets, so it can't feed
	// `HeadingBacklinkReaderPort` cheaply. Spec calls backlinks
	// "optional if available cheaply" — the footer will render an empty
	// backlinks column, which the UI handles gracefully.
	return {
		extractHeadingTree: (input) => extractHeadingTree({ fileReader }, input),
		getSectionSnippets: (filePath, section, queryText) =>
			getSectionSnippets({ fileReader }, filePath, section, queryText),
		getLinkPositions: (filePath) => getLinkPositions({ fileReader }, filePath),
	};
}
