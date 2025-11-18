import type MyPlugin from 'main';
import type { AIServiceManager } from 'src/service/chat/service-manager';
import { CHAT_VIEW_TYPE, ChatView } from 'src/ui/view/ChatView';
import { PROJECT_LIST_VIEW_TYPE, ProjectListView } from 'src/ui/view/ProjectListView';
import { MESSAGE_HISTORY_VIEW_TYPE, MessageHistoryView } from 'src/ui/view/MessageHistoryView';
import { ViewSwitchConsistentHandler } from 'src/app/view/ViewSwitchConsistentHandler';
import { InputModal } from 'src/ui/component/InputModal';
import { App } from 'obsidian';

/**
 * Manages view registrations, related commands, and lifecycle cleanup.
 */
export class ViewManager {
	private readonly viewSwicthConsistenter: ViewSwitchConsistentHandler;

	constructor(
		private readonly plugin: MyPlugin,
		private readonly aiManager: AIServiceManager,
	) {
		this.viewSwicthConsistenter = new ViewSwitchConsistentHandler(this.plugin.app);
	}

	/**
	 * Initialize views and ribbon entry.
	 */
	init(): void {
		this.registerViews();
		this.registerRibbon();
	}

	private registerViews(): void {
		this.plugin.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, this.aiManager));
		this.plugin.registerView(PROJECT_LIST_VIEW_TYPE, (leaf) => new ProjectListView(leaf, this.aiManager));
		this.plugin.registerView(MESSAGE_HISTORY_VIEW_TYPE, (leaf) => new MessageHistoryView(leaf, this.aiManager));
	}

	getViewSwitchConsistentHandler(): ViewSwitchConsistentHandler {
		return this.viewSwicthConsistenter;
	}

	/**
	 * Get the Obsidian app instance
	 */
	getApp(): App {
		return this.plugin.app;
	}

	/**
	 * Detach plugin views on unload.
	 */
	unload(): void {
		this.plugin.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE).forEach((leaf) => leaf.detach());
		this.plugin.app.workspace.getLeavesOfType(PROJECT_LIST_VIEW_TYPE).forEach((leaf) => leaf.detach());
		this.plugin.app.workspace.getLeavesOfType(MESSAGE_HISTORY_VIEW_TYPE).forEach((leaf) => leaf.detach());
	}

	private registerRibbon(): void {
		this.plugin.addRibbonIcon('message-circle', 'Open Peak Assistant', () => {
			void this.viewSwicthConsistenter.activateChatView();
		});
	}

	// Commands and events are intentionally kept outside this manager per design.

	/**
	 * Show a modal prompt and resolve with user input.
	 */
	promptForInput(message: string): Promise<string | null> {
		return new Promise((resolve) => {
			const modal = new InputModal(this.plugin.app, message, (value) => resolve(value));
			modal.open();
		});
	}
}

