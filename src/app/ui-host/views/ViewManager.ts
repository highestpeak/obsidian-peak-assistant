import type MyPlugin from 'main';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { CHAT_VIEW_TYPE, ChatView } from '@/app/ui-host/views/ChatView';
import { PROJECT_LIST_VIEW_TYPE, ProjectListView } from '@/app/ui-host/views/ProjectListView';
import { UsageDashboardView, USAGE_DASHBOARD_VIEW_TYPE } from '@/app/ui-host/views/UsageDashboardView';
import { ConversationOutlineView, CONVERSATION_OUTLINE_VIEW_TYPE } from '@/app/ui-host/views/ConversationOutlineView';
import { ChatStudioView, CHAT_STUDIO_VIEW_TYPE } from '@/app/ui-host/views/ChatStudioView';
import { RelatedNotesView, RELATED_NOTES_VIEW_TYPE } from '@/app/ui-host/views/RelatedNotesView';
import { DocumentComposerView, DOCUMENT_COMPOSER_VIEW_TYPE } from '@/app/composer';
import { ViewSwitchConsistentHandler } from '@/app/ui-host/views/ViewSwitchConsistentHandler';
import { InputModal } from '@/app/ui-host/modals/InputModal';
import { App, Notice, ViewCreator } from 'obsidian';
import { AppContext } from '@/app/context/AppContext';
import { DEFAULT_COMPOSER_NAVIGATION_STRINGS } from '@/app/composer/ComposerNavigationDefaults';
import { CommandCenterHomeView, COMMAND_CENTER_HOME_VIEW_TYPE } from '@/app/ui-host/views/CommandCenterHomeView';
import { AIControlCenterView, AI_CONTROL_CENTER_VIEW_TYPE } from '@/app/ui-host/views/AIControlCenterView';
import { MyContentView, MY_CONTENT_VIEW_TYPE } from '@/app/ui-host/views/MyContentView';
import {
	PluginCommandGatewayView,
	PLUGIN_COMMAND_GATEWAY_VIEW_TYPE,
} from '@/app/ui-host/views/PluginCommandGatewayView';

/**
 * Manages view registrations, related commands, and lifecycle cleanup.
 */
export class ViewManager {
	private readonly viewSwicthConsistenter: ViewSwitchConsistentHandler;
	private readonly viewCreators: Map<string, ViewCreator> = new Map();
	private ribbonIconEl: HTMLElement | null = null;

	constructor(
		private readonly plugin: MyPlugin,
		public readonly appContext: AppContext,
	) {
		this.viewSwicthConsistenter = new ViewSwitchConsistentHandler(this.plugin.app);
		// Pass appContext to View constructors
		this.viewCreators.set(CHAT_VIEW_TYPE, (leaf) => {
			return new ChatView(leaf, appContext);
		});
		this.viewCreators.set(PROJECT_LIST_VIEW_TYPE, (leaf) => {
			return new ProjectListView(leaf, appContext);
		});
		this.viewCreators.set(USAGE_DASHBOARD_VIEW_TYPE, (leaf) => {
			return new UsageDashboardView(leaf, appContext);
		});
		this.viewCreators.set(CONVERSATION_OUTLINE_VIEW_TYPE, (leaf) => {
			return new ConversationOutlineView(leaf, appContext);
		});
		this.viewCreators.set(CHAT_STUDIO_VIEW_TYPE, (leaf) => {
			return new ChatStudioView(leaf, appContext);
		});
		this.viewCreators.set(RELATED_NOTES_VIEW_TYPE, (leaf) => {
			return new RelatedNotesView(leaf, appContext);
		});
		this.viewCreators.set(DOCUMENT_COMPOSER_VIEW_TYPE, (leaf) => {
			return new DocumentComposerView(leaf, appContext);
		});
		this.viewCreators.set(COMMAND_CENTER_HOME_VIEW_TYPE, (leaf) => {
			return new CommandCenterHomeView(leaf, appContext);
		});
		this.viewCreators.set(AI_CONTROL_CENTER_VIEW_TYPE, (leaf) => {
			return new AIControlCenterView(leaf, appContext);
		});
		this.viewCreators.set(MY_CONTENT_VIEW_TYPE, (leaf) => {
			return new MyContentView(leaf, appContext);
		});
		this.viewCreators.set(PLUGIN_COMMAND_GATEWAY_VIEW_TYPE, (leaf) => {
			return new PluginCommandGatewayView(leaf, appContext);
		});
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
	 * Detach plugin views and remove ribbon icon (and its click listener) on unload.
	 */
	unload(): void {
		if (this.ribbonIconEl?.parentNode) {
			this.ribbonIconEl.remove();
		}
		this.ribbonIconEl = null;
		this.viewCreators.forEach((creator, type) => {
			this.plugin.app.workspace.getLeavesOfType(type).forEach((leaf) => leaf.detach());
		});
	}

	private registerRibbon(): void {
		this.ribbonIconEl = this.plugin.addRibbonIcon('message-circle', 'Open Peak Assistant', () => {
			void this.viewSwicthConsistenter.activateChatView();
		});
	}

	// Commands and events are intentionally kept outside this manager per design.

	/**
	 * Open the Usage Dashboard in a new tab.
	 */
	async activateUsageDashboardView(): Promise<void> {
		const leaf = this.plugin.app.workspace.getLeaf('tab');
		await leaf.setViewState({ type: USAGE_DASHBOARD_VIEW_TYPE, active: true });
		this.plugin.app.workspace.revealLeaf(leaf);
	}

	/** Open the user-facing controls for prompts, Custom Prompts and assistants. */
	async activateAIControlCenterView(): Promise<void> {
		await this.activateStandaloneView(AI_CONTROL_CENTER_VIEW_TYPE);
	}

	/** Open the explicitly saved Peak content browser. */
	async activateMyContentView(): Promise<void> {
		await this.activateStandaloneView(MY_CONTENT_VIEW_TYPE);
	}

	/** Open the human-review control plane for external plugin commands. */
	async activatePluginCommandGatewayView(): Promise<void> {
		await this.activateStandaloneView(PLUGIN_COMMAND_GATEWAY_VIEW_TYPE);
	}

	private async activateStandaloneView(type: string): Promise<void> {
		const { workspace } = this.plugin.app;
		const existing = workspace.getLeavesOfType(type);
		if (existing.length > 0) {
			workspace.revealLeaf(existing[0]);
			return;
		}
		const leaf = workspace.getLeaf('tab');
		await leaf.setViewState({ type, active: true });
		workspace.revealLeaf(leaf);
	}

	/**
	 * Open the legacy Related Notes view. The planned floating companion was
	 * retired; Composer Intelligence owns future Ambient presentation.
	 */
	async activateRelatedNotesView(): Promise<void> {
		const { workspace } = this.plugin.app;
		const existing = workspace.getLeavesOfType(RELATED_NOTES_VIEW_TYPE);
		if (existing.length > 0) {
			workspace.revealLeaf(existing[0]);
			return;
		}
		const leaf = workspace.getRightLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({ type: RELATED_NOTES_VIEW_TYPE, active: true });
		workspace.revealLeaf(leaf);
	}

	/**
	 * Open the Peak Composer in a new main-area tab. Reuses an existing
	 * Composer leaf if one is open; otherwise creates a tab so the host lives
	 * beside the note it composes. No Command Palette entry is registered here
	 * (Command Palette governance — entry decision is deferred to the
	 * orchestrator).
	 */
	async activateDocumentComposerView(): Promise<void> {
		const { workspace } = this.plugin.app;
		const file = workspace.getActiveFile();
		if (!file || file.extension !== 'md') {
			new Notice(DEFAULT_COMPOSER_NAVIGATION_STRINGS.openMarkdownFirst, 5000);
			return;
		}
		const existing = workspace.getLeavesOfType(DOCUMENT_COMPOSER_VIEW_TYPE).find((leaf) => {
			const view = leaf.view as { getSourceFilePath?: () => string | null };
			return view.getSourceFilePath?.() === file.path;
		});
		if (existing) {
			workspace.revealLeaf(existing);
			return;
		}
		const runtime = this.appContext.runtimeRegistry.tryGetDocumentComposerRuntime();
		if (!runtime?.navigation) {
			new Notice(DEFAULT_COMPOSER_NAVIGATION_STRINGS.runtimeNotReady, 5000);
			return;
		}
		const leaf = await runtime.navigation.open({
			filePath: file.path,
			view: 'composer',
			disposition: 'new-tab',
			reason: 'command',
		});
		if (!leaf) new Notice(DEFAULT_COMPOSER_NAVIGATION_STRINGS.noAvailableLeaf, 5000);
	}

	/**
	 * Show a modal prompt and resolve with user input.
	 */
	promptForInput(message: string): Promise<string | null> {
		return new Promise((resolve) => {
			const modal = new InputModal(this.plugin.app, message, (value) => resolve(value));
			modal.open();
		});
	}

	/**
	 * Open the Chat Studio: a single ItemView in the main area that
	 * internally renders ProjectListView | ChatViewComponent |
	 * ConversationIndex side by side.
	 *
	 * Opens as a tab (not a detached macOS window) because the plugin's
	 * React 18 UI does not survive `getLeaf('window')`:
	 *   - portals (sonner Toaster, settings modals, `[[` autocomplete) target
	 *     `document.body` of the MAIN Obsidian window, so popups appear on
	 *     the wrong screen and far from the click,
	 *   - React 18's event delegation breaks across documents — inputs stop
	 *     accepting text, button onClick stops firing, ConversationIndex
	 *     items don't scroll-to-message.
	 *
	 * Users who want a separate macOS window can right-click the Studio tab
	 * → Move to → New Window after opening — Obsidian's native popout uses a
	 * different code path that survives these issues.
	 *
	 * On first open, detaches any existing legacy chat-layout leaves so the
	 * user's original positions disappear (matching the user-requested
	 * "原来的位置都消失了" behavior). Re-running the command while Studio is
	 * already open just reveals the existing leaf.
	 */
	async openChatStudio(): Promise<void> {
		const { workspace } = this.plugin.app;

		// Idempotence: if Studio leaf already exists, just focus it.
		const existing = workspace.getLeavesOfType(CHAT_STUDIO_VIEW_TYPE);
		if (existing.length > 0) {
			workspace.revealLeaf(existing[0]);
			return;
		}

		// Reuse an existing ChatView leaf (most common path — promote it to
		// Studio in place). Otherwise create a new tab in the current tab
		// group; if the main area has no tab group at all (`getLeaf('tab')`
		// throws "No tab group found"), fall back to `getLeaf(false)` which
		// returns the currently active leaf or creates one.
		const existingChatLeaves = workspace.getLeavesOfType(CHAT_VIEW_TYPE);
		let studioLeaf: WorkspaceLeaf | null = existingChatLeaves[0] ?? null;
		if (!studioLeaf) {
			try {
				studioLeaf = workspace.getLeaf('tab');
			} catch {
				studioLeaf = workspace.getLeaf(false);
			}
		}
		if (!studioLeaf) {
			new Notice('Could not open Chat Studio: no available workspace tab.', 5000);
			return;
		}

		await studioLeaf.setViewState({ type: CHAT_STUDIO_VIEW_TYPE, active: true });

		// Now tear down the remaining legacy chat-layout leaves so the
		// original positions disappear. We deliberately do this AFTER
		// creating Studio: if Studio is the promoted ChatView leaf, the
		// for-loop below skips it; if Studio is a new leaf, any leftover
		// ChatView leaves are detached too.
		const sidebarTypes: string[] = [
			PROJECT_LIST_VIEW_TYPE,
			CONVERSATION_OUTLINE_VIEW_TYPE,
		];
		for (const type of sidebarTypes) {
			for (const leaf of workspace.getLeavesOfType(type)) {
				leaf.detach();
			}
		}
		for (const leaf of workspace.getLeavesOfType(CHAT_VIEW_TYPE)) {
			if (leaf !== studioLeaf) leaf.detach();
		}

		// Pop the Studio leaf out to its own window. This uses Obsidian's
		// native popout migration (same flow as right-click tab → Move to
		// → New Window), which routes through a different code path than
		// `getLeaf('window')` and tends to preserve React event wiring
		// because the leaf already exists with its event handlers attached.
		// Throws on mobile or old Electron — fall back to leaving Studio
		// as a tab.
		try {
			workspace.moveLeafToPopout(studioLeaf);
		} catch (err) {
			console.warn('[chat-studio] moveLeafToPopout unsupported — Studio stays as tab:', err);
		}

		workspace.revealLeaf(studioLeaf);
	}
}
