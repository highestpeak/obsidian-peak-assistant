/**
 * Peak Composer — Obsidian adapters for the service ports (WP1).
 *
 * This is the ONE composer file allowed to touch Obsidian's vault/workspace.
 * It maps Obsidian events onto the framework-neutral `ComposerFileEventsPort`
 * and `ComposerSourcePort` the controller consumes. All DOM/event wiring here
 * is workspace-level (not window-level), so detached popouts are unaffected.
 */

import type { App, EventRef, TAbstractFile, TFile } from 'obsidian';
import { TFile as ObsidianTFile } from 'obsidian';
import type {
	ComposerComment,
	ComposerCommentPersistencePort,
	ComposerFileEvent,
	ComposerFileEventsPort,
	ComposerLinkMetadataPort,
	ComposerSourcePort,
	ComposerWritePort,
	VaultLinkMeta,
} from '@/service/composer';
import { ComposerConflictError } from '@/core/composer';

/** Reads document bytes via the vault's cached read. */
export class ObsidianComposerSourceAdapter implements ComposerSourcePort {
	constructor(private readonly app: App) {}

	async readSource(filePath: string): Promise<string> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!file || !(file instanceof ObsidianTFile)) {
			throw new Error(`Composer source not found: ${filePath}`);
		}
		return this.app.vault.cachedRead(file);
	}
}

/**
 * Atomic, revision-guarded write via `vault.process` (WP2). It reads the file's
 * CURRENT bytes and refuses (throws {@link ComposerConflictError}) unless they
 * still equal `expectedBaseText`, so a concurrent external edit can never be
 * silently clobbered. `vault.process` performs the read+write under Obsidian's
 * file lock, closing the read-then-modify race a bare `vault.modify` would leave.
 */
export class ObsidianComposerWriteAdapter implements ComposerWritePort {
	constructor(private readonly app: App) {}

	async writeSource(filePath: string, nextText: string, expectedBaseText: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!file || !(file instanceof ObsidianTFile)) {
			throw new Error(`Composer write target not found: ${filePath}`);
		}
		await this.app.vault.process(file, (current) => {
			if (current !== expectedBaseText) {
				throw new ComposerConflictError(
					'revision-mismatch',
					`Composer write conflict on ${filePath}: file changed since snapshot`,
				);
			}
			return nextText;
		});
	}
}

const MARKDOWN_EXT = 'md';

/**
 * Bridges Obsidian workspace/vault events to the composer file-events port.
 * `dispose()` detaches every registered `EventRef` so a hot-reloaded bundle
 * does not leak listeners.
 */
export class ObsidianComposerFileEventsAdapter implements ComposerFileEventsPort {
	private readonly refs: EventRef[] = [];

	constructor(private readonly app: App) {}

	getActiveFilePath(): string | null {
		const file = this.app.workspace.getActiveFile();
		return file && file.extension === MARKDOWN_EXT ? file.path : null;
	}

	onActiveFileChange(cb: (path: string | null) => void): () => void {
		const handler = (): void => cb(this.getActiveFilePath());
		const ref = this.app.workspace.on('active-leaf-change', handler);
		this.refs.push(ref);
		return () => this.app.workspace.offref(ref);
	}

	onFileEvent(cb: (event: ComposerFileEvent) => void): () => void {
		const modifyRef = this.app.vault.on('modify', (file: TAbstractFile) => {
			if (isMarkdown(file)) cb({ type: 'modify', path: file.path });
		});
		const renameRef = this.app.vault.on('rename', (file: TAbstractFile, oldPath: string) => {
			if (isMarkdown(file)) cb({ type: 'rename', path: file.path, oldPath });
		});
		const deleteRef = this.app.vault.on('delete', (file: TAbstractFile) => {
			if (isMarkdown(file)) cb({ type: 'delete', path: file.path });
		});
		this.refs.push(modifyRef, renameRef, deleteRef);
		return () => {
			this.app.vault.offref(modifyRef);
			this.app.vault.offref(renameRef);
			this.app.vault.offref(deleteRef);
		};
	}

	dispose(): void {
		for (const ref of this.refs) {
			this.app.vault.offref(ref);
			this.app.workspace.offref(ref);
		}
		this.refs.length = 0;
	}
}

function isMarkdown(file: TAbstractFile): file is TFile {
	return file instanceof ObsidianTFile && file.extension === MARKDOWN_EXT;
}

/**
 * Per-document comment persistence backed by plugin-owned JSON files (WP4.5).
 *
 * Comments are metadata, never Markdown body text, so they live OUTSIDE the
 * vault's note tree: one `<sanitized-doc-id>.json` per document under the
 * plugin's own data directory (`app.vault.adapter`), which Obsidian's metadata
 * cache / search index never touch. Reads/writes are whole-file (comments are
 * small, one doc at a time) — no revision guard needed since only the composer
 * writes here. Failures degrade to an empty list rather than throwing, so a
 * corrupt/absent store never blocks opening a document.
 */
export class ObsidianComposerCommentPersistence implements ComposerCommentPersistencePort {
	constructor(
		private readonly app: App,
		/** Plugin-owned directory for the comment store (e.g. `<pluginDir>/composer-comments`). */
		private readonly baseDir: string,
	) {}

	async load(documentId: string): Promise<ComposerComment[]> {
		const path = this.pathFor(documentId);
		try {
			if (!(await this.app.vault.adapter.exists(path))) return [];
			const raw = await this.app.vault.adapter.read(path);
			const parsed = JSON.parse(raw);
			return Array.isArray(parsed) ? (parsed as ComposerComment[]) : [];
		} catch {
			return [];
		}
	}

	async save(documentId: string, comments: readonly ComposerComment[]): Promise<void> {
		try {
			if (!(await this.app.vault.adapter.exists(this.baseDir))) {
				await this.app.vault.adapter.mkdir(this.baseDir);
			}
			await this.app.vault.adapter.write(this.pathFor(documentId), JSON.stringify(comments, null, 2));
		} catch {
			// Persistence is best-effort — an unwritable store must not crash editing.
		}
	}

	private pathFor(documentId: string): string {
		return `${this.baseDir}/${sanitizeDocId(documentId)}.json`;
	}
}

/** Filesystem-safe, collision-resistant key for a vault-relative document id. */
function sanitizeDocId(documentId: string): string {
	const safe = documentId.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
	// A short suffix from the raw id keeps two docs that sanitize alike distinct.
	let hash = 0;
	for (let i = 0; i < documentId.length; i++) hash = (hash * 31 + documentId.charCodeAt(i)) | 0;
	return `${safe}-${(hash >>> 0).toString(36)}`;
}

/**
 * Link metadata over Obsidian's metadata cache (WP4.5). Resolves internal
 * wikilink targets to a vault note (title / path / summary / existence) and
 * offers fuzzy repair candidates for broken links. This is the ONE composer file
 * (besides the vault adapters above) allowed to read the metadata cache; the
 * pure `buildLinkPreview` model in the service layer consumes only plain data.
 */
export class ObsidianComposerLinkMetadata implements ComposerLinkMetadataPort {
	constructor(private readonly app: App) {}

	resolveVaultLink(target: string, sourcePath: string): VaultLinkMeta | null {
		const linkpath = target.replace(/#.*$/, '').replace(/\|.*$/, '').trim();
		if (!linkpath) return null;
		const dest = this.app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
		if (!dest) return null;
		const cache = this.app.metadataCache.getFileCache(dest);
		const fm = cache?.frontmatter as Record<string, unknown> | undefined;
		const summary = typeof fm?.description === 'string' ? (fm.description as string) : undefined;
		return {
			path: dest.path,
			title: dest.basename,
			...(summary ? { summary } : {}),
			exists: true,
		};
	}

	suggestForBroken(target: string, sourcePath: string): string[] {
		const needle = target.replace(/#.*$/, '').replace(/\|.*$/, '').trim().toLowerCase();
		if (!needle) return [];
		const matches = this.app.vault
			.getMarkdownFiles()
			.filter((f) => f.path !== sourcePath && f.basename.toLowerCase().includes(needle))
			.slice(0, 5)
			.map((f) => f.path);
		return matches;
	}
}
