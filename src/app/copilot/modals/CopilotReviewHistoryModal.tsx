import { Modal, type App, TFile, Notice } from 'obsidian';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/app/react/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';
import { composeCopilotPanelVault } from '@/app/copilot/panels/composeCopilotPanelVault';
import {
	getCopilotReviewHistoryService,
	type CopilotReviewHistoryRecord,
} from '@/service/copilot/CopilotReviewHistoryService';
import type { VaultReviewHistoryRecord } from '@/service/copilot/vault/VaultReviewReportService';
import { DocumentContextBuilder } from '@/service/copilot/DocumentContextBuilder';
import {
	CopilotReviewHistoryContent,
	type NormalizedRecord,
	type Scope,
} from '@/ui/view/copilot/CopilotReviewHistoryContent';
import { CopilotAutoRunModal } from '@/app/copilot/modals/CopilotAutoRunModal';
import { openVaultReviewHistoryRecord } from '@/app/copilot/modals/openVaultReviewHistoryRecord';

export interface CopilotReviewHistoryModalOptions {
	/** 'document' (default) shows Copilot per-note reviews. 'vault' shows vault auto-reviews. */
	scope?: Scope;
	/** When set, the Document scope shows a "This note / All notes" toggle defaulting to "This note". */
	currentNotePath?: string | null;
	/** When provided, header shows a "Back" button that fires this callback (after closing the modal). */
	onBackToPicker?: () => void;
}

export class CopilotReviewHistoryModal extends Modal {
	private reactRenderer: ReactRenderer | null = null;

	constructor(app: App, private readonly options: CopilotReviewHistoryModalOptions = {}) {
		super(app);
	}

	onOpen(): void {
		this.contentEl.empty();
		this.modalEl.addClass('peak-copilot-review-history-modal');
		this.modalEl.addClass('peak-design-root');
		this.contentEl.addClass('pktw-root');
		this.contentEl.style.padding = '0';
		this.modalEl.style.width = '880px';
		this.modalEl.style.maxWidth = '92vw';
		this.modalEl.style.height = 'min(760px, calc(100vh - 96px))';
		this.modalEl.style.padding = '0';
		this.reactRenderer = new ReactRenderer(this.containerEl);
		this.reactRenderer.render(
			createReactElementWithServices(
				CopilotReviewHistoryContent,
				{
					scope: this.options.scope ?? 'document',
					currentNotePath: this.options.currentNotePath ?? null,
					onOpenRecord: async (record: NormalizedRecord) => {
						if (record.scope === 'vault') {
							this.close();
							openVaultReviewHistoryRecord(this.app, record.raw as VaultReviewHistoryRecord);
							return;
						}
						const doc = record.raw as CopilotReviewHistoryRecord;
						const { snapshot, chats } = await getCopilotReviewHistoryService().loadWithChats(doc);
						if (!snapshot) {
							new Notice('Could not load this review record.');
							return;
						}
						// Replay-time vault read goes through the same
						// `CopilotPanelVaultPort` adapter the panels use.
						const panelVault = composeCopilotPanelVault(AppContext.getInstance()).vault;
						const file = panelVault.findFileByPath(doc.subjectPath);
						let ctx;
						if (file) {
							const content = await panelVault.readFileContent(file);
							ctx = DocumentContextBuilder.build(this.app, file, content, undefined);
						} else {
							// Subject file no longer exists. Build a minimal stub ctx.
							ctx = {
								file: { path: doc.subjectPath, basename: doc.subjectBasename } as TFile,
								title: doc.subjectBasename,
								content: '',
								scope: 'full' as const,
								wordCount: 0,
								tags: [],
								links: [],
								backlinks: 0,
								headingCount: 0,
								isOrphan: true,
								frontmatter: {},
							};
						}
						this.close();
						new CopilotAutoRunModal(this.app, {
							tab: 'document',
							ctx,
							mode: doc.mode,
							initialSnapshot: snapshot,
							initialInsightChats: chats,
						}).open();
					},
					onClose: () => this.close(),
					onBackToPicker: this.options.onBackToPicker
						? () => {
							const cb = this.options.onBackToPicker!;
							this.close();
							cb();
						}
						: undefined,
				},
				AppContext.getInstance(),
			),
		);
	}

	onClose(): void {
		const r = this.reactRenderer;
		this.reactRenderer = null;
		if (r) setTimeout(() => { r.unmount(); this.contentEl.empty(); }, 0);
		else this.contentEl.empty();
	}
}
