// T11M: Ports the Copilot **result panels** (write/insert/file-open UI
// surfaces under `src/ui/view/copilot/panels/` + the Result/AutoRun/
// PickerModal/Vault-review siblings) depend on.
//
// Before T11M each panel reached `AppContext.getInstance().app.vault.*` /
// `.workspace.*` / `.fileManager.*` directly, so the boundary scanner
// counted 33 UI -> app edges and a panel could not be exercised without
// booting the full plugin. T11M moves those raw lookups behind two cohesive
// ports — one for vault/editor writes, one for modal navigation — that the
// app composition layer (`src/app/copilot/panels/composeCopilotPanelVault.ts`)
// fulfils with a concrete Obsidian adapter.
//
// Operation naming rule (Codex correction): every method names a concrete
// action a panel performs ("append continuation", "create note from
// suggestion", "apply artifact blocks"). The port intentionally does NOT
// expose `app` / `vault` / `workspace` / `fileManager` accessors — that
// would only hide the dependency from the scanner without removing it.

import type { VaultFileRef } from '@/core/ports/VaultFileRef';
import type { DocumentContext } from '../CopilotActionRegistry';
import type { CopilotRunArtifacts } from '../CopilotRunArtifacts';
import type { IntentTabId } from '../intent-hub';

/**
 * Vault / editor write operations the Copilot panels need to apply
 * AI-generated artefacts. Implementations live in
 * `src/app/copilot/panels/AppCopilotPanelVaultAdapter.ts`.
 */
export interface CopilotPanelVaultPort {
	/** Look up an Obsidian file by vault-relative path. Returns null if missing. */
	findFileByPath(path: string): VaultFileRef | null;

	/** Currently active markdown file in the workspace, or null. */
	getActiveFile(): VaultFileRef | null;

	/** Cached vault read. */
	readFileContent(file: VaultFileRef): Promise<string>;

	/** Atomic vault rewrite. */
	replaceFileContent(file: VaultFileRef, content: string): Promise<void>;

	/**
	 * Append `text` to the end of `file` separated from existing content by a
	 * newline (single newline if the file already ends with `\n`, double
	 * newline otherwise).
	 */
	appendToFile(file: VaultFileRef, text: string): Promise<void>;

	/**
	 * Same as `appendToFile` but resolves the file by path first. Returns
	 * `false` if the path does not point to a markdown file.
	 */
	appendToFileAtPath(path: string, text: string): Promise<boolean>;

	/**
	 * Create a new markdown note inside `folder` (folder is created if missing)
	 * with the given `title` (no `.md` suffix) and `content`. Returns the
	 * resulting vault-relative path.
	 */
	createNoteInFolder(folder: string, title: string, content: string): Promise<string>;

	/**
	 * Apply Copilot change-blocks to the document context. Handles both
	 * `scope: 'selection'` (editor.replaceSelection) and `scope: 'file'`
	 * (vault.read + vault.modify) under one call.
	 *
	 * T11M: this absorbs the old `applyCopilotArtifactsToContext` service-side
	 * helper, which used to leak `AppContext.getInstance().app`. The text
	 * transform logic moved to `applyCopilotBlocksPure` (service-pure); IO
	 * lives only in the adapter.
	 */
	applyArtifacts(input: {
		ctx: DocumentContext;
		artifacts: CopilotRunArtifacts;
		selectedOnly?: boolean;
	}): Promise<{ appliedBlocks: number }>;

	/**
	 * Add the given tags to `file`'s frontmatter via Obsidian's atomic
	 * `processFrontMatter` API. Wraps the old `writeTagsToFrontmatter` helper.
	 */
	writeFrontmatterTags(file: VaultFileRef, tags: string[]): Promise<void>;

	/**
	 * Open a vault file by path in a new leaf. Falls back to `openLinkText`
	 * (which Obsidian uses for `[[wikilinks]]`) when the path does not point
	 * to an existing VaultFileRef.
	 */
	openNote(path: string, opts?: { newLeaf?: boolean | 'tab' | 'window' }): Promise<void>;

	/** Move `file` to the system/Obsidian trash. Used by the dedupe panel. */
	trashFile(file: VaultFileRef): Promise<void>;
}

/**
 * Modal/view navigation the Copilot panels trigger. Implementations live in
 * `src/app/copilot/panels/AppCopilotPanelNavigatorAdapter.ts`.
 *
 * UI consumers (`CopilotResultModal`, `CopilotAutoRunModal`,
 * `CopilotPickerModal`, `VaultAutoRunModal`) call these instead of
 * `new SettingsModal(AppContext.getInstance()).open()`.
 */
export interface CopilotPanelNavigator {
	/** Open the plugin settings modal. */
	openSettings(): void;

	/** Open the Copilot picker modal, optionally with a pre-selected tab. */
	openCopilotPicker(opts?: { initialTab?: IntentTabId }): void;
}

/**
 * T11P (Track C): The bundle struct UI consumes through `useServiceContext()
 * .copilotPanelVault`. Previously lived in
 * `src/app/copilot/panels/composeCopilotPanelVault.ts`, which forced
 * `ServiceContext.tsx` to import from `@/app/**` purely for a type.
 */
export interface CopilotPanelHostBundle {
	vault: CopilotPanelVaultPort;
	navigator: CopilotPanelNavigator;
}
