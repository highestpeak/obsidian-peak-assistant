import { App, Modal, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { buildLogMetricListener } from 'src/business/LogMetricRegister';
import { EventDispatcher } from 'src/core/EventDispatcher';
import { registerHTMLViews } from 'src/core/HtmlView';
import { AIServiceManager, AIServiceSettings, DEFAULT_AI_SERVICE_SETTINGS } from 'src/service/chat/service-manager';
import { coerceModelId } from 'src/service/chat/types-models';
import { ChatProjectMeta } from 'src/service/chat/types';
import { CHAT_VIEW_TYPE, ChatView } from 'src/view/ChatView';

interface MyPluginSettings {
	mySetting: string;
	scriptFolder: string;
	htmlViewConfigFile: string;
	statisticsDataStoreFolder: string;
	ai: AIServiceSettings;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default',
	scriptFolder: 'A-control',
	htmlViewConfigFile: 'A-control/PeakAssistantScript/HtmlViewConfig.json',
	statisticsDataStoreFolder: 'A-control/PeakAssistantDataStore/RepoStatistics',
	ai: DEFAULT_AI_SERVICE_SETTINGS,
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
	eventHandler: EventDispatcher;
	aiManager: AIServiceManager;

	async onload() {
		await this.loadSettings();

		// event dispatcher
		this.eventHandler = new EventDispatcher(this.app, this);
		// add external script listener
		this.eventHandler.addScriptFolderListener(this.settings.scriptFolder)
		// add statistics listener
		this.eventHandler.addNewHandlers(
			buildLogMetricListener(this.settings.statisticsDataStoreFolder)
		)
		// register home view
		registerHTMLViews(
			this.settings.htmlViewConfigFile,
			this
		)

		this.aiManager = new AIServiceManager(this.app, this.settings.ai);
		await this.aiManager.init();

		this.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, this.aiManager));

		this.addRibbonIcon('message-square', 'Open Peak Assistant', () => {
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

		// add setting ui
		this.addSettingTab(new SampleSettingTab(this.app, this));
	}

	onunload() {
		this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE).forEach((leaf) => leaf.detach());
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
		const settingsBag = this.settings as unknown as Record<string, unknown>;
		delete settingsBag.chat;
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private async activateChatView(): Promise<void> {
		const leaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
		if (leaves.length > 0) {
			this.app.workspace.revealLeaf(leaves[0]);
			return;
		}
		const leaf = this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getLeaf(true);
		if (!leaf) {
			return;
		}
		await leaf.setViewState({ type: CHAT_VIEW_TYPE, active: true });
		this.app.workspace.revealLeaf(leaf);
	}

	private async showInputDialog(message: string): Promise<string | null> {
		return new Promise((resolve) => {
			const result = window.prompt(message);
			resolve(result);
		});
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

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('EventScriptFolder')
			.setDesc('Script in this folder will be register to listen to target events.')
			.addText(text => text
				.setPlaceholder('Enter your Folder')
				.setValue(this.plugin.settings.scriptFolder)
				.onChange(async (value) => {
					this.plugin.settings.scriptFolder = value;
					this.plugin.eventHandler.addScriptFolderListener(value)
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
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

		new Setting(containerEl)
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

		new Setting(containerEl)
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

		new Setting(containerEl)
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

	}
}
