import { App, PluginSettingTab, Setting } from 'obsidian';
import type MyPlugin from 'main';
import { AIServiceSettings, DEFAULT_AI_SERVICE_SETTINGS, DEFAULT_SEARCH_SETTINGS, DEFAULT_SETTINGS, MyPluginSettings } from '@/app/settings/types';
import React from 'react';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { ProviderSettingsComponent } from '@/ui/view/settings/ProviderSettings';
import { EventBus, SettingsUpdatedEvent } from '@/core/eventBus';

/**
 * Renders plugin settings UI with multiple tabs.
 */
export class MySettings extends PluginSettingTab {
	private activeTab = 'general';
	private readonly pluginRef: MyPlugin;
	private providerSettingsRenderer: ReactRenderer | null = null;
	private eventBus: EventBus;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.pluginRef = plugin;
		this.eventBus = EventBus.getInstance(app);
	}

	/**
	 * Builds the full settings layout and tab navigation.
	 */
	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Clean up React renderer when switching tabs or re-rendering
		if (this.providerSettingsRenderer) {
			this.providerSettingsRenderer.unmount();
			this.providerSettingsRenderer = null;
		}

		this.renderTabsNavigation(containerEl);
		const contentArea = containerEl.createDiv({ cls: 'peak-settings-content' });
		this.renderActiveTab(contentArea);
	}

	/**
	 * Render settings tabs navigation.
	 */
	private renderTabsNavigation(containerEl: HTMLElement): void {
		containerEl.addClass('peak-settings-tab');
		const tabContainer = containerEl.createDiv({ cls: 'peak-settings-tabs' });
		const tabs = [
			{ id: 'general', label: 'General' },
			{ id: 'ai-models', label: 'Chat' },
			{ id: 'command-hidden', label: 'Command Hidden' },
		];

		tabs.forEach((tab) => {
			const tabEl = tabContainer.createDiv({
				cls: `peak-settings-tab-item ${this.activeTab === tab.id ? 'is-active' : ''}`,
				text: tab.label,
			});
			tabEl.addEventListener('click', () => {
				this.activeTab = tab.id;
				this.display();
			});
		});
	}

	/**
	 * Render active tab's content by current state.
	 */
	private renderActiveTab(container: HTMLElement): void {
		switch (this.activeTab) {
			case 'general':
				this.renderGeneralTab(container);
				break;
			case 'ai-models':
				this.renderAIModelsTab(container);
				break;
			case 'command-hidden':
				this.renderCommandHiddenTab(container);
				break;
		}
	}

	/**
	 * Shows general configuration options.
	 */
	private renderGeneralTab(container: HTMLElement): void {
		container.empty();

		const wrapper = container.createDiv({ cls: 'peak-settings-card' });

		new Setting(wrapper)
			.setName('EventScriptFolder')
			.setDesc('Script in this folder will be register to listen to target events.')
			.addText((text) =>
				text
					.setPlaceholder('Enter your Folder')
					.setValue(this.pluginRef.settings.scriptFolder)
					.onChange(async (value) => {
						this.pluginRef.settings.scriptFolder = value;
						if (this.pluginRef.eventHandler) {
							this.pluginRef.eventHandler.addScriptFolderListener(value);
						}
						await this.pluginRef.saveSettings();
					})
			);

		new Setting(wrapper)
			.setName('Data Storage Folder')
			.setDesc('Folder for storing plugin data files (e.g., search database). Leave empty to use plugin directory.')
			.addText((text) =>
				text
					.setPlaceholder('Leave empty for plugin directory')
					.setValue(this.pluginRef.settings.dataStorageFolder || '')
					.onChange(async (value) => {
						this.pluginRef.settings.dataStorageFolder = value.trim();
						await this.pluginRef.saveSettings();
					})
			);

		// Search indexing settings
		new Setting(wrapper)
			.setName('Auto Index on Startup')
			.setDesc('Automatically index files when Obsidian opens. If disabled, you can manually trigger indexing via command palette (Command+P: "Index Search").')
			.addToggle((toggle) =>
				toggle
					.setValue(this.pluginRef.settings.search.autoIndex)
					.onChange(async (value) => {
						this.pluginRef.settings.search.autoIndex = value;
						await this.pluginRef.saveSettings();
					}),
			);

		new Setting(wrapper)
			.setName('Index Document Types')
			.setDesc('Select which file types to include in search index.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.pluginRef.settings.search.includeDocumentTypes.markdown)
					.setTooltip('Index Markdown files')
					.onChange(async (value) => {
						this.pluginRef.settings.search.includeDocumentTypes.markdown = value;
						await this.pluginRef.saveSettings();
					}),
			)
			.addExtraButton((button) => button.setTooltip('Markdown files').setIcon('file-text'));

		new Setting(wrapper)
			.setName('')
			.setDesc('')
			.addToggle((toggle) =>
				toggle
					.setValue(this.pluginRef.settings.search.includeDocumentTypes.pdf)
					.setTooltip('Index PDF files')
					.onChange(async (value) => {
						this.pluginRef.settings.search.includeDocumentTypes.pdf = value;
						await this.pluginRef.saveSettings();
					}),
			)
			.addExtraButton((button) => button.setTooltip('PDF files').setIcon('file-text'));

		new Setting(wrapper)
			.setName('')
			.setDesc('')
			.addToggle((toggle) =>
				toggle
					.setValue(this.pluginRef.settings.search.includeDocumentTypes.image)
					.setTooltip('Index Image files')
					.onChange(async (value) => {
						this.pluginRef.settings.search.includeDocumentTypes.image = value;
						await this.pluginRef.saveSettings();
					}),
			)
			.addExtraButton((button) => button.setTooltip('Image files').setIcon('image'));

		// Document chunking settings
		new Setting(wrapper)
			.setName('Max Chunk Size')
			.setDesc(`Maximum characters per chunk. Default: 1000`)
			.addText((text) =>
				text
					.setPlaceholder('1000')
					.setValue(String(this.pluginRef.settings.search.chunking?.maxChunkSize ?? 1000))
					.onChange(async (value) => {
						if (!this.pluginRef.settings.search.chunking) return;
						const num = parseInt(value, 10);
						if (!isNaN(num) && num > 0) {
							this.pluginRef.settings.search.chunking.maxChunkSize = num;
							await this.pluginRef.saveSettings();
						}
					}),
			);

		new Setting(wrapper)
			.setName('Chunk Overlap')
			.setDesc(`Characters of overlap between chunks. Default: 200`)
			.addText((text) =>
				text
					.setPlaceholder('200')
					.setValue(String(this.pluginRef.settings.search.chunking?.chunkOverlap ?? 200))
					.onChange(async (value) => {
						if (!this.pluginRef.settings.search.chunking) return;
						const num = parseInt(value, 10);
						if (!isNaN(num) && num >= 0) {
							this.pluginRef.settings.search.chunking.chunkOverlap = num;
							await this.pluginRef.saveSettings();
						}
					}),
			);
	}

	/**
	 * Shows default model and provider credential settings.
	 */
	private renderAIModelsTab(container: HTMLElement): void {
		container.empty();

		const wrapper = container.createDiv({ cls: 'peak-settings-card' });

		// Basic settings (not in collapsible group)
		new Setting(wrapper)
			.setName('Chat Root Mode')
			.setDesc('Choose the default navigation mode')
			.addDropdown((dropdown) => {
				dropdown.addOption('project-first', 'Project First');
				dropdown.addOption('conversation-first', 'Conversation First');
				dropdown.setValue(this.pluginRef.settings.ai.rootMode);
				dropdown.onChange(async (value) => {
					this.pluginRef.settings.ai.rootMode = value as AIServiceSettings['rootMode'];
					this.pluginRef.aiServiceManager?.updateSettings(this.pluginRef.settings.ai);
					this.pluginRef.aiServiceManager?.refreshDefaultServices();
					await this.pluginRef.aiServiceManager?.init();
					await this.pluginRef.saveSettings();
				});
			});

		new Setting(wrapper)
			.setName('Chat Root Folder')
			.setDesc('Root folder for AI conversation data')
			.addText((text) => {
				let pendingRootFolder = this.pluginRef.settings.ai.rootFolder;
				const commitRootFolder = async () => {
					const next = (pendingRootFolder?.trim() || DEFAULT_AI_SERVICE_SETTINGS.rootFolder);
					if (next === this.pluginRef.settings.ai.rootFolder) {
						pendingRootFolder = next;
						text.setValue(next);
						return;
					}
					await this.applyChatRootFolder(next);
					pendingRootFolder = this.pluginRef.settings.ai.rootFolder;
					text.setValue(pendingRootFolder);
				};

				text
					.setPlaceholder('e.g. ChatFolder')
					.setValue(pendingRootFolder)
					.onChange((value) => {
						pendingRootFolder = value;
					});

				text.inputEl.addEventListener('blur', () => {
					void commitRootFolder();
				});
				text.inputEl.addEventListener('keydown', (evt) => {
					if (evt.key === 'Enter' && !evt.shiftKey) {
						evt.preventDefault();
						void commitRootFolder();
						text.inputEl.blur();
					}
				});
			});

		new Setting(wrapper)
			.setName('Prompt Folder')
			.setDesc('Folder containing conversation and summary prompts')
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_AI_SERVICE_SETTINGS.promptFolder)
					.setValue(this.pluginRef.settings.ai.promptFolder)
					.onChange(async (value) => {
						const next = value?.trim() || DEFAULT_AI_SERVICE_SETTINGS.promptFolder;
						this.pluginRef.settings.ai.promptFolder = next;
						this.pluginRef.aiServiceManager?.setPromptFolder(next);
						this.pluginRef.aiServiceManager?.updateSettings(this.pluginRef.settings.ai);
						this.pluginRef.aiServiceManager?.refreshDefaultServices();
						await this.pluginRef.aiServiceManager?.init();
						await this.pluginRef.saveSettings();
					})
			);

		new Setting(wrapper)
			.setName('Upload Folder')
			.setDesc('Folder for storing uploaded files (PDFs, images, etc.)')
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_AI_SERVICE_SETTINGS.uploadFolder)
					.setValue(this.pluginRef.settings.ai.uploadFolder || DEFAULT_AI_SERVICE_SETTINGS.uploadFolder)
					.onChange(async (value) => {
						const next = value?.trim() || DEFAULT_AI_SERVICE_SETTINGS.uploadFolder;
						this.pluginRef.settings.ai.uploadFolder = next;
						this.pluginRef.aiServiceManager?.updateSettings(this.pluginRef.settings.ai);
						await this.pluginRef.saveSettings();
					})
			);

		// Provider Settings as a collapsible group
		this.renderProviderSettingsGroup(wrapper);
	}

	/**
	 * Apply a confirmed chat root folder so storage can reinitialize.
	 */
	private async applyChatRootFolder(value: string): Promise<void> {
		const next = (value?.trim() || DEFAULT_AI_SERVICE_SETTINGS.rootFolder);
		if (next === this.pluginRef.settings.ai.rootFolder) {
			return;
		}
		this.pluginRef.settings.ai.rootFolder = next;
		this.pluginRef.aiServiceManager?.updateSettings(this.pluginRef.settings.ai);
		this.pluginRef.aiServiceManager?.refreshDefaultServices();
		await this.pluginRef.aiServiceManager?.init();
		await this.pluginRef.saveSettings();
	}

	/**
	 * Renders the main Provider Settings collapsible group using React component.
	 */
	private renderProviderSettingsGroup(container: HTMLElement): void {
		// Clean up previous renderer if exists
		if (this.providerSettingsRenderer) {
			this.providerSettingsRenderer.unmount();
			this.providerSettingsRenderer = null;
		}

		// Create container for React component
		const reactContainer = container.createDiv({ cls: 'peak-provider-settings-react-container' });

		// Create React renderer
		this.providerSettingsRenderer = new ReactRenderer(reactContainer);

		// Handle settings updates
		const handleUpdate = async (updates: Partial<AIServiceSettings>) => {
			// Merge updates into current settings
			this.pluginRef.settings.ai = {
				...this.pluginRef.settings.ai,
				...updates,
			};

			// Update AI manager
			this.pluginRef.aiServiceManager?.updateSettings(this.pluginRef.settings.ai);
			this.pluginRef.aiServiceManager?.refreshDefaultServices();
			await this.pluginRef.aiServiceManager?.init();
			await this.pluginRef.saveSettings();

			// Dispatch settings updated event
			this.eventBus.dispatch(new SettingsUpdatedEvent());

			// Re-render React component with updated settings
			if (this.providerSettingsRenderer) {
				this.providerSettingsRenderer.render(
					React.createElement(ProviderSettingsComponent, {
						settings: this.pluginRef.settings.ai,
						aiServiceManager: this.pluginRef.aiServiceManager,
						onUpdate: handleUpdate,
					})
				);
			}
		};

		// Render React component
		this.providerSettingsRenderer.render(
			React.createElement(ProviderSettingsComponent, {
				settings: this.pluginRef.settings.ai,
				aiServiceManager: this.pluginRef.aiServiceManager,
				onUpdate: handleUpdate,
			})
		);
	}

	/**
	 * Renders UI visibility controls including menu discovery.
	 */
	private renderCommandHiddenTab(container: HTMLElement): void {
		container.empty();
		const wrapper = container.createDiv({ cls: 'peak-settings-card' });

		// render header
		wrapper.createEl('h3', { text: 'Command Hidden' });
		wrapper.createEl('p', {
			text: 'Control which command are hidden. Items are automatically discovered. Click the eye icon to toggle visibility.',
			cls: 'peak-settings-description',
		});

		// refreshSetting
		new Setting(wrapper)
			.setName('Refresh Menu Items')
			.setDesc(
				'Click to manually refresh discovered menu items. You can also right-click in different contexts to automatically discover items.'
			)
			.addButton((button) => {
				button.setButtonText('Refresh Now');
				button.setCta();
				button.onClick(async () => {
					this.display();
				});
			})

		// render tabs for different menu types
		const tabContainer = wrapper.createDiv({ cls: 'peak-ui-control-tabs' });
		const tabContent = wrapper.createDiv({ cls: 'peak-ui-control-tab-content' });
		const menuTypes = [
			// Temporarily disabled: file-menu and editor-menu handling
			// { id: 'file-menu', label: 'File Explorer Menu', desc: 'Right-click menu on files/folders in file explorer' },
			// { id: 'editor-menu', label: 'Editor Menu', desc: 'Right-click menu in the editor' },
			{ id: 'slash-commands', label: 'Slash Commands', desc: 'Slash commands (/) in markdown editor' },
			{ id: 'command-palette', label: 'Command Palette', desc: 'Commands in Command Palette (Cmd/Ctrl+P)' },
			{ id: 'ribbon-icons', label: 'Ribbon Icons', desc: 'Icons in the left sidebar ribbon' },
		];
		let activeTabId = menuTypes[0].id;
		menuTypes.forEach((menuType) => {
			const tab = tabContainer.createEl('button', {
				cls: `peak-ui-control-tab ${menuType.id === activeTabId ? 'is-active' : ''}`,
				text: menuType.label,
			});

			tab.addEventListener('click', () => {
				tabContainer.querySelectorAll('.peak-ui-control-tab').forEach((t) => t.classList.remove('is-active'));
				tab.classList.add('is-active');
				activeTabId = menuType.id;

				this.renderMenuTypeContent(tabContent, menuType);
			});
		});
		// render first tab content
		this.renderMenuTypeContent(tabContent, menuTypes[0]);
	}

	/**
	 * Shows per menu-type configuration panels.
	 */
	private renderMenuTypeContent(container: HTMLElement, menuType: { id: string; label: string; desc: string }): void {
		container.empty();

		container.createEl('p', {
			text: menuType.desc,
			cls: 'peak-settings-description',
		});

		this.renderHiddenCategory(container, menuType.id, menuType.desc);
	}

	/**
	 * Displays discovered items for any category (menus or ribbon-icons) with visibility toggles.
	 */
	private renderHiddenCategory(container: HTMLElement, categoryId: string, _desc: string): void {
		// Create a content wrapper that can be safely cleared without affecting description
		const contentWrapper = container.createDiv({ cls: 'peak-hidden-category-content' });
		// Use renderHiddenCategoryContent to ensure buttons are always present
		this.renderHiddenCategoryContent(contentWrapper, categoryId, _desc);
	}

	/**
	 * Renders the content part of hidden category (buttons and list) without description.
	 */
	private renderHiddenCategoryContent(container: HTMLElement, categoryId: string, _desc: string): void {
		const discovered = this.pluginRef.commandHiddenControlService?.getDiscovered(categoryId) || [];
		const hiddenByType = this.pluginRef.settings.commandHidden.hiddenMenuItems;
		const hiddenMap = hiddenByType[categoryId] || {};

		const emptyText = 'No items discovered yet. They will appear once detected.';
		const labels = { show: 'Show item', hide: 'Hide item' };

		// Bulk actions: Use Setting-like layout with description on left and buttons on right
		const bulkActionsWrapper = container.createDiv({ cls: 'peak-bulk-actions-wrapper' });
		const bulkActionsInfo = bulkActionsWrapper.createDiv({ cls: 'peak-bulk-actions-info' });
		bulkActionsInfo.createEl('div', {
			text: 'Bulk Actions',
			cls: 'peak-bulk-actions-name'
		});
		bulkActionsInfo.createEl('div', {
			text: 'Control visibility of all commands and icons',
			cls: 'peak-bulk-actions-desc'
		});

		// Bulk actions buttons on the right
		const bulkBar = bulkActionsWrapper.createDiv({ cls: 'peak-bulk-actions' });
		const hideAllBtn = bulkBar.createEl('button', { text: 'Hide All', cls: 'peak-bulk-action hide-all' });
		const showAllBtn = bulkBar.createEl('button', { text: 'Display All', cls: 'peak-bulk-action show-all' });
		
		// Collapse/Expand list buttons
		const collapseBtn = bulkBar.createEl('button', { text: 'Collapse List', cls: 'peak-bulk-action collapse-list' });
		const expandBtn = bulkBar.createEl('button', { text: 'Expand List', cls: 'peak-bulk-action expand-list' });
		collapseBtn.style.display = 'none'; // Initially hide collapse button (list is collapsed by default)

		// Create list container that can be collapsed/expanded
		const listContainer = container.createDiv({ cls: 'peak-menu-list-container' });
		let isCollapsed = true; // Default to collapsed state

		const updateCollapseState = (collapsed: boolean) => {
			isCollapsed = collapsed;
			if (collapsed) {
				listContainer.classList.add('is-collapsed');
				collapseBtn.style.display = 'none';
				expandBtn.style.display = '';
			} else {
				listContainer.classList.remove('is-collapsed');
				collapseBtn.style.display = '';
				expandBtn.style.display = 'none';
			}
		};

		// Initialize to collapsed state
		updateCollapseState(true);

		collapseBtn.addEventListener('click', () => {
			updateCollapseState(true);
		});

		expandBtn.addEventListener('click', () => {
			updateCollapseState(false);
		});

		hideAllBtn.addEventListener('click', async () => {
			if (!hiddenByType[categoryId]) hiddenByType[categoryId] = {};
			discovered.forEach((title) => {
				// Exclude "Delete" item from hide all operation
				if (title && !this.isDeleteItem(title)) {
					hiddenByType[categoryId][title] = true;
				}
			});
			this.pluginRef.commandHiddenControlService?.updateSettings(this.pluginRef.settings.commandHidden);
			await this.pluginRef.saveSettings();
			// Only refresh the list, keep buttons intact
			listContainer.empty();
			this.renderHiddenList(
				listContainer,
				discovered,
				emptyText,
				labels,
				(title) => hiddenByType[categoryId][title] === true,
				async (title, nextHidden) => {
					// Prevent hiding "Delete" item for menu types
					if ((categoryId === 'file-menu' || categoryId === 'editor-menu') && this.isDeleteItem(title) && nextHidden) {
						return;
					}
					if (!hiddenByType[categoryId]) hiddenByType[categoryId] = {};
					if (nextHidden) {
						hiddenByType[categoryId][title] = true;
					} else {
						delete hiddenByType[categoryId][title];
						if (Object.keys(hiddenByType[categoryId]).length === 0) {
							delete hiddenByType[categoryId];
						}
					}
					this.pluginRef.commandHiddenControlService?.updateSettings(this.pluginRef.settings.commandHidden);
					await this.pluginRef.saveSettings();
				},
				categoryId
			);
		});

		showAllBtn.addEventListener('click', async () => {
			if (hiddenByType[categoryId]) {
				discovered.forEach((title) => {
					if (title) delete hiddenByType[categoryId][title];
				});
				if (Object.keys(hiddenByType[categoryId]).length === 0) {
					delete hiddenByType[categoryId];
				}
			}
			this.pluginRef.commandHiddenControlService?.updateSettings(this.pluginRef.settings.commandHidden);
			await this.pluginRef.saveSettings();
			// Only refresh the list, keep buttons intact
			listContainer.empty();
			this.renderHiddenList(
				listContainer,
				discovered,
				emptyText,
				labels,
				(title) => hiddenByType[categoryId][title] === true,
				async (title, nextHidden) => {
					// Prevent hiding "Delete" item for menu types
					if ((categoryId === 'file-menu' || categoryId === 'editor-menu') && this.isDeleteItem(title) && nextHidden) {
						return;
					}
					if (!hiddenByType[categoryId]) hiddenByType[categoryId] = {};
					if (nextHidden) {
						hiddenByType[categoryId][title] = true;
					} else {
						delete hiddenByType[categoryId][title];
						if (Object.keys(hiddenByType[categoryId]).length === 0) {
							delete hiddenByType[categoryId];
						}
					}
					this.pluginRef.commandHiddenControlService?.updateSettings(this.pluginRef.settings.commandHidden);
					await this.pluginRef.saveSettings();
				},
				categoryId
			);
		});

		this.renderHiddenList(
			listContainer,
			discovered,
			emptyText,
			labels,
			(title) => hiddenMap[title] === true,
			async (title, nextHidden) => {
				// Prevent hiding "Delete" item for menu types
				if ((categoryId === 'file-menu' || categoryId === 'editor-menu') && this.isDeleteItem(title) && nextHidden) {
					return;
				}
				if (!hiddenByType[categoryId]) hiddenByType[categoryId] = {};
				if (nextHidden) {
					hiddenByType[categoryId][title] = true;
				} else {
					delete hiddenByType[categoryId][title];
					if (Object.keys(hiddenByType[categoryId]).length === 0) {
						delete hiddenByType[categoryId];
					}
				}
				this.pluginRef.commandHiddenControlService?.updateSettings(this.pluginRef.settings.commandHidden);
				await this.pluginRef.saveSettings();
			},
			categoryId
		);
	}


	/**
	 * Generic helper to render a list or an empty-state message.
	 */
	private renderListOrEmpty(
		container: HTMLElement,
		items: string[],
		emptyText: string,
		renderControls: (rowEl: HTMLElement, title: string) => void
	): void {
		const section = container.createDiv({ cls: 'peak-menu-section' });
		if (items.length === 0) {
			section.createDiv({
				cls: 'peak-empty-state',
				text: emptyText,
			});
			return;
		}
		const listEl = section.createDiv({ cls: 'peak-menu-items-list' });
		items.forEach((title) => {
			const row = listEl.createDiv({ cls: 'peak-menu-item-row' });
			row.createSpan({ text: title, cls: 'peak-menu-item-title' });
			renderControls(row, title);
		});
	}

	/**
	 * Create a generic eye toggle button and wire standard visual updates.
	 */
	private createVisibilityToggle(
		parent: HTMLElement,
		isHidden: boolean,
		labels: { show: string; hide: string },
		onToggle: (nextHidden: boolean) => Promise<void> | void
	): HTMLButtonElement {
		const toggleButton = parent.createEl('button', {
			cls: `peak-menu-item-toggle ${isHidden ? 'is-hidden' : ''}`,
			attr: { 'aria-label': isHidden ? labels.show : labels.hide },
		});
		const setVisual = (hidden: boolean) => {
			if (hidden) {
				toggleButton.classList.add('is-hidden');
				toggleButton.innerHTML =
					'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
				toggleButton.setAttribute('aria-label', labels.show);
			} else {
				toggleButton.classList.remove('is-hidden');
				toggleButton.innerHTML =
					'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
				toggleButton.setAttribute('aria-label', labels.hide);
			}
		};
		setVisual(isHidden);
		toggleButton.addEventListener('click', async () => {
			const nextHidden = !isHidden;
			await onToggle(nextHidden);
			setVisual(nextHidden);
			isHidden = nextHidden;
		});
		return toggleButton;
	}

	/**
	 * Check if a menu item title is "Delete" (case-insensitive)
	 */
	private isDeleteItem(title: string): boolean {
		if (!title) return false;
		const norm = title.trim().toLowerCase();
		return norm === 'delete' || norm === '删除';
	}

	/**
	 * Generic helper to render a toggle-able hidden list (menu/ribbon).
	 * "Delete" item cannot be hidden for file-menu and editor-menu.
	 */
	private renderHiddenList(
		container: HTMLElement,
		items: string[],
		emptyText: string,
		labels: { show: string; hide: string },
		isHiddenLookup: (title: string) => boolean,
		applyChange: (title: string, nextHidden: boolean) => Promise<void>,
		categoryId?: string
	): void {
		this.renderListOrEmpty(container, items, emptyText, (row, title) => {
			const isDelete = this.isDeleteItem(title);
			const isMenuType = categoryId === 'file-menu' || categoryId === 'editor-menu';
			const cannotHide = isDelete && isMenuType;
			
			let currentHidden = isHiddenLookup(title);
			// Force "Delete" to be visible for menu types
			if (cannotHide) {
				currentHidden = false;
			}
			
			const toggleButton = this.createVisibilityToggle(row, currentHidden, labels, async (nextHidden) => {
				// Prevent hiding "Delete" item for menu types
				if (cannotHide && nextHidden) {
					return;
				}
				await applyChange(title, nextHidden);
				currentHidden = nextHidden;
			});
			
			// Disable toggle button for "Delete" item in menu types
			if (cannotHide) {
				toggleButton.disabled = true;
				toggleButton.classList.add('peak-menu-item-toggle-disabled');
				toggleButton.setAttribute('title', 'Delete item cannot be hidden');
			}
		});
	}
}

/**
 * Load and normalize plugin settings from persisted data.
 */
export function normalizePluginSettings(data: unknown): MyPluginSettings {
	const raw = (data ?? {}) as Record<string, unknown>;
	const settings: MyPluginSettings = Object.assign({}, DEFAULT_SETTINGS, raw);
	const legacyChatSettings = raw?.chat as Partial<AIServiceSettings> | undefined;
	settings.ai = Object.assign({}, DEFAULT_AI_SERVICE_SETTINGS, raw?.ai ?? legacyChatSettings ?? {});
	settings.search = Object.assign({}, DEFAULT_SEARCH_SETTINGS, raw?.search ?? {});
	// Migrate from legacy neverPromptAgain to autoIndex
	if ('neverPromptAgain' in (raw?.search ?? {})) {
		settings.search.autoIndex = !(raw?.search as any)?.neverPromptAgain;
		delete (settings.search as any).neverPromptAgain;
	}
	// Normalize includeDocumentTypes: merge with defaults, ensuring all DocumentTypes are present
	const rawIncludeTypes = (settings.search as any)?.includeDocumentTypes ?? {};
	settings.search.includeDocumentTypes = Object.assign(
		{},
		DEFAULT_SEARCH_SETTINGS.includeDocumentTypes,
		rawIncludeTypes,
	);
	// Ensure chunking settings exist
	if (!settings.search.chunking) {
		settings.search.chunking = DEFAULT_SEARCH_SETTINGS.chunking;
	} else {
		settings.search.chunking = Object.assign(
			{},
			DEFAULT_SEARCH_SETTINGS.chunking,
			settings.search.chunking,
		);
	}
	if (!settings.ai.promptFolder) {
		const legacyPromptFolder = typeof raw?.promptFolder === 'string' ? (raw.promptFolder as string) : undefined;
		settings.ai.promptFolder = legacyPromptFolder || DEFAULT_AI_SERVICE_SETTINGS.promptFolder;
	}
	settings.ai.defaultModelId = settings.ai.defaultModelId || 'gpt-4.1-mini';
	settings.commandHidden = Object.assign({}, settings.commandHidden, raw?.uiControl ?? {});
	const settingsBag = settings as unknown as Record<string, unknown>;
	delete settingsBag.chat;
	return settings;
}
