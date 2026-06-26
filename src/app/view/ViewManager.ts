import type MyPlugin from 'main';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { CHAT_VIEW_TYPE, ChatView } from '@/app/view/ChatView';
import { PROJECT_LIST_VIEW_TYPE, ProjectListView } from '@/app/view/ProjectListView';
import { AmbientPushView, AMBIENT_PUSH_VIEW_TYPE } from '@/app/view/AmbientPushView';
import { UsageDashboardView, USAGE_DASHBOARD_VIEW_TYPE } from '@/app/view/UsageDashboardView';
import { VaultXRayView, VAULT_XRAY_VIEW_TYPE } from '@/app/view/VaultXRayView';
import { ConversationOutlineView, CONVERSATION_OUTLINE_VIEW_TYPE } from '@/app/view/ConversationOutlineView';
import { ChatStudioView, CHAT_STUDIO_VIEW_TYPE } from '@/app/view/ChatStudioView';
import { ViewSwitchConsistentHandler } from '@/app/view/ViewSwitchConsistentHandler';
import { InputModal } from '@/ui/component/InputModal';
import { App, Notice, ViewCreator, WorkspaceLeaf } from 'obsidian';
import { AppContext } from '@/app/context/AppContext';

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
		this.viewCreators.set(AMBIENT_PUSH_VIEW_TYPE, (leaf) => {
			return new AmbientPushView(leaf, appContext);
		});
		this.viewCreators.set(USAGE_DASHBOARD_VIEW_TYPE, (leaf) => {
			return new UsageDashboardView(leaf, appContext);
		});
		this.viewCreators.set(VAULT_XRAY_VIEW_TYPE, (leaf) => {
			return new VaultXRayView(leaf, appContext);
		});
		this.viewCreators.set(CONVERSATION_OUTLINE_VIEW_TYPE, (leaf) => {
			return new ConversationOutlineView(leaf, appContext);
		});
		this.viewCreators.set(CHAT_STUDIO_VIEW_TYPE, (leaf) => {
			return new ChatStudioView(leaf, appContext);
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
	 * Open or reveal the Ambient Push (Related Notes) side panel.
	 */
	async activateAmbientPushView(): Promise<void> {
		const { workspace } = this.plugin.app;
		let leaf = workspace.getLeavesOfType(AMBIENT_PUSH_VIEW_TYPE)[0];
		if (!leaf) {
			const candidate = workspace.getRightLeaf(false);
			if (candidate?.view?.getViewType() === AMBIENT_PUSH_VIEW_TYPE) {
				leaf = candidate;
			} else {
				leaf = workspace.getRightLeaf(true) ?? candidate ?? null;
			}
			if (leaf) {
				await leaf.setViewState({ type: AMBIENT_PUSH_VIEW_TYPE, state: {}, active: true });
			}
		}
		if (leaf) workspace.revealLeaf(leaf);
	}

	/**
	 * Open the Usage Dashboard in a new tab.
	 */
	async activateUsageDashboardView(): Promise<void> {
		const leaf = this.plugin.app.workspace.getLeaf('tab');
		await leaf.setViewState({ type: USAGE_DASHBOARD_VIEW_TYPE, active: true });
		this.plugin.app.workspace.revealLeaf(leaf);
	}

	/**
	 * Open or reveal the Vault X-Ray view in a new tab.
	 */
	async activateVaultXRayView(): Promise<void> {
		const { workspace } = this.plugin.app;
		const existing = workspace.getLeavesOfType(VAULT_XRAY_VIEW_TYPE);
		if (existing.length > 0) {
			workspace.revealLeaf(existing[0]);
			return;
		}
		const leaf = workspace.getLeaf('tab');
		await leaf.setViewState({ type: VAULT_XRAY_VIEW_TYPE, active: true });
		workspace.revealLeaf(leaf);
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
