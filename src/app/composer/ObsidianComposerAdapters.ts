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
	ComposerRelatedMaterialSnapshot,
	ComposerRelatedMaterialsPort,
	ComposerSourcePort,
	ComposerWritePort,
	IntelligenceTelemetryEvent,
	IntelligenceTelemetryPort,
	VaultFrontmatterRecord,
	VaultLinkMeta,
	VaultPropertyScanPort,
} from '@/service/composer';
import { buildRelatedSnapshot, emptyRelatedSnapshot, JsonlTelemetrySink } from '@/service/composer';
import { ComposerConflictError } from '@/core/composer';
import type { SearchClient } from '@/service/search/SearchClient';
import type { SearchResultItem } from '@/core/search/searchTypes';

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

/** Bounded knobs for the related-material adapter (semantic retrieval + graph cap). */
export interface ComposerRelatedMaterialsOptions {
	/** How many neighbours to retrieve (the complete List/Tree set). */
	readonly topK: number;
	/** How many top-ranked items to project into the graph (node-only fit). */
	readonly graphNodeCap: number;
}

const DEFAULT_RELATED_OPTIONS: ComposerRelatedMaterialsOptions = { topK: 24, graphNodeCap: 100 };

/**
 * Related-material port over the existing vector search (WP9 §12.4).
 *
 * Given the focused block's verbatim text (or a document excerpt), it runs a
 * semantic (`vectorSearch`) retrieval, drops the current document from the
 * results and maps the ranked hits into a frozen
 * {@link ComposerRelatedMaterialSnapshot} via the pure `buildRelatedSnapshot`
 * mapper. The `SearchClient` is resolved lazily through the injected getter, so
 * the pre-SQLite / mobile / disabled-search window degrades to an EMPTY snapshot
 * (never throws) — the Sidecar already renders an empty brief in that case.
 */
export class ObsidianComposerRelatedMaterials implements ComposerRelatedMaterialsPort {
	private seq = 0;

	constructor(
		private readonly getSearchClient: () => SearchClient | null,
		private readonly options: ComposerRelatedMaterialsOptions = DEFAULT_RELATED_OPTIONS,
	) {}

	async buildSnapshot(focus: {
		anchorId: string;
		documentId: string;
		focusText?: string;
	}): Promise<ComposerRelatedMaterialSnapshot> {
		const client = this.getSearchClient();
		const text = (focus.focusText ?? '').trim();
		// No search service, or no query text to relate against → degrade cleanly.
		if (!client || !text) return emptyRelatedSnapshot(focus);
		try {
			const res = await client.vectorSearch({
				text,
				scopeMode: 'all',
				searchMode: 'vector',
				topK: this.options.topK,
			});
			const items = (res.items ?? []).filter((it) => !isSameDocument(it, focus.documentId));
			this.seq += 1;
			return buildRelatedSnapshot({
				focus: { anchorId: focus.anchorId, rootNodeId: focus.documentId },
				revision: `${Date.now().toString(36)}-${this.seq.toString(36)}`,
				items,
				graphNodeCap: this.options.graphNodeCap,
			});
		} catch {
			// Search failure must never block the Sidecar — degrade to empty.
			return emptyRelatedSnapshot(focus);
		}
	}
}

/** Whether a result item points at the focused document itself (excluded from related). */
function isSameDocument(item: SearchResultItem, documentId: string): boolean {
	return item.path === documentId || item.docId === documentId || item.id === documentId;
}

/**
 * Privacy-safe telemetry sink backed by a plugin-owned JSONL stream (WP9 §12.7).
 *
 * The proactive-intelligence evaluation stream is a distinct concern from the
 * cost/token usage dashboard (`UsageTrackingService`), so it is NOT routed there.
 * Local-first: events append one JSON object per line to
 * `<pluginDir>/telemetry/composer-intelligence.jsonl`, outside the vault note
 * tree (Obsidian's metadata cache / search index never touch it), mirroring the
 * comment store's plugin-dir file pattern. `IntelligenceRuntime` wraps every emit
 * in {@link RedactingTelemetry}, so content/prompt/evidence are already stripped
 * before they reach this sink. Writes are fire-and-forget and best-effort: an
 * unwritable stream must never crash editing.
 */
export class ObsidianComposerIntelligenceTelemetry implements IntelligenceTelemetryPort {
	private ensured = false;
	private readonly sink: JsonlTelemetrySink;
	private readonly filePath: string;

	constructor(
		private readonly app: App,
		/** Plugin-owned directory for the telemetry stream (e.g. `<pluginDir>/telemetry`). */
		private readonly baseDir: string,
		fileName = 'composer-intelligence.jsonl',
	) {
		this.filePath = `${baseDir}/${fileName}`;
		// The neutral sink owns JSONL serialization + append ordering; this class only
		// binds the append to the plugin-dir vault adapter (lazy mkdir, best-effort).
		this.sink = new JsonlTelemetrySink({ appendLine: (line) => this.append(line) });
	}

	emit(event: IntelligenceTelemetryEvent): void {
		this.sink.emit(event);
	}

	private async append(line: string): Promise<void> {
		if (!this.ensured) {
			if (!(await this.app.vault.adapter.exists(this.baseDir))) {
				await this.app.vault.adapter.mkdir(this.baseDir);
			}
			this.ensured = true;
		}
		await this.app.vault.adapter.append(this.filePath, line);
	}
}

/**
 * Vault property inventory scan over Obsidian's metadata cache (WP5, §8.2).
 *
 * Implements the framework-neutral {@link VaultPropertyScanPort}: it reads every
 * markdown note's parsed frontmatter straight from the metadata cache (no file
 * I/O — the cache already holds it), so the pure `computeVaultPropertyInventory`
 * statistics can run without Obsidian. The scan is LAZY and CACHED: it rebuilds
 * only when the metadata cache signals a change (a `resolved`/`changed` event
 * flips a dirty flag), never on every render/panel open, so a large vault is
 * walked at most once per real mutation. `dispose()` detaches the listener.
 */
export class ObsidianComposerVaultInventory implements VaultPropertyScanPort {
	private cache: VaultFrontmatterRecord[] | null = null;
	private dirty = true;
	private readonly refs: EventRef[] = [];

	constructor(private readonly app: App) {
		const invalidate = (): void => {
			this.dirty = true;
		};
		this.refs.push(this.app.metadataCache.on('changed', invalidate));
		this.refs.push(this.app.metadataCache.on('resolved', invalidate));
		this.refs.push(this.app.metadataCache.on('deleted', invalidate));
	}

	scanFrontmatter(): VaultFrontmatterRecord[] {
		if (!this.dirty && this.cache) return this.cache;
		const records: VaultFrontmatterRecord[] = [];
		for (const file of this.app.vault.getMarkdownFiles()) {
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
			if (!fm) continue;
			// `position` is metadata-cache bookkeeping, never a user property.
			const { position: _position, ...rest } = fm as Record<string, unknown>;
			if (Object.keys(rest).length === 0) continue;
			records.push({ path: file.path, frontmatter: rest });
		}
		this.cache = records;
		this.dirty = false;
		return records;
	}

	dispose(): void {
		for (const ref of this.refs) this.app.metadataCache.offref(ref);
		this.refs.length = 0;
		this.cache = null;
	}
}
