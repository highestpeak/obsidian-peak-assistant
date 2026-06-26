import { Modal, type App } from 'obsidian';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/app/react/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import type { ReviewSessionSnapshot } from '@/service/copilot/CopilotReviewSession';
import type { ReviewMode } from '@/service/copilot/CopilotMetaAgentStream';
import type { InsightChatHistories } from '@/service/copilot/CopilotReviewHistoryService';
import type { IntentTabId } from '@/service/copilot/intent-hub';
import { CopilotAutoRunContent } from '@/ui/view/copilot/CopilotAutoRunContent';

export interface CopilotAutoRunModalProps {
	tab: IntentTabId;
	ctx: DocumentContext;
	mode?: ReviewMode;
	/**
	 * When provided, the modal opens in read-only history mode:
	 *   - The agent loop is NOT run.
	 *   - The snapshot is shown as-is.
	 *   - Apply buttons are disabled (the original document may have changed).
	 */
	initialSnapshot?: ReviewSessionSnapshot;
	/** Persisted insight-chat histories restored from disk (read-only mode). */
	initialInsightChats?: InsightChatHistories;
}

export class CopilotAutoRunModal extends Modal {
	private reactRenderer: ReactRenderer | null = null;

	constructor(app: App, private props: CopilotAutoRunModalProps) {
		super(app);
	}

	onOpen(): void {
		this.contentEl.empty();
		this.contentEl.addClass('pktw-root');
		this.contentEl.style.padding = '0';
		this.modalEl.style.width = '1240px';
		this.modalEl.style.maxWidth = '92vw';
		this.modalEl.style.height = 'min(820px, calc(100vh - 72px))';
		this.modalEl.style.padding = '0';
		this.reactRenderer = new ReactRenderer(this.containerEl);
		this.reactRenderer.render(
			createReactElementWithServices(
				CopilotAutoRunContent,
				{
					tab: this.props.tab,
					ctx: this.props.ctx,
					mode: this.props.mode ?? 'complete',
					initialSnapshot: this.props.initialSnapshot,
					initialInsightChats: this.props.initialInsightChats,
					onClose: () => this.close(),
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
