import { App, ViewState, WorkspaceLeaf } from 'obsidian';
import {
	AMBIENT_PUSH_VIEW_TYPE,
	CHAT_VIEW_TYPE,
	CONVERSATION_OUTLINE_VIEW_TYPE,
	PROJECT_LIST_VIEW_TYPE,
	STANDALONE_PEAK_VIEW_TYPES,
	TRACKED_VIEW_TYPES,
} from '@/app/view/types';

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
		const newTabLeaf = emptyLeaves.find(leaf => {
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
		if (viewType && STANDALONE_PEAK_VIEW_TYPES.has(viewType)) {
			// Conversation Outline is the chat layout's right-panel companion,
			// so activating it (user clicks the sidebar icon) should bring up
			// the chat view + project list too — same as clicking either of
			// those does. Other standalone peak views (graph, dashboard,
			// vault X-ray, …) are full-window experiences and should NOT
			// implicitly summon the chat layout, so they still early-return.
			if (viewType === CONVERSATION_OUTLINE_VIEW_TYPE) {
				void this.activateChatView();
			}
			return;
		}
		if (viewType && TRACKED_VIEW_TYPES.has(viewType)) {
			void this.activateChatView();
		} else if (viewType !== 'empty') {
			void this.activeDocumentView();
		}
	}

	/**
	 * Ensures chat layout views are active and focused.
	 */
	async activateChatView(): Promise<void> {
		if (this.isActivating) return;
		const activeViewType = this.app.workspace.activeLeaf?.view?.getViewType();

		/*
		 * Early-return guard must verify ALL three layout leaves exist — not
		 * just "we were last in chat layout and chat is the active leaf".
		 * Without the outline+left checks, closing the outline (or the
		 * project list) while keeping chat active short-circuits the next
		 * activateChatView call and the closed leaf never gets restored.
		 * Symptom: clicking the chat/project-list icon when outline is
		 * closed does NOT bring outline back. Reported 2026-06-03.
		 */
		const hasOutline =
			(this.app.workspace.getLeavesOfType?.(CONVERSATION_OUTLINE_VIEW_TYPE) ?? []).length > 0;
		const hasProjectList =
			this.app.workspace.getLeavesOfType(PROJECT_LIST_VIEW_TYPE).length > 0;
		if (
			this.isChatLayoutActive &&
			activeViewType === CHAT_VIEW_TYPE &&
			hasOutline &&
			hasProjectList
		) {
			return;
		}

		this.isActivating = true;
		try {

			const existingChatLeaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
			const centerLeaf = existingChatLeaves[0] ?? this.app.workspace.getLeaf(false);
			if(centerLeaf) {
				await centerLeaf.setViewState({ type: CHAT_VIEW_TYPE, active: true });
			}

			// Find existing project-list leaf or create new one
			const existingProjectListLeaves = this.app.workspace.getLeavesOfType(PROJECT_LIST_VIEW_TYPE);
			const leftLeaf = existingProjectListLeaves[0] ?? this.app.workspace.getLeftLeaf(false);
			if (leftLeaf) {
				await leftLeaf.setViewState({ type: PROJECT_LIST_VIEW_TYPE, state: {}, active: true });
				// revealLeaf expands the left sidebar if collapsed.
				this.app.workspace.revealLeaf(leftLeaf);
			}

			// Right sidebar: ensure the Conversation Outline leaf exists. Mounts the
			// new (PR-Chat-3) 4-tab ConversationIndex UI on Obsidian's actual right
			// sidebar instead of inside the chat shell. AmbientPushView still gets
			// the same sidebar — if it's already there we create a sibling tab.
			const existingOutlineLeaves =
				this.app.workspace.getLeavesOfType?.(CONVERSATION_OUTLINE_VIEW_TYPE) ?? [];
			let outlineLeaf: WorkspaceLeaf | null = existingOutlineLeaves[0] ?? null;
			if (!outlineLeaf && typeof this.app.workspace.getRightLeaf === 'function') {
				const candidate = this.app.workspace.getRightLeaf(false);
				if (candidate && candidate.view?.getViewType() === AMBIENT_PUSH_VIEW_TYPE) {
					outlineLeaf = this.app.workspace.getRightLeaf(true) ?? candidate;
				} else {
					outlineLeaf = candidate;
				}
			}
			if (outlineLeaf) {
				await outlineLeaf.setViewState({
					type: CONVERSATION_OUTLINE_VIEW_TYPE,
					state: {},
					active: false,
				});
				// revealLeaf expands the right sidebar if collapsed AND surfaces
				// the outline tab. Done AFTER setViewState so the leaf exists,
				// BEFORE revealLeaf(centerLeaf) so center stays the focused leaf.
				this.app.workspace.revealLeaf(outlineLeaf);
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
	async activeDocumentView(): Promise<void> {
		if (!this.isChatLayoutActive || this.isActivatingDocument) return;

		this.isActivatingDocument = true;
		try {
			const fallbackLeft: ViewState = { type: 'file-explorer', state: {}, active: true } as ViewState;
			const fallbackRight: ViewState = { type: 'outline', state: {}, active: true } as ViewState;

			// Find existing file-explorer leaf or create new one
			const existingFileExplorerLeaves = this.app.workspace.getLeavesOfType('file-explorer');
			const leftLeaf = existingFileExplorerLeaves[0] ?? this.app.workspace.getLeftLeaf(false);
			if (leftLeaf) {
				await leftLeaf.setViewState({ ...fallbackLeft, active: true });
			}

			// Find existing outline leaf or create new one (without clobbering ambient push)
			const existingOutlineLeaves = this.app.workspace.getLeavesOfType('outline');
			let rightLeaf = existingOutlineLeaves[0];
			if (!rightLeaf) {
				const candidate = this.app.workspace.getRightLeaf(false);
				if (candidate && candidate.view?.getViewType() === AMBIENT_PUSH_VIEW_TYPE) {
					rightLeaf = this.app.workspace.getRightLeaf(true);
				} else {
					rightLeaf = candidate;
				}
			}
			if (rightLeaf) {
				await rightLeaf.setViewState({ ...fallbackRight, active: true });
			}

			// Handle center area: find last active markdown document or create new one
			const existingMarkdownLeaves = this.app.workspace.getLeavesOfType('markdown');
			let centerLeaf: WorkspaceLeaf | null = null;

			if (existingMarkdownLeaves.length > 0) {
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
