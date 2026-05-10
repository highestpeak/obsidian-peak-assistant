import { Modal, Notice, FuzzySuggestModal, TFolder, type TFile } from 'obsidian';
import React from 'react';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';
import { TagSuggestionEngine } from '@/service/copilot/TagSuggestionEngine';
import { SqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { AdaptiveConcurrencyPool } from '@/core/utils/adaptive-concurrency';
import { BatchTagPanel } from './panels/BatchTagPanel';
import type { TagSuggestions } from '@/service/copilot/copilot-schemas';
import { v4 as uuidv4 } from 'uuid';

class FolderPickerModal extends FuzzySuggestModal<TFolder> {
	private onChoose: (folder: TFolder) => void;

	constructor(appContext: AppContext, onChoose: (folder: TFolder) => void) {
		super(appContext.app);
		this.onChoose = onChoose;
		this.setPlaceholder('Pick a folder to batch-tag...');
	}

	getItems(): TFolder[] {
		return this.app.vault.getAllLoadedFiles().filter(
			(f): f is TFolder => f instanceof TFolder,
		);
	}

	getItemText(folder: TFolder): string {
		return folder.path || '/';
	}

	onChooseItem(folder: TFolder): void {
		this.onChoose(folder);
	}
}

/**
 * Persistent bottom notice with updatable message.
 */
function openProgressNotice(initial: string): {
	setMessage: (text: string) => void;
	hide: () => void;
} {
	let n = new Notice(initial, 0);
	const setMessage = (text: string) => {
		const nn = n as Notice & { setMessage?: (m: string) => void };
		if (typeof nn.setMessage === 'function') {
			nn.setMessage(text);
		} else {
			n.hide();
			n = new Notice(text, 0);
		}
	};
	return { setMessage, hide: () => n.hide() };
}

interface BatchDocResult {
	file: TFile;
	suggestions: TagSuggestions['suggestions'];
	batchId: string;
}

export class BatchTagModal extends Modal {
	private reactRenderer: ReactRenderer | null = null;
	private appContext: AppContext;

	constructor(appContext: AppContext) {
		super(appContext.app);
		this.appContext = appContext;
	}

	onOpen(): void {
		this.contentEl.empty();
		this.modalEl.addClass('peak-copilot-modal');
		this.contentEl.addClass('pktw-root');
		this.modalEl.style.width = '760px';
		this.modalEl.style.maxWidth = '90vw';

		// Start by picking a folder
		this.close();
		new FolderPickerModal(this.appContext, (folder) => {
			void this.runBatchAnalysis(folder);
		}).open();
	}

	private async runBatchAnalysis(folder: TFolder): Promise<void> {
		const app = this.appContext.app;
		const files = app.vault.getMarkdownFiles().filter(f => f.path.startsWith(folder.path + '/'));

		if (files.length === 0) {
			new Notice('No markdown files found in this folder.', 4000);
			return;
		}

		// Filter out docs with 5+ existing topic tags
		const candidates: TFile[] = [];
		for (const file of files) {
			const cache = app.metadataCache.getFileCache(file);
			const fmTags = (cache?.frontmatter?.tags as string[] | undefined) ?? [];
			const inlineTags = cache?.tags?.map(t => t.tag) ?? [];
			const allTags = [...fmTags, ...inlineTags];
			if (allTags.length < 5) {
				candidates.push(file);
			}
		}

		if (candidates.length === 0) {
			new Notice('All documents in this folder already have 5+ tags.', 4000);
			return;
		}

		const notice = openProgressNotice(`Batch Tag: preparing ${candidates.length} documents...`);
		const engine = new TagSuggestionEngine(this.appContext.manager);
		const pool = new AdaptiveConcurrencyPool({
			initial: 3,
			min: 1,
			max: 5,
			targetLatencyMs: 10000,
		});

		let done = 0;
		const total = candidates.length;
		const results: BatchDocResult[] = [];

		try {
			await pool.mapWithAdaptiveConcurrency(candidates, async (file) => {
				const content = await app.vault.read(file);
				const ranked = await engine.suggestTags(file.path, content, file.basename);
				done++;
				notice.setMessage(`Batch Tag: analyzing ${done}/${total} — ${file.basename}`);

				if (ranked.length === 0) return;

				const batchId = uuidv4();
				// Persist to DB
				try {
					const repo = SqliteStoreManager.getInstance().getTagSuggestionRepo();
					await repo.insertBatch({
						docPath: file.path,
						batchId,
						suggestions: ranked.map(r => ({
							tag: r.tag,
							category: r.category,
							confidence: r.confidence,
							sources: r.sources,
							reason: r.reason,
							isExisting: false,
						})),
					});
				} catch (e) {
					console.warn('[BatchTagModal] Failed to persist suggestions:', e);
				}

				results.push({
					file,
					suggestions: ranked.map(r => ({
						tag: r.tag,
						confidence: r.confidence,
						reason: r.reason,
						category: r.category,
						sources: r.sources,
					})),
					batchId,
				});
			});
		} catch (e) {
			notice.hide();
			new Notice(`Batch analysis failed: ${(e as Error).message}`, 8000);
			return;
		}

		notice.hide();

		if (results.length === 0) {
			new Notice('No tag suggestions found for any documents.', 4000);
			return;
		}

		// Sort results by file path for consistent display
		results.sort((a, b) => a.file.path.localeCompare(b.file.path));

		// Open modal with results
		this.showResults(results);
	}

	private showResults(results: BatchDocResult[]): void {
		const modal = new Modal(this.app);
		modal.modalEl.addClass('peak-copilot-modal');
		modal.contentEl.addClass('pktw-root');
		modal.modalEl.style.width = '760px';
		modal.modalEl.style.maxWidth = '90vw';

		const renderer = new ReactRenderer(modal.contentEl);
		renderer.render(
			createReactElementWithServices(
				BatchTagPanel,
				{
					results,
					onClose: () => modal.close(),
				},
				this.appContext,
			),
		);

		// Clean up on close
		const originalOnClose = modal.onClose.bind(modal);
		modal.onClose = () => {
			renderer.unmount();
			originalOnClose();
		};

		modal.open();
	}

	onClose(): void {
		const r = this.reactRenderer;
		this.reactRenderer = null;
		if (r) {
			setTimeout(() => r.unmount(), 0);
		}
		this.contentEl.empty();
	}
}
