/**
 * T11I (2026-06-26): app-layer adapter for AnalysisDocVaultWriterPort.
 *
 * Performs the actual vault writes that used to live in
 * `src/ui/view/quick-search/callbacks/save-ai-analyze-to-md.ts`.
 * Owns `AppContext.getInstance()`, Obsidian `TFile` handling, folder
 * normalization, filename sanitization, and the timestamp-suffix
 * collision rule. The service-side persistence module only sees the
 * port interface.
 */

import { TFile, TFolder } from 'obsidian';
import { AppContext } from '@/app/context/AppContext';
import { SLICE_CAPS } from '@/core/constant';
import { ensureFolder } from '@/app/platform/vault/vault-helpers';
import type { AnalysisDocVaultWriterPort } from '@/core/ports/AnalysisDocVaultWriterPort';

function sanitizeFileName(name: string): string {
	return name
		.trim()
		.replace(/[\\\/:*?"<>|]/g, '-')
		.replace(/\s+/g, ' ')
		.slice(0, SLICE_CAPS.ui.saveAnalyzeMd);
}

function normalizeFolder(raw: string): string {
	return raw.replace(/^\/+/, '').replace(/\/+$/, '');
}

export class AppAnalysisDocVaultWriterAdapter implements AnalysisDocVaultWriterPort {
	async createDoc(input: {
		folderPath: string;
		fileName: string;
		content: string;
	}): Promise<{ path: string }> {
		const app = AppContext.getInstance().app;
		const folder = normalizeFolder(input.folderPath);
		const fileName = sanitizeFileName(input.fileName || 'AI Search Results');
		const fullFolderPath = folder.length ? folder : '';
		const targetPath = fullFolderPath ? `${fullFolderPath}/${fileName}.md` : `${fileName}.md`;

		if (fullFolderPath) {
			await ensureFolder(fullFolderPath, app);
		}

		const existing = app.vault.getAbstractFileByPath(targetPath);
		let finalPath = targetPath;
		if (existing) {
			const ts = new Date().toISOString().replace(/[:.]/g, '-');
			finalPath = fullFolderPath
				? `${fullFolderPath}/${fileName}-${ts}.md`
				: `${fileName}-${ts}.md`;
		}
		await app.vault.create(finalPath, input.content);
		return { path: finalPath };
	}

	async overwriteDoc(path: string, content: string): Promise<void> {
		const app = AppContext.getInstance().app;
		const file = app.vault.getAbstractFileByPath(path);
		if (file && file instanceof TFile) {
			await app.vault.modify(file, content);
		}
	}

	// --- AiAnalysisStoreVaultAdapter (JSON store primitives) ---

	async ensureFolder(folderPath: string): Promise<void> {
		if (!folderPath) return;
		const app = AppContext.getInstance().app;
		await ensureFolder(folderPath, app);
	}

	exists(path: string): boolean {
		const app = AppContext.getInstance().app;
		return !!app.vault.getAbstractFileByPath(path);
	}

	async create(path: string, content: string): Promise<void> {
		const app = AppContext.getInstance().app;
		await app.vault.create(path, content);
	}

	async read(path: string): Promise<string | null> {
		const app = AppContext.getInstance().app;
		const file = app.vault.getAbstractFileByPath(path);
		if (!file || !(file instanceof TFile)) return null;
		return app.vault.read(file);
	}

	listJsonPaths(folderPath: string): string[] {
		const app = AppContext.getInstance().app;
		const folder = app.vault.getAbstractFileByPath(folderPath);
		if (!folder || !(folder instanceof TFolder)) return [];
		return folder.children
			.filter((child): child is TFile => child instanceof TFile && child.extension === 'json')
			.map((child) => child.path);
	}
}
