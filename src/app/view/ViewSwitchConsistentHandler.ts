import { App, ViewState, WorkspaceLeaf } from 'obsidian';
import { CHAT_VIEW_TYPE, PROJECT_LIST_VIEW_TYPE, MESSAGE_HISTORY_VIEW_TYPE, TRACKED_VIEW_TYPES } from '@/app/view/types';

/**
 * Ensures that when in chat view, the left, center, and right panes always maintain a consistent chat-related layout
 * (i.e. left: project list, center: chat, right: message history), and correspondingly, when in document view,
 * all three panes consistently show document-related views. This prevents scenarios where some panes display chat
 * views and others display document views at the same time.
 */
export class ViewSwitchConsistentHandler {
	private isChatLayoutActive = false;
	private isActivating = false;
	private isActivatingDocument = false;

	constructor(app: App) {
		this.app = app;
	}

	private readonly app: App;

	/**
	 * Gets the first empty leaf with title 'New tab' if exists, otherwise returns null.
	 */
	private getNewTabLeaf(): WorkspaceLeaf | null {
		const emptyLeaves = this.app.workspace.getLeavesOfType('empty');
		const newTabLeaf = emptyLeaves.find((leaf: WorkspaceLeaf) => {
			const state = leaf.getViewState() as any;
			return state.title === 'New tab';
		});
		return newTabLeaf ?? null;
	}

	/**
	 * Mirrors Obsidian active leaf changes to toggle layouts automatically.
	 */
	handleActiveLeafChange(leaf?: WorkspaceLeaf | null): void {
		const viewType = leaf?.view?.getViewType();
		if (viewType && TRACKED_VIEW_TYPES.has(viewType)) {
			void this.activateChatView();
		} else if (viewType !== 'empty') {
			void this.activeDocumentView(leaf);
		}
	}

	/**
	 * Ensures chat layout views are active and focused.
	 */
	async activateChatView(): Promise<void> {
		if (this.isChatLayoutActive || this.isActivating) return;

		this.isActivating = true;
		try {

			const existingChatLeaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
			const centerLeaf = existingChatLeaves[0] ?? this.app.workspace.getLeaf(false);
			if(centerLeaf) {
				await centerLeaf.setViewState({ type: CHAT_VIEW_TYPE, active: true });
			}

			// Find existing file-explorer leaf or create new one
			const existingProjectListLeaves = this.app.workspace.getLeavesOfType(PROJECT_LIST_VIEW_TYPE);
			const leftLeaf = existingProjectListLeaves[0] ?? this.app.workspace.getLeftLeaf(false);
			if (leftLeaf) {
				await leftLeaf.setViewState({ type: PROJECT_LIST_VIEW_TYPE, state: {}, active: true });
			}

			// Find existing message history leaf or create new one
			const existingMessageHistoryLeaves = this.app.workspace.getLeavesOfType(MESSAGE_HISTORY_VIEW_TYPE);
			const rightLeaf = existingMessageHistoryLeaves[0] ?? this.app.workspace.getRightLeaf(false);
			if (rightLeaf) {
				await rightLeaf.setViewState({ type: MESSAGE_HISTORY_VIEW_TYPE, state: {}, active: true });
			}

			this.app.workspace.revealLeaf(centerLeaf);
			this.isChatLayoutActive = true;
		} finally {
			this.isActivating = false;
		}
	}

	/**
	 * Returns to the regular document layout, restoring cached states.
	 */
	async activeDocumentView(preferredLeaf?: WorkspaceLeaf | null): Promise<void> {
		if (!this.isChatLayoutActive || this.isActivatingDocument) return;

		this.isActivatingDocument = true;
		try {
			// Important: do NOT set side panes to active=true here.
			// When switching from chat -> document, the user's click already selected a target leaf.
			// Activating side panes would steal focus and can cause us to incorrectly pick a fallback markdown leaf.
			const fallbackLeft: ViewState = { type: 'file-explorer', state: {}, active: false } as ViewState;
			const fallbackRight: ViewState = { type: 'outline', state: {}, active: false } as ViewState;

			// Find existing file-explorer leaf or create new one
			const existingFileExplorerLeaves = this.app.workspace.getLeavesOfType('file-explorer');
			const leftLeaf = existingFileExplorerLeaves[0] ?? this.app.workspace.getLeftLeaf(false);
			if (leftLeaf) {
				await leftLeaf.setViewState({ ...fallbackLeft, active: true });
			}

			// Find existing outline leaf or create new one
			const existingOutlineLeaves = this.app.workspace.getLeavesOfType('outline');
			const rightLeaf = existingOutlineLeaves[0] ?? this.app.workspace.getRightLeaf(false);
			if (rightLeaf) {
				await rightLeaf.setViewState({ ...fallbackRight, active: true });
			}

			// Handle center area: prefer the leaf that triggered the switch (i.e. the tab the user clicked).
			const existingMarkdownLeaves = this.app.workspace.getLeavesOfType('markdown');
			let centerLeaf: WorkspaceLeaf | null = null;

			if (preferredLeaf && preferredLeaf.view?.getViewType() === 'markdown') {
				centerLeaf = preferredLeaf;
			}

			if (!centerLeaf && existingMarkdownLeaves.length > 0) {
				// Find the last active markdown leaf
				// Check if any markdown leaf is currently active
				const activeLeaf = this.app.workspace.activeLeaf;
				if (activeLeaf && activeLeaf.view.getViewType() === 'markdown') {
					centerLeaf = activeLeaf;
				} else {
					// Use the first existing markdown leaf
					centerLeaf = existingMarkdownLeaves[0];
				}
			}

			// If no markdown leaf, try to use new tab leaf
			if (!centerLeaf) {
				centerLeaf = this.getNewTabLeaf();
			}

			// If no markdown leaf exists, create a new one
			if (!centerLeaf) {
				centerLeaf = this.app.workspace.getLeaf(false);
				if (centerLeaf) {
					// Open a new empty markdown file
					await centerLeaf.setViewState({ type: 'markdown', active: true });
				}
			} else {
				// Activate the existing markdown leaf
				const currentState = centerLeaf.getViewState();
				await centerLeaf.setViewState({ ...currentState, active: true });
				this.app.workspace.revealLeaf(centerLeaf);
			}

			this.isChatLayoutActive = false;
		} finally {
			this.isActivatingDocument = false;
		}
	}

}


