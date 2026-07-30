/**
 * Peak Composer — document session (WP1).
 *
 * A session is the framework-neutral, per-document model the app-layer view /
 * controller drives and that WP2 attaches transactions + candidate/History
 * state to. It owns the current {@link ComposerDocumentSnapshot} for one file,
 * knows its base revision, and can reparse from fresh source.
 *
 * It performs NO I/O itself: source reads come through a {@link ComposerSourcePort}
 * (implemented by an Obsidian adapter in the app layer / a fake in tests), so
 * the session stays testable and boundary-clean.
 */

import type { ComposerBlock, ComposerDocumentSnapshot } from '@/core/composer';
import { parseComposerDocument } from './documentParser';
import { ComposerSourceRevisionService } from './sourceRevisionService';
import type { ComposerSourcePort } from './ports';

export class ComposerDocumentSession {
	private snapshotRef: ComposerDocumentSnapshot;
	private filePathRef: string;

	private constructor(
		filePath: string,
		snapshot: ComposerDocumentSnapshot,
		private readonly revisionService: ComposerSourceRevisionService,
	) {
		this.filePathRef = filePath;
		this.snapshotRef = snapshot;
	}

	get filePath(): string {
		return this.filePathRef;
	}

	/** Parse `sourceText` into a fresh session (no port read). */
	static fromSource(
		filePath: string,
		sourceText: string,
		revisionService = new ComposerSourceRevisionService(),
	): ComposerDocumentSession {
		const snapshot = parseComposerDocument(sourceText, { filePath });
		return new ComposerDocumentSession(filePath, snapshot, revisionService);
	}

	/** Load a session by reading the file through the source port. */
	static async load(
		port: ComposerSourcePort,
		filePath: string,
		revisionService = new ComposerSourceRevisionService(),
	): Promise<ComposerDocumentSession> {
		const sourceText = await port.readSource(filePath);
		return ComposerDocumentSession.fromSource(filePath, sourceText, revisionService);
	}

	/** The current immutable snapshot. */
	get snapshot(): ComposerDocumentSnapshot {
		return this.snapshotRef;
	}

	/** The revision the current snapshot was parsed from. */
	get baseRevision(): string {
		return this.snapshotRef.revision;
	}

	getBlock(blockId: string): ComposerBlock | undefined {
		return this.snapshotRef.blocks.find((b) => b.blockId === blockId);
	}

	/** True when `currentText` differs from the parsed snapshot. */
	isStale(currentText: string): boolean {
		return this.revisionService.isExternallyModified(this.snapshotRef, currentText);
	}

	/**
	 * Reparse from fresh source text and adopt the new snapshot. Returns the new
	 * snapshot. Used after an external modification / accepted transaction.
	 */
	reparse(sourceText: string): ComposerDocumentSnapshot {
		this.snapshotRef = this.parse(sourceText);
		return this.snapshotRef;
	}

	/** Parse fresh source for this stable document identity without adopting it. */
	parse(sourceText: string): ComposerDocumentSnapshot {
		const parsed = parseComposerDocument(sourceText, { filePath: this.filePath });
		return {
			...parsed,
			documentId: this.snapshotRef.documentId,
			filePath: this.filePath,
		};
	}

	/**
	 * Rebind a vault rename without changing the stable document identity or
	 * dropping candidate/history state owned by the document registry.
	 */
	rebindFilePath(filePath: string): ComposerDocumentSnapshot {
		if (!filePath || filePath === this.filePathRef) return this.snapshotRef;
		this.filePathRef = filePath;
		this.snapshotRef = {
			...this.snapshotRef,
			filePath,
		};
		return this.snapshotRef;
	}

	/**
	 * Adopt a snapshot that has already been parsed and validated for this file.
	 * TransactionEngine uses this after its reparse-safety check so a direct edit
	 * does not parse the whole document a second time merely to advance session
	 * state.
	 */
	adoptSnapshot(snapshot: ComposerDocumentSnapshot): ComposerDocumentSnapshot {
		if (snapshot.filePath !== this.filePath) {
			throw new Error(`Composer snapshot path ${snapshot.filePath} does not match session ${this.filePath}`);
		}
		this.snapshotRef = {
			...snapshot,
			documentId: this.snapshotRef.documentId,
		};
		return this.snapshotRef;
	}

	/** Reparse by re-reading through the source port. */
	async refresh(port: ComposerSourcePort): Promise<ComposerDocumentSnapshot> {
		const sourceText = await port.readSource(this.filePath);
		return this.reparse(sourceText);
	}
}
