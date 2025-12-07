import type MyPlugin from 'main';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { CHAT_VIEW_TYPE, ChatView } from '@/ui/view/ChatView';
import { PROJECT_LIST_VIEW_TYPE, ProjectListView } from '@/ui/view/ProjectListView';
import { MESSAGE_HISTORY_VIEW_TYPE, MessageHistoryView } from '@/ui/view/MessageHistoryView';
import { ViewSwitchConsistentHandler } from '@/app/view/ViewSwitchConsistentHandler';
import { InputModal } from '@/ui/component/InputModal';
import { App, ViewCreator } from 'obsidian';

/**
 * Manages view registrations, related commands, and lifecycle cleanup.
 */
export class ViewManager {
	private readonly viewSwicthConsistenter: ViewSwitchConsistentHandler;
	private readonly viewCreators: Map<string, ViewCreator> = new Map();

	constructor(
		private readonly plugin: MyPlugin,
		private readonly aiManager: AIServiceManager,
	) {
		this.viewSwicthConsistenter = new ViewSwitchConsistentHandler(this.plugin.app);
		this.viewCreators.set(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, this.aiManager));
		this.viewCreators.set(PROJECT_LIST_VIEW_TYPE, (leaf) => new ProjectListView(leaf, this.aiManager));
		this.viewCreators.set(MESSAGE_HISTORY_VIEW_TYPE, (leaf) => new MessageHistoryView(leaf, this.aiManager));
	}

	/**
	 * Initialize views and ribbon entry.
	 */
	init(): void {
		this.registerViews();
		this.registerRibbon();
	}

	private registerViews(): void {
		this.viewCreators.forEach((creator, type) => {
			this.plugin.registerView(type, creator);
		});
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
		this.viewCreators.forEach((creator, type) => {
			this.plugin.app.workspace.getLeavesOfType(type).forEach((leaf) => leaf.detach());
		});
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

