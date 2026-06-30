import { Modal } from 'obsidian';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/app/ui-host/ReactElementFactory';
import { composeCopilotPanelVault } from '@/app/copilot/panels/composeCopilotPanelVault';
import { type CopilotAction, type DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import { DocumentContextBuilder } from '@/service/copilot/DocumentContextBuilder';
import { getSelectedTextFromActiveEditor } from '@/app/platform/vault/obsidian-utils';
import type { IntentTabId } from '@/service/copilot/intent-hub';
import { AppContext } from '@/app/context/AppContext';
import { type CopilotReviewHistoryRecord } from '@/service/copilot/CopilotReviewHistoryService';
import type { VaultReviewHistoryRecord } from '@/service/copilot/vault/VaultReviewReportService';
import { CopilotPickerContent } from '@/ui/view/copilot/CopilotPickerContent';
import { CopilotResultModal } from '@/app/copilot/modals/CopilotResultModal';
import { CopilotAutoRunModal } from '@/app/copilot/modals/CopilotAutoRunModal';
import { CopilotReviewHistoryModal } from '@/app/copilot/modals/CopilotReviewHistoryModal';
import { VaultAutoRunModal } from '@/app/copilot/modals/VaultAutoRunModal';
import { openVaultReviewHistoryRecord } from '@/app/copilot/modals/openVaultReviewHistoryRecord';

export interface CopilotPickerOptions {
	initialTab?: IntentTabId;
}

export class CopilotPickerModal extends Modal {
	private reactRenderer: ReactRenderer | null = null;
	private openToken = 0;
	private closed = true;

	constructor(private appContext: AppContext, private options: CopilotPickerOptions = {}) {
		super(appContext.app);
	}

	async onOpen(): Promise<void> {
		const token = ++this.openToken;
		this.closed = false;
		this.contentEl.empty();
		this.modalEl.addClass('peak-copilot-picker-modal');
		this.modalEl.addClass('peak-design-root');
		this.contentEl.addClass('pktw-root');
		this.modalEl.style.width = '1080px';
		this.modalEl.style.maxWidth = '96vw';
		this.modalEl.style.height = 'min(820px, calc(100vh - 64px))';
		this.modalEl.style.padding = '0';
		this.contentEl.style.padding = '0';

		const app = this.appContext.app;
		const file = app.workspace.getActiveFile();
		let ctx: DocumentContext | null = null;
		if (file) {
			// Route the document-context vault read through the same
			// `CopilotPanelVaultPort` adapter the result panels use.
			const content = await composeCopilotPanelVault(this.appContext).vault.readFileContent(file);
			if (this.closed || token !== this.openToken) return;
			const selected = getSelectedTextFromActiveEditor(app) ?? undefined;
			ctx = DocumentContextBuilder.build(app, file, content, selected);
		}
		if (this.closed || token !== this.openToken) return;

		this.reactRenderer = new ReactRenderer(this.containerEl);
		this.reactRenderer.render(
			createReactElementWithServices(
				CopilotPickerContent,
				{
					ctx,
					initialTab: this.options.initialTab ?? 'document',
					onSelect: (action: CopilotAction) => {
						if (!ctx) return;
						this.close();
						new CopilotResultModal(app, { action, ctx }).open();
					},
					onAuto: (tab: IntentTabId, mode: 'fast' | 'complete') => {
						this.close();
						if (tab === 'vault') {
							new VaultAutoRunModal(app, { mode }).open();
							return;
						}
						if (!ctx) return;
						new CopilotAutoRunModal(app, { tab, ctx, mode }).open();
					},
					onOpenHistoryRecord: async (record: CopilotReviewHistoryRecord) => {
						if (!ctx) return;
						this.close();
						const { snapshot, chats } = await this.appContext.copilotReviewHistory.loadWithChats(record);
						if (!snapshot) return;
						new CopilotAutoRunModal(app, {
							tab: this.options.initialTab ?? 'document',
							ctx,
							mode: record.mode,
							initialSnapshot: snapshot,
							initialInsightChats: chats,
						}).open();
					},
					onOpenAllHistory: (scopeTab: IntentTabId) => {
						const ctxAppContext = this.appContext;
						// Scope follows the tab the user is on RIGHT NOW.
						const scope: 'document' | 'vault' =
							scopeTab === 'vault' ? 'vault' : 'document';
						const currentNotePath = ctx?.file.path ?? null;
						this.close();
						new CopilotReviewHistoryModal(app, {
							scope,
							currentNotePath,
							onBackToPicker: () => {
								new CopilotPickerModal(ctxAppContext, { initialTab: scopeTab }).open();
							},
						}).open();
					},
					onOpenVaultRecord: (record: VaultReviewHistoryRecord) => {
						this.close();
						openVaultReviewHistoryRecord(app, record);
					},
				},
				this.appContext,
			),
		);
	}

	onClose(): void {
		this.closed = true;
		this.openToken++;
		const r = this.reactRenderer;
		this.reactRenderer = null;
		if (r) setTimeout(() => { r.unmount(); this.contentEl.empty(); }, 0);
		else this.contentEl.empty();
	}
}
