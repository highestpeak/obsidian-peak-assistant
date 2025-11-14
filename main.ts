import { App, Modal, Plugin, PluginSettingTab, Setting, TextComponent, ViewState, WorkspaceLeaf } from 'obsidian';
import { buildLogMetricListener } from 'src/business/LogMetricRegister';
import { EventDispatcher } from 'src/core/EventDispatcher';
import { registerHTMLViews } from 'src/core/HtmlView';
import { AIServiceManager, AIServiceSettings, DEFAULT_AI_SERVICE_SETTINGS } from 'src/service/chat/service-manager';
import { coerceModelId } from 'src/service/chat/types-models';
import { ChatProjectMeta } from 'src/service/chat/types';
import { UIControlService, UIControlSettings, DEFAULT_UI_CONTROL_SETTINGS } from 'src/service/UIControlService';
import { CHAT_VIEW_TYPE, ChatView } from 'src/view/ChatView';
import { PROJECT_LIST_VIEW_TYPE, ProjectListView } from 'src/view/ProjectListView';
import { MESSAGE_HISTORY_VIEW_TYPE, MessageHistoryView } from 'src/view/MessageHistoryView';

interface MyPluginSettings {
	mySetting: string;
	scriptFolder: string;
	htmlViewConfigFile: string;
	statisticsDataStoreFolder: string;
	ai: AIServiceSettings;
	uiControl: UIControlSettings;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default',
	scriptFolder: 'A-control',
	htmlViewConfigFile: 'A-control/PeakAssistantScript/HtmlViewConfig.json',
	statisticsDataStoreFolder: 'A-control/PeakAssistantDataStore/RepoStatistics',
	ai: DEFAULT_AI_SERVICE_SETTINGS,
	uiControl: DEFAULT_UI_CONTROL_SETTINGS,
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
	eventHandler: EventDispatcher;
	aiManager: AIServiceManager;
	uiControlService: UIControlService;
	private readonly chatViewTypes = new Set<string>([
		CHAT_VIEW_TYPE,
		PROJECT_LIST_VIEW_TYPE,
		MESSAGE_HISTORY_VIEW_TYPE,
	]);
	private leftLeafBeforeChat?: WorkspaceLeaf;
	private rightLeafBeforeChat?: WorkspaceLeaf;
	private leftLeafPrevState?: ViewState;
	private rightLeafPrevState?: ViewState;

	async onload() {
		await this.loadSettings();

		// todo first version code, temp ignore
		// // event dispatcher
		// this.eventHandler = new EventDispatcher(this.app, this);
		// // add external script listener
		// this.eventHandler.addScriptFolderListener(this.settings.scriptFolder)
		// // add statistics listener
		// this.eventHandler.addNewHandlers(
		// 	buildLogMetricListener(this.settings.statisticsDataStoreFolder)
		// )
		// // register home view
		// // registerHTMLViews(
		// // 	this.settings.htmlViewConfigFile,
		// // 	this
		// // )

		this.aiManager = new AIServiceManager(this.app, this.settings.ai);
		await this.aiManager.init();

		// Initialize UI control service
		this.uiControlService = new UIControlService(this.app, this, this.settings.uiControl);
		this.uiControlService.init();

		// Register views - icons will appear in left sidebar view list (bottom area)
		this.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, this.aiManager));
		this.registerView(PROJECT_LIST_VIEW_TYPE, (leaf) => new ProjectListView(leaf, this.aiManager));
		this.registerView(MESSAGE_HISTORY_VIEW_TYPE, (leaf) => new MessageHistoryView(leaf, this.aiManager));

		// Add ribbon icon in left sidebar - this provides a visible entry point
		this.addRibbonIcon('message-circle', 'Open Peak Assistant', () => {
			void this.activateChatView();
		});

		this.addCommand({
			id: 'peak-chat-open-view',
			name: 'Open Chat Mode Panel',
			callback: () => this.activateChatView(),
		});

		this.addCommand({
			id: 'peak-chat-new-project',
			name: 'New Chat Project',
			callback: async () => {
				const name = await this.showInputDialog('Enter project name');
				if (!name) return;
				const meta: Omit<ChatProjectMeta, 'id' | 'createdAtTimestamp' | 'updatedAtTimestamp'> = {
					name,
				};
				await this.aiManager.createProject(meta);
			},
		});

		this.addCommand({
			id: 'peak-chat-new-conversation',
			name: 'New Chat Conversation',
			callback: async () => {
				const title = await this.showInputDialog('Enter conversation title');
				if (!title) return;
				await this.aiManager.createConversation({ title, project: null });
			},
		});

		this.registerEvent(
			this.app.workspace.on('active-leaf-change', (leaf) => {
				this.handleActiveLeafChange(leaf);
			})
		);

		// add setting ui
		this.addSettingTab(new SampleSettingTab(this.app, this));
	}

	onunload() {
		this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE).forEach((leaf) => leaf.detach());
		this.app.workspace.getLeavesOfType(PROJECT_LIST_VIEW_TYPE).forEach((leaf) => leaf.detach());
		this.app.workspace.getLeavesOfType(MESSAGE_HISTORY_VIEW_TYPE).forEach((leaf) => leaf.detach());
		this.uiControlService?.unload();
	}

	async loadSettings() {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
		const legacyChatSettings = data?.chat as Partial<AIServiceSettings> | undefined;
		this.settings.ai = Object.assign({}, DEFAULT_AI_SERVICE_SETTINGS, data?.ai ?? legacyChatSettings ?? {});
		if (!this.settings.ai.promptFolder) {
			const legacyPromptFolder = typeof data?.promptFolder === 'string' ? data.promptFolder : undefined;
			this.settings.ai.promptFolder = legacyPromptFolder || DEFAULT_AI_SERVICE_SETTINGS.promptFolder;
		}
		this.settings.ai.defaultModelId = coerceModelId(this.settings.ai.defaultModelId as unknown as string);
		this.settings.ai.models = (this.settings.ai.models ?? []).map((model) => ({
			...model,
			id: coerceModelId(model.id as unknown as string),
		}));
		this.settings.uiControl = Object.assign({}, DEFAULT_UI_CONTROL_SETTINGS, data?.uiControl ?? {});
		const settingsBag = this.settings as unknown as Record<string, unknown>;
		delete settingsBag.chat;
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private async activateChatView(): Promise<void> {
		// Setup three-panel layout: left (project/conversation list), center (chat UI), right (message history)
		
		// Check if views already exist
		const existingChatLeaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
		const existingProjectLeaves = this.app.workspace.getLeavesOfType(PROJECT_LIST_VIEW_TYPE);
		const existingHistoryLeaves = this.app.workspace.getLeavesOfType(MESSAGE_HISTORY_VIEW_TYPE);

		// If all views exist, just reveal them
		if (existingChatLeaves.length > 0 && existingProjectLeaves.length > 0 && existingHistoryLeaves.length > 0) {
			this.app.workspace.revealLeaf(existingChatLeaves[0]);
			return;
		}

		// Create or get left leaf for project list
		let leftLeaf = existingProjectLeaves[0] ?? this.app.workspace.getLeftLeaf(false);
		if (!leftLeaf) {
			leftLeaf = this.app.workspace.getLeaf('split');
		}
		if (!existingProjectLeaves[0]) {
			this.captureOriginalLeafState(leftLeaf, 'left');
		}
		await leftLeaf.setViewState({ type: PROJECT_LIST_VIEW_TYPE, active: false });

		// Create center leaf for chat view
		const centerLeaf = existingChatLeaves[0] ?? this.app.workspace.getLeaf(true);
		if (!centerLeaf) {
			return;
		}
		await centerLeaf.setViewState({ type: CHAT_VIEW_TYPE, active: true });

		// Create or get right leaf for message history
		let rightLeaf = existingHistoryLeaves[0] ?? this.app.workspace.getRightLeaf(false);
		if (!rightLeaf) {
			rightLeaf = this.app.workspace.getLeaf('split');
		}
		if (!existingHistoryLeaves[0]) {
			this.captureOriginalLeafState(rightLeaf, 'right');
		}
		await rightLeaf.setViewState({ type: MESSAGE_HISTORY_VIEW_TYPE, active: false });

		// Reveal center chat view
		this.app.workspace.revealLeaf(centerLeaf);
	}

	private async showInputDialog(message: string): Promise<string | null> {
		return new Promise((resolve) => {
			const modal = new InputModal(this.app, message, (value) => {
				resolve(value);
			});
			modal.open();
		});
	}

	private captureOriginalLeafState(leaf: WorkspaceLeaf | null, side: 'left' | 'right'): void {
		if (!leaf) return;
		if (side === 'left') {
			if (!this.leftLeafBeforeChat) {
				this.leftLeafBeforeChat = leaf;
			}
			const viewType = leaf.view?.getViewType();
			if (!this.leftLeafPrevState && viewType && viewType !== PROJECT_LIST_VIEW_TYPE) {
				this.leftLeafPrevState = leaf.getViewState();
			}
		} else {
			if (!this.rightLeafBeforeChat) {
				this.rightLeafBeforeChat = leaf;
			}
			const viewType = leaf.view?.getViewType();
			if (!this.rightLeafPrevState && viewType && viewType !== MESSAGE_HISTORY_VIEW_TYPE) {
				this.rightLeafPrevState = leaf.getViewState();
			}
		}
	}

	private handleActiveLeafChange(leaf?: WorkspaceLeaf | null): void {
		const viewType = leaf?.view?.getViewType();
		if (viewType && this.chatViewTypes.has(viewType)) {
			void this.activateChatView();
		} else {
			void this.ensureDocumentLayout();
		}
	}

	private async ensureDocumentLayout(): Promise<void> {
		const hasChatLeaves =
			this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE).length > 0 ||
			this.app.workspace.getLeavesOfType(PROJECT_LIST_VIEW_TYPE).length > 0 ||
			this.app.workspace.getLeavesOfType(MESSAGE_HISTORY_VIEW_TYPE).length > 0;

		if (!hasChatLeaves) {
			this.clearStoredChatLayout();
			return;
		}

		await this.restoreDocumentLayout();
	}

	private async restoreDocumentLayout(): Promise<void> {
		if (this.leftLeafBeforeChat) {
			if (this.leftLeafPrevState) {
				try {
					await this.leftLeafBeforeChat.setViewState(this.leftLeafPrevState);
				} catch (error) {
					console.error('Failed to restore left leaf state', error);
				}
			} else {
				this.leftLeafBeforeChat.detach();
			}
		}

		if (this.rightLeafBeforeChat) {
			if (this.rightLeafPrevState) {
				try {
					await this.rightLeafBeforeChat.setViewState(this.rightLeafPrevState);
				} catch (error) {
					console.error('Failed to restore right leaf state', error);
				}
			} else {
				this.rightLeafBeforeChat.detach();
			}
		}

		this.app.workspace.getLeavesOfType(PROJECT_LIST_VIEW_TYPE).forEach((leaf) => leaf.detach());
		this.app.workspace.getLeavesOfType(MESSAGE_HISTORY_VIEW_TYPE).forEach((leaf) => leaf.detach());
		this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE).forEach((leaf) => leaf.detach());

		this.clearStoredChatLayout();
	}

	private clearStoredChatLayout(): void {
		this.leftLeafBeforeChat = undefined;
		this.rightLeafBeforeChat = undefined;
		this.leftLeafPrevState = undefined;
		this.rightLeafPrevState = undefined;
	}

}


class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;
	private activeTab: string = 'general';

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();
		containerEl.addClass('peak-settings-tab');

		// Create tab navigation
		const tabContainer = containerEl.createDiv({ cls: 'peak-settings-tabs' });
		const tabs = [
			{ id: 'general', label: 'General' },
			{ id: 'ai-models', label: 'AI Models' },
			{ id: 'folders', label: 'Folders' },
			{ id: 'ui-control', label: 'UI Control' },
		];

		tabs.forEach(tab => {
			const tabEl = tabContainer.createDiv({ 
				cls: `peak-settings-tab-item ${this.activeTab === tab.id ? 'is-active' : ''}`,
				text: tab.label
			});
			tabEl.addEventListener('click', () => {
				this.activeTab = tab.id;
				this.display();
			});
		});

		// Create content area
		const contentArea = containerEl.createDiv({ cls: 'peak-settings-content' });

		// Render active tab content
		switch (this.activeTab) {
			case 'general':
				this.renderGeneralTab(contentArea);
				break;
			case 'ai-models':
				this.renderAIModelsTab(contentArea);
				break;
			case 'folders':
				this.renderFoldersTab(contentArea);
				break;
			case 'ui-control':
				this.renderUIControlTab(contentArea);
				break;
		}
	}

	private renderGeneralTab(container: HTMLElement): void {
		container.empty();

		const wrapper = container.createDiv({ cls: 'peak-settings-card' });

		new Setting(wrapper)
			.setName('Chat Root Mode')
			.setDesc('Choose the default navigation mode')
			.addDropdown((dropdown) => {
				dropdown.addOption('project-first', 'Project First');
				dropdown.addOption('conversation-first', 'Conversation First');
				dropdown.setValue(this.plugin.settings.ai.rootMode);
				dropdown.onChange(async (value) => {
					this.plugin.settings.ai.rootMode = value as AIServiceSettings['rootMode'];
					this.plugin.aiManager?.updateSettings(this.plugin.settings.ai);
					this.plugin.aiManager?.refreshDefaultServices();
					await this.plugin.aiManager?.init();
					await this.plugin.saveSettings();
				});
			});

		new Setting(wrapper)
			.setName('EventScriptFolder')
			.setDesc('Script in this folder will be register to listen to target events.')
			.addText(text => text
				.setPlaceholder('Enter your Folder')
				.setValue(this.plugin.settings.scriptFolder)
				.onChange(async (value) => {
					this.plugin.settings.scriptFolder = value;
					if (this.plugin.eventHandler) {
						this.plugin.eventHandler.addScriptFolderListener(value);
					}
					await this.plugin.saveSettings();
				}));
	}

	private renderAIModelsTab(container: HTMLElement): void {
		container.empty();

		const wrapper = container.createDiv({ cls: 'peak-settings-card' });

		new Setting(wrapper)
			.setName('Default Model Id')
			.setDesc('Model used for new conversations')
			.addText((text) =>
				text
					.setPlaceholder('e.g. gpt-4.1-mini')
					.setValue(this.plugin.settings.ai.defaultModelId)
					.onChange(async (value) => {
						this.plugin.settings.ai.defaultModelId = coerceModelId(value);
						this.plugin.aiManager?.updateSettings(this.plugin.settings.ai);
						this.plugin.aiManager?.refreshDefaultServices();
						await this.plugin.aiManager?.init();
						await this.plugin.saveSettings();
					})
			);

		// Provider API Keys section
		wrapper.createEl('h3', { text: 'Provider API Keys' });

		const providers = ['openai', 'anthropic', 'google'];
		providers.forEach(provider => {
			const config = this.plugin.settings.ai.llmProviderConfigs[provider] || { apiKey: '', baseUrl: '' };
			new Setting(wrapper)
				.setName(`${provider.charAt(0).toUpperCase() + provider.slice(1)} API Key`)
				.setDesc(`API key for ${provider} provider`)
				.addText((text) => {
					text
						.setPlaceholder(`Enter ${provider} API key`)
						.setValue(config.apiKey || '')
						.inputEl.type = 'password';
					text.onChange(async (value) => {
						if (!this.plugin.settings.ai.llmProviderConfigs[provider]) {
							this.plugin.settings.ai.llmProviderConfigs[provider] = { apiKey: '', baseUrl: '' };
						}
						this.plugin.settings.ai.llmProviderConfigs[provider].apiKey = value;
						this.plugin.aiManager?.updateSettings(this.plugin.settings.ai);
						this.plugin.aiManager?.refreshDefaultServices();
						await this.plugin.aiManager?.init();
						await this.plugin.saveSettings();
					});
				});

			new Setting(container)
				.setName(`${provider.charAt(0).toUpperCase() + provider.slice(1)} Base URL`)
				.setDesc(`Optional custom base URL for ${provider} (leave empty for default)`)
				.addText((text) => {
					text
						.setPlaceholder('e.g. https://api.example.com/v1')
						.setValue(config.baseUrl || '');
					text.onChange(async (value) => {
						if (!this.plugin.settings.ai.llmProviderConfigs[provider]) {
							this.plugin.settings.ai.llmProviderConfigs[provider] = { apiKey: '', baseUrl: '' };
						}
						this.plugin.settings.ai.llmProviderConfigs[provider].baseUrl = value;
						this.plugin.aiManager?.updateSettings(this.plugin.settings.ai);
						this.plugin.aiManager?.refreshDefaultServices();
						await this.plugin.aiManager?.init();
						await this.plugin.saveSettings();
					});
				});
		});

		// Models configuration section
		container.createEl('h3', { text: 'Model Configuration' });
		container.createEl('p', { 
			text: 'Configure available models. This section can be extended to add/edit models.',
			cls: 'peak-settings-description'
		});
	}

	private renderFoldersTab(container: HTMLElement): void {
		container.empty();

		const wrapper = container.createDiv({ cls: 'peak-settings-card' });

		new Setting(wrapper)
			.setName('Chat Root Folder')
			.setDesc('Root folder for AI conversation data')
			.addText((text) =>
				text
					.setPlaceholder('e.g. ChatFolder')
					.setValue(this.plugin.settings.ai.rootFolder)
					.onChange(async (value) => {
						this.plugin.settings.ai.rootFolder = value || DEFAULT_AI_SERVICE_SETTINGS.rootFolder;
						this.plugin.aiManager?.updateSettings(this.plugin.settings.ai);
						this.plugin.aiManager?.refreshDefaultServices();
						await this.plugin.aiManager?.init();
						await this.plugin.saveSettings();
					})
			);

		new Setting(wrapper)
			.setName('Prompt Folder')
			.setDesc('Folder containing conversation and summary prompts')
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_AI_SERVICE_SETTINGS.promptFolder)
					.setValue(this.plugin.settings.ai.promptFolder)
					.onChange(async (value) => {
						const next = value?.trim() || DEFAULT_AI_SERVICE_SETTINGS.promptFolder;
						this.plugin.settings.ai.promptFolder = next;
						this.plugin.aiManager?.setPromptFolder(next);
						this.plugin.aiManager?.updateSettings(this.plugin.settings.ai);
						this.plugin.aiManager?.refreshDefaultServices();
						await this.plugin.aiManager?.init();
						await this.plugin.saveSettings();
					})
			);
	}

	private renderUIControlTab(container: HTMLElement): void {
		container.empty();

		const wrapper = container.createDiv({ cls: 'peak-settings-card' });

		wrapper.createEl('h3', { text: 'UI Control' });
		wrapper.createEl('p', {
			text: 'Control which UI elements are visible. Items are automatically discovered. Click the eye icon to toggle visibility.',
			cls: 'peak-settings-description'
		});

		// Add refresh button to manually trigger discovery
		const refreshSetting = new Setting(wrapper)
			.setName('Refresh Menu Items')
			.setDesc('Click to manually refresh discovered menu items. You can also right-click in different contexts to automatically discover items.');
		
		refreshSetting.addButton(button => {
			button.setButtonText('Refresh Now');
			button.setCta();
			button.onClick(async () => {
				// Trigger a refresh by re-displaying the tab
				this.display();
			});
		});

		// Create secondary tab bar for menu categories
		const tabContainer = wrapper.createDiv({ cls: 'peak-ui-control-tabs' });
		const tabContent = wrapper.createDiv({ cls: 'peak-ui-control-tab-content' });

		// Menu types - only the ones user wants
		const menuTypes = [
			{ id: 'file-menu', label: 'File Explorer Menu', desc: 'Right-click menu on files/folders in file explorer' },
			{ id: 'editor-menu', label: 'Editor Menu', desc: 'Right-click menu in the editor' },
			{ id: 'slash-commands', label: 'Slash Commands', desc: 'Slash commands (/) in markdown editor' },
			{ id: 'command-palette', label: 'Command Palette', desc: 'Commands in Command Palette (Cmd/Ctrl+P)' },
			{ id: 'ribbon-icons', label: 'Ribbon Icons', desc: 'Icons in the left sidebar ribbon' },
		];

		let activeTabId = menuTypes[0].id;

		// Create tabs
		menuTypes.forEach(menuType => {
			const tab = tabContainer.createEl('button', {
				cls: `peak-ui-control-tab ${menuType.id === activeTabId ? 'is-active' : ''}`,
				text: menuType.label
			});
			
			tab.addEventListener('click', () => {
				// Update active tab
				tabContainer.querySelectorAll('.peak-ui-control-tab').forEach(t => t.classList.remove('is-active'));
				tab.classList.add('is-active');
				activeTabId = menuType.id;
				
				// Render content for this tab
				this.renderMenuTypeContent(tabContent, menuType);
			});
		});

		// Render initial content
		this.renderMenuTypeContent(tabContent, menuTypes[0]);
	}

	private renderMenuTypeContent(container: HTMLElement, menuType: { id: string; label: string; desc: string }): void {
		container.empty();

		// Description
		container.createEl('p', {
			text: menuType.desc,
			cls: 'peak-settings-description'
		});

		if (menuType.id === 'ribbon-icons') {
			this.renderRibbonIconsContent(container);
		} else {
			this.renderMenuItemsContent(container, menuType);
		}
	}

	private renderMenuItemsContent(container: HTMLElement, menuType: { id: string; label: string; desc: string }): void {
		// Get discovered items
		const discoveredItems = this.plugin.uiControlService?.getDiscoveredMenuItems(menuType.id) || [];
		const hiddenItems = this.plugin.settings.uiControl.hiddenMenuItems[menuType.id] || {};

		const section = container.createDiv({ cls: 'peak-menu-section' });

		if (discoveredItems.length === 0) {
			section.createDiv({ 
				cls: 'peak-empty-state',
				text: 'No menu items discovered yet. Right-click in the appropriate context to discover menu items.'
			});
		} else {
			// Create items list
			const itemsList = section.createDiv({ cls: 'peak-menu-items-list' });
			
			discoveredItems.forEach(itemTitle => {
				let currentHidden = hiddenItems[itemTitle] === true;
				const itemRow = itemsList.createDiv({ cls: 'peak-menu-item-row' });
				
				// Item title
				itemRow.createSpan({ 
					text: itemTitle,
					cls: 'peak-menu-item-title'
				});
				
				// Toggle button (eye icon)
				const toggleButton = itemRow.createEl('button', {
					cls: `peak-menu-item-toggle ${currentHidden ? 'is-hidden' : ''}`,
					attr: {
						'aria-label': currentHidden ? 'Show item' : 'Hide item'
					}
				});
				
				// Use eye icon (lucide icon)
				toggleButton.innerHTML = currentHidden 
					? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>'
					: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
				
				toggleButton.addEventListener('click', async () => {
					const newHiddenState = !currentHidden;
					
					if (!this.plugin.settings.uiControl.hiddenMenuItems[menuType.id]) {
						this.plugin.settings.uiControl.hiddenMenuItems[menuType.id] = {};
					}
					
					if (newHiddenState) {
						this.plugin.settings.uiControl.hiddenMenuItems[menuType.id][itemTitle] = true;
					} else {
						delete this.plugin.settings.uiControl.hiddenMenuItems[menuType.id][itemTitle];
						if (Object.keys(this.plugin.settings.uiControl.hiddenMenuItems[menuType.id]).length === 0) {
							delete this.plugin.settings.uiControl.hiddenMenuItems[menuType.id];
						}
					}
					
					this.plugin.uiControlService?.updateSettings(this.plugin.settings.uiControl);
					await this.plugin.saveSettings();
					
					// Update UI
					if (newHiddenState) {
						toggleButton.classList.add('is-hidden');
						toggleButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
						toggleButton.setAttribute('aria-label', 'Show item');
					} else {
						toggleButton.classList.remove('is-hidden');
						toggleButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
						toggleButton.setAttribute('aria-label', 'Hide item');
					}

					currentHidden = newHiddenState;
				});
			});
		}
	}

	private renderRibbonIconsContent(container: HTMLElement): void {
		const section = container.createDiv({ cls: 'peak-menu-section' });

		// Ribbon categories
		new Setting(section)
			.setName('Hide Left Ribbon')
			.setDesc('Hide the entire left ribbon sidebar')
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.uiControl.hiddenRibbonCategories['left'] || false);
				toggle.onChange(async (value) => {
					this.plugin.settings.uiControl.hiddenRibbonCategories['left'] = value;
					this.plugin.uiControlService?.updateSettings(this.plugin.settings.uiControl);
					await this.plugin.saveSettings();
				});
			});

		new Setting(section)
			.setName('Hide Right Ribbon')
			.setDesc('Hide the entire right ribbon sidebar')
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.uiControl.hiddenRibbonCategories['right'] || false);
				toggle.onChange(async (value) => {
					this.plugin.settings.uiControl.hiddenRibbonCategories['right'] = value;
					this.plugin.uiControlService?.updateSettings(this.plugin.settings.uiControl);
					await this.plugin.saveSettings();
				});
			});

		// Individual ribbon icons
		const discoveredIcons = this.plugin.uiControlService?.getDiscoveredRibbonIcons() || [];
		const hiddenIcons = this.plugin.settings.uiControl.hiddenRibbonIcons;

		if (discoveredIcons.length === 0) {
			section.createDiv({ 
				cls: 'peak-empty-state',
				text: 'No ribbon icons discovered yet. Icons will be discovered automatically when they appear in the sidebar.'
			});
		} else {
			section.createEl('h4', { text: 'Individual Icons' });
			const iconsList = section.createDiv({ cls: 'peak-menu-items-list' });
			
			discoveredIcons.forEach(iconTitle => {
				let currentHidden = hiddenIcons[iconTitle] === true;
				const iconRow = iconsList.createDiv({ cls: 'peak-menu-item-row' });
				
				// Icon title
				iconRow.createSpan({ 
					text: iconTitle,
					cls: 'peak-menu-item-title'
				});
				
				// Toggle button (eye icon)
				const toggleButton = iconRow.createEl('button', {
					cls: `peak-menu-item-toggle ${currentHidden ? 'is-hidden' : ''}`,
					attr: {
						'aria-label': currentHidden ? 'Show icon' : 'Hide icon'
					}
				});
				
				// Use eye icon
				toggleButton.innerHTML = currentHidden 
					? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>'
					: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
				
				toggleButton.addEventListener('click', async () => {
					const newHiddenState = !currentHidden;
					
					if (newHiddenState) {
						this.plugin.settings.uiControl.hiddenRibbonIcons[iconTitle] = true;
					} else {
						delete this.plugin.settings.uiControl.hiddenRibbonIcons[iconTitle];
					}
					
					this.plugin.uiControlService?.updateSettings(this.plugin.settings.uiControl);
					await this.plugin.saveSettings();
					
					// Update UI
					if (newHiddenState) {
						toggleButton.classList.add('is-hidden');
						toggleButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
						toggleButton.setAttribute('aria-label', 'Show icon');
					} else {
						toggleButton.classList.remove('is-hidden');
						toggleButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
						toggleButton.setAttribute('aria-label', 'Hide icon');
					}

					currentHidden = newHiddenState;
				});
			});
		}
	}
}

/**
 * Simple input modal for text input
 */
class InputModal extends Modal {
	private inputValue: string = '';

	constructor(
		app: App,
		private message: string,
		private onSubmit: (value: string | null) => void
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: this.message });

		let input: TextComponent;
		new Setting(contentEl)
			.addText((text) => {
				input = text;
				text.setPlaceholder(this.message);
				text.onChange((value) => {
					this.inputValue = value;
				});
				text.inputEl.addEventListener('keydown', (evt) => {
					if (evt.key === 'Enter' && !evt.shiftKey) {
						evt.preventDefault();
						this.handleSubmit();
					}
					if (evt.key === 'Escape') {
						evt.preventDefault();
						this.handleCancel();
					}
				});
			});

		new Setting(contentEl)
			.addButton((button) => {
				button.setButtonText('OK');
				button.setCta();
				button.onClick(() => this.handleSubmit());
			})
			.addButton((button) => {
				button.setButtonText('Cancel');
				button.onClick(() => this.handleCancel());
			});

		// Focus input
		setTimeout(() => input.inputEl.focus(), 100);
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}

	private handleSubmit(): void {
		const value = this.inputValue.trim() || null;
		this.close();
		this.onSubmit(value);
	}

	private handleCancel(): void {
		this.close();
		this.onSubmit(null);
	}
}
