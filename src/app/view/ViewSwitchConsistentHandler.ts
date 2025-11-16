import { App, ViewState, WorkspaceLeaf } from 'obsidian';
import { CHAT_VIEW_TYPE, PROJECT_LIST_VIEW_TYPE, MESSAGE_HISTORY_VIEW_TYPE, TRACKED_VIEW_TYPES } from 'src/app/view/types';

/**
 * Ensures that when in chat view, the left, center, and right panes always maintain a consistent chat-related layout
 * (i.e. left: project list, center: chat, right: message history), and correspondingly, when in document view,
 * all three panes consistently show document-related views. This prevents scenarios where some panes display chat
 * views and others display document views at the same time.
 */
export class ViewSwitchConsistentHandler {
	private defaultLeftLeaf?: WorkspaceLeaf;
	private defaultRightLeaf?: WorkspaceLeaf;
	private defaultLeftState?: ViewState;
	private defaultRightState?: ViewState;
	private isChatLayoutActive = false;

	constructor(app: App) {
		this.app = app;
	}

	private readonly app: App;

	/**
	 * Ensures chat layout views are active and focused.
	 */
	async activateChatView(): Promise<void> {
		if (this.isChatLayoutActive) return;

		this.captureDocumentLayoutSnapshot();

		const existingChatLeaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
		const centerLeaf = existingChatLeaves[0] ?? this.app.workspace.getLeaf(true);
		if (!centerLeaf) return;
		await centerLeaf.setViewState({ type: CHAT_VIEW_TYPE, active: true });

		const leftLeaf = this.defaultLeftLeaf ?? this.app.workspace.getLeftLeaf(true);
		if (leftLeaf) {
			await leftLeaf.setViewState({ type: PROJECT_LIST_VIEW_TYPE, active: false });
			this.defaultLeftLeaf = leftLeaf;
		}

		const rightLeaf = this.defaultRightLeaf ?? this.app.workspace.getRightLeaf(true);
		if (rightLeaf) {
			await rightLeaf.setViewState({ type: MESSAGE_HISTORY_VIEW_TYPE, active: false });
			this.defaultRightLeaf = rightLeaf;
		}

		this.app.workspace.revealLeaf(centerLeaf);
		this.isChatLayoutActive = true;
	}

	/**
	 * Returns to the regular document layout, restoring cached states.
	 */
	async enterDocumentLayout(): Promise<void> {
		if (!this.isChatLayoutActive) return;

		const fallbackLeft: ViewState = { type: 'file-explorer', state: {}, active: false } as ViewState;
		const fallbackRight: ViewState = { type: 'outline', state: {}, active: false } as ViewState;

		if (this.defaultLeftLeaf) {
			const state = this.defaultLeftState ?? fallbackLeft;
			await this.defaultLeftLeaf.setViewState({ ...state, active: false });
		}

		if (this.defaultRightLeaf) {
			const state = this.defaultRightState ?? fallbackRight;
			await this.defaultRightLeaf.setViewState({ ...state, active: false });
		}

		this.isChatLayoutActive = false;
	}

	/**
	 * Mirrors Obsidian active leaf changes to toggle layouts automatically.
	 */
	handleActiveLeafChange(leaf?: WorkspaceLeaf | null): void {
		const viewType = leaf?.view?.getViewType();
		if (viewType && TRACKED_VIEW_TYPES.has(viewType)) {
			void this.activateChatView();
		} else {
			void this.enterDocumentLayout();
		}
	}

	private captureDocumentLayoutSnapshot(): void {
		const leftLeaf = this.app.workspace.getLeftLeaf(false);
		if (leftLeaf) {
			this.defaultLeftLeaf = leftLeaf;
			const state = leftLeaf.getViewState();
			if (state && state.type !== PROJECT_LIST_VIEW_TYPE) {
				this.defaultLeftState = state;
			}
		}

		const rightLeaf = this.app.workspace.getRightLeaf(false);
		if (rightLeaf) {
			this.defaultRightLeaf = rightLeaf;
			const state = rightLeaf.getViewState();
			if (state && state.type !== MESSAGE_HISTORY_VIEW_TYPE) {
				this.defaultRightState = state;
			}
		}
	}
}

