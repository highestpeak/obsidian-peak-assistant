import React from 'react';
import type { IconName, WorkspaceLeaf } from 'obsidian';
import { TFile } from 'obsidian';

import { ReactFileViewHost } from '@/app/ui-host/ReactFileViewHost';
import { createReactElementWithServices } from '@/app/ui-host/ReactElementFactory';
import { PEAK_SHEET_VIEW_TYPE } from '@/app/ui-host/views/types';
import { PeakSheet } from '@/ui/view/peak-sheet/PeakSheet';
import { PeakSheetAttachmentAdapter } from '@/app/sheet/PeakSheetAttachmentAdapter';
import type { AppContext } from '@/app/context/AppContext';

export { PEAK_SHEET_VIEW_TYPE };

/** One Obsidian file view per visible `.peaksheet` document. */
export class PeakSheetView extends ReactFileViewHost {
	protected readonly viewType = PEAK_SHEET_VIEW_TYPE;
	protected readonly displayText = 'Peak Sheet';
	public readonly icon: IconName = 'table-2';
	protected readonly rootClasses = ['peak-design-root', 'pktw-root', 'peak-sheet-view'] as const;
	private datasetId: string | null = null;
	private loadError: string | null = null;

	constructor(leaf: WorkspaceLeaf, appContext: AppContext) {
		super(leaf, appContext);
		this.allowNoFile = false;
		this.navigation = true;
	}

	getDisplayText(): string {
		return this.file?.basename || this.displayText;
	}

	async onLoadFile(file: TFile): Promise<void> {
		await super.onLoadFile(file);
		const runtime = this.appContext.runtimeRegistry.tryGetPeakSheetRuntime();
		if (!runtime) {
			this.datasetId = null;
			this.loadError = 'Peak Sheet runtime is unavailable.';
			this.rerender();
			return;
		}
		try {
			const snapshot = await runtime.openFile(file.path);
			this.datasetId = snapshot.datasetId;
			this.loadError = null;
		} catch (error) {
			this.datasetId = null;
			this.loadError = error instanceof Error ? error.message : String(error);
		}
		this.rerender();
	}

	async onUnloadFile(file: TFile): Promise<void> {
		this.datasetId = null;
		this.loadError = null;
		this.rerender();
		await super.onUnloadFile(file);
	}

	async onRename(file: TFile): Promise<void> {
		await super.onRename(file);
		const runtime = this.appContext.runtimeRegistry.tryGetPeakSheetRuntime();
		if (runtime) {
			try {
				const snapshot = await runtime.openFile(file.path);
				this.datasetId = snapshot.datasetId;
				this.loadError = null;
			} catch (error) {
				this.loadError = error instanceof Error ? error.message : String(error);
			}
		}
		this.rerender();
	}

	protected renderElement(): React.ReactElement {
		const runtime = this.appContext.runtimeRegistry.tryGetPeakSheetRuntime();
		if (!runtime) return React.createElement('div', { className: 'peak-sheet-empty' }, 'Peak Sheet runtime is unavailable.');
		if (this.loadError) return React.createElement('div', { className: 'peak-sheet-file-error' }, this.loadError);
		if (!this.datasetId || !this.file) return React.createElement('div', { className: 'peak-sheet-empty' }, 'Open a .peaksheet file.');
		return createReactElementWithServices(PeakSheet, {
			runtime,
			datasetId: this.datasetId,
			filePath: this.file.path,
			attachmentPort: new PeakSheetAttachmentAdapter(this.appContext.app, this.appContext.settings.ai.rootFolder),
			onOpenFile: async (path: string) => {
				const file = this.appContext.app.vault.getAbstractFileByPath(path);
				if (!(file instanceof TFile)) throw new Error(`Peak Sheet file “${path}” does not exist.`);
				await this.leaf.openFile(file);
			},
		}, this.appContext);
	}
}
