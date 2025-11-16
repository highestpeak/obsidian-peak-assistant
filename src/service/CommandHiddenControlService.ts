import { App, Menu, MenuItem, Plugin } from 'obsidian';

/**
 * Configuration for UI control settings
 */
export interface CommandHiddenSettings {
	/**
	 * Hidden context menu items by menu type and item title
	 * Format: { menuType: { itemTitle: true } }
	 * Menu types: 'file-menu', 'editor-menu', 'slash-commands', 'command-palette'
	 */
	hiddenMenuItems: Record<string, Record<string, boolean>>;

	/**
	 * Unified discovered map by category (including 'ribbon-icons')
	 */
	discoveredByCategory?: Record<string, string[]>;
}

export const DEFAULT_COMMAND_HIDDEN_SETTINGS: CommandHiddenSettings = {
	hiddenMenuItems: {},
	discoveredByCategory: {},
};

/**
 * Service for controlling UI elements visibility (menus, ribbon icons)
 */
export class CommandHiddenControlService {
	private app: App;
	private plugin: Plugin;
	private settings: CommandHiddenSettings;
	private menuEventRefs: Array<{ type: string; ref: any }> = [];
	private ribbonObserver?: MutationObserver;
	private ribbonIntervalId?: number;
	private slashCommandObserver?: MutationObserver;
	private commandPaletteObserver?: MutationObserver;
	private menuItemMap: Map<Menu, { menuType: string; items: Array<{ title: string; item: any }> }> = new Map();
	private originalAddItem?: (cb: (item: MenuItem) => any) => Menu;
	private originalRegisterEditorSuggest?: (editorSuggest: any) => void;
	private originalAddCommand?: (command: any) => void;

	constructor(app: App, plugin: Plugin, settings: CommandHiddenSettings) {
		this.app = app;
		this.plugin = plugin;
		this.settings = settings;
	}

	/**
	 * Initialize the service and register event listeners
	 */
	init(): void {
		this.interceptMenuAddItem();
		this.interceptEditorSuggest();
		this.interceptCommandPalette();
		this.registerMenuListeners();
		this.observeRibbonIcons();
	}

	/**
	 * Update settings and reapply
	 */
	updateSettings(settings: CommandHiddenSettings): void {
		this.settings = settings;
		this.unregisterMenuListeners();
		this.registerMenuListeners();
		this.discoverRibbonIcons();
		this.applyRibbonIconVisibility();
	}

	/**
	 * Get discovered items by category id (menus or 'ribbon-icons')
	 */
	getDiscovered(categoryId: string): string[] {
		const byCat = this.settings.discoveredByCategory || {};
		const list = byCat[categoryId];
		if (Array.isArray(list)) return list;
		// No legacy fallback
		return [];
	}

	// =================================== interceptMenuAddItem ===================================

	/**
	 * Intercept Menu.addItem to automatically capture all menu items
	 */
	private interceptMenuAddItem(): void {
		// Save original addItem method
		const MenuProto = Menu.prototype as any;
		if (!MenuProto.addItem) return;
		
		this.originalAddItem = MenuProto.addItem;
		
		// Intercept addItem to capture menu items
		const self = this;
		MenuProto.addItem = function(cb: (item: MenuItem) => any) {
			// Wrap the callback to capture menu item info
			const wrappedCb = (item: MenuItem) => {
				// Call original callback
				const result = cb(item);
				
				// Try to capture title from the menu item after it's been configured
				const itemAny = item as any;
				let title = '';
				
				// Try to get title - menu item might not be fully set up yet,
				// so we'll also check later when menu is shown
				if (itemAny.titleEl) {
					title = itemAny.titleEl.textContent?.trim() || '';
				} else if (itemAny.dom) {
					const titleEl = itemAny.dom.querySelector?.('.menu-item-title');
					title = titleEl?.textContent?.trim() || itemAny.dom.textContent?.trim() || '';
				} else if (itemAny.title) {
					if (typeof itemAny.title === 'string') {
						title = itemAny.title;
					} else if (itemAny.title.textContent) {
						title = itemAny.title.textContent.trim();
					}
				}
				
				// Store menu item info for later discovery
				if (!self.menuItemMap.has(this)) {
					self.menuItemMap.set(this, { menuType: '', items: [] });
				}
				const menuInfo = self.menuItemMap.get(this)!;
				
				if (title) {
					const cleanTitle = title.replace(/^[▶▸▹▻►]+\s*/, '').trim();
					if (cleanTitle && !menuInfo.items.some(i => i.title === cleanTitle)) {
						menuInfo.items.push({ title: cleanTitle, item: item });
					}
				} else {
					// Store item reference even without title, we'll get title later
					menuInfo.items.push({ title: '', item: item });
				}
				
				return result;
			};
			
			// Call original addItem with wrapped callback
			return self.originalAddItem!.call(this, wrappedCb);
		};
	}

	// =================================== interceptEditorSuggest ===================================

	/**
	 * Intercept EditorSuggest (slash commands) to capture suggestions
	 */
	private interceptEditorSuggest(): void {
		// Intercept registerEditorSuggest to capture all registered editor suggests
		const self = this;
		const pluginProto = Plugin.prototype as any;
		
		// First, try to get all existing editor suggests
		this.captureAllEditorSuggests();
		
		if (!this.originalRegisterEditorSuggest && pluginProto.registerEditorSuggest) {
			this.originalRegisterEditorSuggest = pluginProto.registerEditorSuggest;
			pluginProto.registerEditorSuggest = function(editorSuggest: any) {
				const result = self.originalRegisterEditorSuggest?.call(this, editorSuggest);
				if (editorSuggest) {
					self.captureEditorSuggestItems(editorSuggest);
					self.patchEditorSuggest(editorSuggest);
				}
				return result;
			};
		}
		
		// Also monitor DOM for slash command suggestions
		this.observeSlashCommands();
	}

	/**
	 * Capture all existing editor suggests from scope
	 */
	private captureAllEditorSuggests(): void {
		const visited = new Set<any>();
		const scopeAny = this.app.scope as any;
		const workspaceAny = this.app.workspace as any;
		const possibleSources = [
			scopeAny?.editorSuggests,
			scopeAny?._editorSuggests,
			scopeAny?.suggests,
			scopeAny?.editorSuggestions,
			workspaceAny?.editorSuggest,
			workspaceAny?.editorSuggest?.suggests,
			workspaceAny?._editorSuggests,
			workspaceAny?.editorSuggestions,
		];
		
		possibleSources.forEach((source) => this.collectEditorSuggestsFromSource(source, visited));
		
		// Also try to trigger slash commands to capture them
		setTimeout(() => {
			this.triggerSlashCommandsCapture();
		}, 1000);
	}

	private collectEditorSuggestsFromSource(source: any, visited: Set<any>): void {
		if (!source || visited.has(source)) return;
		visited.add(source);

		if (Array.isArray(source)) {
			source.forEach((item) => this.collectEditorSuggestsFromSource(item, visited));
			return;
		}

		if (source instanceof Map) {
			source.forEach((item: any) => this.collectEditorSuggestsFromSource(item, visited));
			return;
		}

		if (source.getSuggestions && typeof source.getSuggestions === 'function') {
			this.captureEditorSuggestItems(source);
			this.patchEditorSuggest(source);
			return;
		}

		if (typeof source === 'object') {
			if (source.suggests) {
				this.collectEditorSuggestsFromSource(source.suggests, visited);
			}
			if (source.activeSuggest) {
				this.collectEditorSuggestsFromSource(source.activeSuggest, visited);
			}
			Object.values(source).forEach((value: any) => {
				if (typeof value === 'object' || Array.isArray(value)) {
					this.collectEditorSuggestsFromSource(value, visited);
				}
			});
		}
	}

	/**
	 * Try to trigger slash commands to capture them
	 */
	private triggerSlashCommandsCapture(): void {
		// This will be called when user types / in editor
		// For now, we rely on DOM observation and getSuggestions interception
	}

	/**
	 * Capture items from an editor suggest
	 */
	private captureEditorSuggestItems(editorSuggest: any): void {
		if (!editorSuggest || !editorSuggest.getSuggestions) return;
		
		// Try to get suggestions with a dummy context
		try {
			const dummyContext = {
				query: '',
				start: { line: 0, ch: 0 },
				end: { line: 0, ch: 0 },
			};
			
			const suggestions = editorSuggest.getSuggestions(dummyContext);
			
			if (suggestions instanceof Promise) {
				suggestions.then((sugs: any[]) => {
					this.captureSuggestions(sugs, 'slash-commands');
				}).catch(() => {
					// Ignore errors
				});
			} else if (Array.isArray(suggestions)) {
				this.captureSuggestions(suggestions, 'slash-commands');
			}
		} catch (e) {
			// Ignore errors - some suggests need real context
		}
	}

	/**
	 * Patch an editor suggest to filter slash commands according to settings
	 */
	private patchEditorSuggest(editorSuggest: any): void {
		if (!editorSuggest || !editorSuggest.getSuggestions) return;
		if ((editorSuggest as any).__peakPatched) return;

		const originalGetSuggestions = editorSuggest.getSuggestions.bind(editorSuggest);
		editorSuggest.getSuggestions = (context: any) => {
			const suggestions = originalGetSuggestions(context);

			if (suggestions instanceof Promise) {
				return suggestions.then((sugs: any[]) => {
					this.captureSuggestions(sugs, 'slash-commands');
					return this.filterSuggestions(sugs, 'slash-commands');
				});
			}

			if (Array.isArray(suggestions)) {
				this.captureSuggestions(suggestions, 'slash-commands');
				return this.filterSuggestions(suggestions, 'slash-commands');
			}

			return suggestions;
		};

		(editorSuggest as any).__peakPatched = true;
	}

	// =================================== interceptCommandPalette ===================================

	/**
	 * Intercept Command Palette to capture commands
	 */
	private interceptCommandPalette(): void {
		// Monitor command palette opening
		const self = this;
		const appAny = this.app as any;
		
		// First, try to get all existing commands
		this.captureAllCommands();
		
		// Intercept commands registration
		if (!appAny.commands || !appAny.commands.addCommand) return;
		this.originalAddCommand = appAny.commands.addCommand.bind(appAny.commands);
		appAny.commands.addCommand = function(command: any) {
			if (!self.originalAddCommand) return;
			const result = self.originalAddCommand(command);
			
			// Capture command info
			if (command && command.name) {
				self.addDiscoveredItem('command-palette', command.name, ['slash-commands']);
			}
			
			return result;
		};
		
		// Intercept command palette modal to capture all commands when opened
		const originalOpenCommandPalette = appAny.commands?.openCommandPalette?.bind(appAny.commands);
		if (originalOpenCommandPalette) {
			appAny.commands.openCommandPalette = function() {
				// Capture all commands when palette opens
				self.captureAllCommands();
				return originalOpenCommandPalette();
			};
		}
		
		// Intercept command palette suggestions
		if (appAny.commands && appAny.commands.suggestions) {
			const originalGetSuggestions = appAny.commands.suggestions.getSuggestions?.bind(appAny.commands.suggestions);
			if (originalGetSuggestions) {
				appAny.commands.suggestions.getSuggestions = function(query: string) {
					const suggestions = originalGetSuggestions(query);
					
					// Capture commands from suggestions
					if (Array.isArray(suggestions)) {
						suggestions.forEach((sug: any) => {
							if (sug.item && sug.item.name) {
								self.addDiscoveredItem('command-palette', sug.item.name, ['slash-commands']);
							} else if (sug.name) {
								self.addDiscoveredItem('command-palette', sug.name, ['slash-commands']);
							}
						});
						
						// Filter hidden commands
						return self.filterSuggestions(suggestions, 'command-palette');
					}
					
					return suggestions;
				};
			}
		}
		
		// Also observe command palette DOM
		this.observeCommandPalette();
	}

	/**
	 * Capture all existing commands from app.commands
	 */
	private captureAllCommands(): void {
		const appAny = this.app as any;
		if (!appAny.commands) return;
		
		// Try multiple ways to access commands
		const commands = 
			appAny.commands.commands || 
			appAny.commands.list || 
			appAny.commands._commands ||
			appAny.commands.commandList ||
			appAny.commands.items;
			
		if (commands && typeof commands === 'object') {
			// Handle Map
			if (commands instanceof Map) {
				commands.forEach((command: any, commandId: string) => {
					if (command && command.name) {
						this.addDiscoveredItem('command-palette', command.name, ['slash-commands']);
					}
				});
			} 
			// Handle array
			else if (Array.isArray(commands)) {
				commands.forEach((command: any) => {
					if (command && command.name) {
						this.addDiscoveredItem('command-palette', command.name, ['slash-commands']);
					}
				});
			}
			// Handle object
			else {
				Object.keys(commands).forEach((commandId: string) => {
					const command = commands[commandId];
					if (command && command.name) {
						this.addDiscoveredItem('command-palette', command.name, ['slash-commands']);
					}
				});
			}
		}
		
		// Also try to get commands from command palette modal when it opens
		setTimeout(() => {
			this.captureCommandsFromPalette();
		}, 1000);
	}

	/**
	 * Capture commands when command palette is actually opened
	 */
	private captureCommandsFromPalette(): void {
		// Try to trigger command palette to get all commands
		const appAny = this.app as any;
		if (appAny.commands && appAny.commands.suggestions) {
			try {
				// Try to get all commands by querying with empty string
				const suggestions = appAny.commands.suggestions.getSuggestions?.('');
				if (Array.isArray(suggestions)) {
					suggestions.forEach((sug: any) => {
						if (sug.item && sug.item.name) {
							this.addDiscoveredItem('command-palette', sug.item.name, ['slash-commands']);
						} else if (sug.name) {
							this.addDiscoveredItem('command-palette', sug.name, ['slash-commands']);
						} else if (typeof sug === 'string') {
							this.addDiscoveredItem('command-palette', sug, ['slash-commands']);
						}
					});
				} else if (suggestions instanceof Promise) {
					suggestions.then((sugs: any[]) => {
						sugs.forEach((sug: any) => {
							if (sug.item && sug.item.name) {
								this.addDiscoveredItem('command-palette', sug.item.name, ['slash-commands']);
							} else if (sug.name) {
								this.addDiscoveredItem('command-palette', sug.name, ['slash-commands']);
							}
						});
					}).catch(() => {});
				}
			} catch (e) {
				// Ignore errors
			}
		}
	}

	/**
	 * Helper to add discovered item
	 */
	private addDiscoveredItem(menuType: string, itemName: string, alsoMenuTypes: string[] = []): void {
		if (!itemName) return;

		// Write into unified discoveredByCategory
		const byCat = (this.settings.discoveredByCategory = this.settings.discoveredByCategory || {});
		if (!byCat[menuType]) byCat[menuType] = [];
		if (!byCat[menuType].includes(itemName)) {
			byCat[menuType].push(itemName);
			byCat[menuType].sort();
			setTimeout(() => {
				(this.plugin as any).saveSettings?.();
			}, 100);
		}

		// Add to additional menu types if provided
		alsoMenuTypes.forEach(extraType => {
			this.addDiscoveredItem(extraType, itemName);
		});
	}

	/**
	 * Filter suggestions based on hidden items
	 */
	private filterSuggestions(suggestions: any[], menuType: string): any[] {
		const hiddenItems = this.settings.hiddenMenuItems[menuType];
		if (!hiddenItems || Object.keys(hiddenItems).length === 0) {
			return suggestions;
		}
		
		return suggestions.filter((suggestion: any) => {
			let title = '';
			
			// Try to extract title from suggestion
			if (typeof suggestion === 'string') {
				title = suggestion;
			} else if (suggestion.title) {
				title = typeof suggestion.title === 'string' ? suggestion.title : suggestion.title.textContent || '';
			} else if (suggestion.name) {
				title = suggestion.name;
			} else if (suggestion.text) {
				title = suggestion.text;
			} else if (suggestion.label) {
				title = suggestion.label;
			}
			
			if (title) {
				const cleanTitle = title.trim();
				return !hiddenItems[cleanTitle];
			}
			
			return true;
		});
	}

	/**
	 * Capture suggestions from editor suggest or command palette
	 */
	private captureSuggestions(suggestions: any[], menuType: string): void {
		if (!suggestions || suggestions.length === 0) return;
		
		const before = this.getDiscovered(menuType).length;
		suggestions.forEach((suggestion: any) => {
			let title = '';
			
			// Try to extract title from suggestion
			if (typeof suggestion === 'string') {
				title = suggestion;
			} else if (suggestion.title) {
				title = typeof suggestion.title === 'string' ? suggestion.title : suggestion.title.textContent || '';
			} else if (suggestion.name) {
				title = suggestion.name;
			} else if (suggestion.text) {
				title = suggestion.text;
			} else if (suggestion.label) {
				title = suggestion.label;
			}
			
			if (title) {
				const cleanTitle = title.trim();
				if (cleanTitle) {
					this.addDiscoveredItem(menuType, cleanTitle);
				}
			}
		});
		
		if (this.getDiscovered(menuType).length > before) {
			setTimeout(() => {
				(this.plugin as any).saveSettings?.();
			}, 100);
		}
	}

	/**
	 * Observe slash command suggestions in DOM
	 */
	private observeSlashCommands(): void {
		// Observe editor for slash command popup
		this.slashCommandObserver = new MutationObserver((mutations) => {
			const suggestEl = document.querySelector('.suggestion-container, .editor-suggest');
			if (suggestEl) {
				const items = suggestEl.querySelectorAll('.suggestion-item, .suggestion');
				items.forEach((item: Element) => {
					const itemEl = item as HTMLElement;
					const title = itemEl.textContent?.trim() || '';
					
					// Capture for discovery (use helper to keep unified map in sync)
					if (title) {
						this.addDiscoveredItem('slash-commands', title);
					}
					
					// Hide if needed
					const hiddenItems = this.settings.hiddenMenuItems['slash-commands'];
					if (hiddenItems && hiddenItems[title]) {
						itemEl.style.display = 'none';
					}
				});
			}
		});
		
		// Observe document body for suggestion containers
		this.slashCommandObserver.observe(document.body, {
			childList: true,
			subtree: true,
		});
	}

	/**
	 * Observe command palette DOM
	 */
	private observeCommandPalette(): void {
		// Observe command palette modal
		this.commandPaletteObserver = new MutationObserver((mutations) => {
			const paletteEl = document.querySelector('.modal-container .suggestion-container, .command-palette .suggestion, .suggestion-container.mod-instance');
			if (paletteEl) {
				const items = paletteEl.querySelectorAll('.suggestion-item, .suggestion');
				items.forEach((item: Element) => {
					const itemEl = item as HTMLElement;
					const title = itemEl.textContent?.trim() || '';
					
					// Capture for discovery (use helper to keep unified map in sync)
					if (title) {
						this.addDiscoveredItem('command-palette', title);
					}
					
					// Hide if needed
					const hiddenItems = this.settings.hiddenMenuItems['command-palette'];
					if (hiddenItems && hiddenItems[title]) {
						itemEl.style.display = 'none';
					}
				});
			}
		});
		
		// Observe document body for command palette
		this.commandPaletteObserver.observe(document.body, {
			childList: true,
			subtree: true,
		});
	}

	// =================================== registerMenuListeners ===================================

	/**
	 * Register listeners for different menu types
	 */
	private registerMenuListeners(): void {
		// File menu (right-click on file/folder in file explorer)
		this.registerMenuListener('file-menu', (menu: Menu) => {
			this.hideMenuItems(menu, 'file-menu');
		});

		// Editor menu (right-click in editor)
		this.registerMenuListener('editor-menu', (menu: Menu) => {
			this.hideMenuItems(menu, 'editor-menu');
		});
	}

	/**
	 * Register a menu listener for a specific menu type
	 */
	private registerMenuListener(
		menuType: string,
		callback: (menu: Menu) => void
	): void {
		const ref = this.app.workspace.on(menuType as any, (menu: Menu, ...args: any[]) => {
			// Store menu type for this menu
			if (this.menuItemMap.has(menu)) {
				this.menuItemMap.get(menu)!.menuType = menuType;
			} else {
				this.menuItemMap.set(menu, { menuType, items: [] });
			}
			
			// Process captured menu items
			this.processCapturedMenuItems(menu, menuType);
			
			// Also try DOM-based discovery as fallback
			setTimeout(() => {
				this.discoverMenuItems(menu, menuType);
			}, 50);
			
			// Hide items
			callback(menu);
		});
		this.menuEventRefs.push({ type: menuType, ref });
	}

	/**
	 * Process menu items captured via addItem interception
	 */
	private processCapturedMenuItems(menu: Menu, menuType: string): void {
		const menuInfo = this.menuItemMap.get(menu);
		if (!menuInfo || menuInfo.items.length === 0) return;
		
		let hasNewItems = false;
		menuInfo.items.forEach(({ title, item }) => {
			// If title wasn't captured initially, try to get it now
			let finalTitle = title;
			if (!finalTitle && item) {
				const itemAny = item as any;
				if (itemAny.titleEl) {
					finalTitle = itemAny.titleEl.textContent?.trim() || '';
				} else if (itemAny.dom) {
					const titleEl = itemAny.dom.querySelector?.('.menu-item-title');
					finalTitle = titleEl?.textContent?.trim() || itemAny.dom.textContent?.trim() || '';
				} else if (itemAny.title) {
					if (typeof itemAny.title === 'string') {
						finalTitle = itemAny.title;
					} else if (itemAny.title.textContent) {
						finalTitle = itemAny.title.textContent.trim();
					}
				}
			}
			
			if (finalTitle) {
				const cleanTitle = finalTitle.replace(/^[▶▸▹▻►]+\s*/, '').trim();
				if (cleanTitle) {
					const before = this.getDiscovered(menuType).length;
					this.addDiscoveredItem(menuType, cleanTitle);
					if (this.getDiscovered(menuType).length > before) hasNewItems = true;
				}
			}
		});
		
		if (hasNewItems) {
			setTimeout(() => {
				(this.plugin as any).saveSettings?.();
			}, 100);
		}
	}

	/**
	 * Discover and store menu items for UI display
	 * Returns true if new items were discovered
	 */
	private discoverMenuItems(menu: Menu, menuType: string): boolean {
		const discoveredItems: string[] = [];
		const menuAny = menu as any;
		
		// Method 1: Try to access Menu's internal items array
		if (menuAny.items && Array.isArray(menuAny.items)) {
			menuAny.items.forEach((item: any) => {
				if (!item) return;
				// Try multiple ways to get title from MenuItem
				let title = '';
				
				// Try titleEl first
				if (item.titleEl) {
					title = item.titleEl.textContent?.trim() || '';
				}
				
				// Try dom property
				if (!title && item.dom) {
					const titleEl = item.dom.querySelector?.('.menu-item-title');
					if (titleEl) {
						title = titleEl.textContent?.trim() || '';
					} else {
						title = item.dom.textContent?.trim() || '';
					}
				}
				
				// Try title property directly
				if (!title && item.title) {
					if (typeof item.title === 'string') {
						title = item.title;
					} else if (item.title.textContent) {
						title = item.title.textContent.trim();
					}
				}
				
				if (title) {
					const cleanTitle = title.replace(/^[▶▸▹▻►]+\s*/, '').trim();
					if (cleanTitle && !discoveredItems.includes(cleanTitle)) {
						discoveredItems.push(cleanTitle);
					}
				}
			});
		}
		
		// Method 2: Access via DOM (if Method 1 didn't work)
		if (discoveredItems.length === 0) {
			let menuEl: HTMLElement | null = null;
			
			// Try direct access via menuEl property
			if (menuAny.menuEl) {
				menuEl = menuAny.menuEl;
			}
			
			// Try to find menu in DOM by class
			if (!menuEl) {
				const menus = document.querySelectorAll('.menu');
				// Find the most recently shown menu (usually the last one)
				if (menus.length > 0) {
					menuEl = menus[menus.length - 1] as HTMLElement;
				}
			}
			
			// Also try finding by data attribute or other identifiers
			if (!menuEl) {
				menuEl = document.querySelector('.menu:not([style*="display: none"])') as HTMLElement;
			}

			if (menuEl) {
				// Find all menu items
				const menuItemElements = menuEl.querySelectorAll('.menu-item');
				
				menuItemElements.forEach((itemEl) => {
					const menuItem = itemEl as HTMLElement;
					
					// Skip separators
					if (menuItem.classList.contains('menu-separator')) return;
					
					// Try to find title in different ways
					let title = '';
					const titleEl = menuItem.querySelector('.menu-item-title');
					if (titleEl) {
						title = titleEl.textContent?.trim() || '';
					} else {
						// Fallback: get text from the entire menu item
						title = menuItem.textContent?.trim() || '';
					}

					// Remove common prefixes/suffixes that might clutter the UI
					title = title.replace(/^▶\s*/, '').trim();
					
					// Remove icon text if present (like "▶" or other symbols)
					title = title.replace(/^[▶▸▹▻►]+\s*/, '').trim();
					
					if (title && !discoveredItems.includes(title)) {
						discoveredItems.push(title);
					}
				});
			}
		}

		// If still no items found, return false
		if (discoveredItems.length === 0) {
			return false;
		}

		// Update discovered items (merge with unified map)
		const before = this.getDiscovered(menuType).length;
		discoveredItems.forEach(item => {
			if (item) {
				this.addDiscoveredItem(menuType, item);
			}
		});
		const hasNewItems = this.getDiscovered(menuType).length > before;
		
		// Return true if new items were added
		return hasNewItems;
	}

	/**
	 * Hide menu items based on settings
	 */
	private hideMenuItems(menu: Menu, menuType: string): void {
		const hiddenItems = this.settings.hiddenMenuItems[menuType];
		if (!hiddenItems || Object.keys(hiddenItems).length === 0) return;

		// Try multiple ways to access menu DOM
		let menuEl: HTMLElement | null = null;
		
		// Method 1: Direct access via menuEl property
		if ((menu as any).menuEl) {
			menuEl = (menu as any).menuEl;
		}
		
		// Method 2: Find menu in DOM by class
		if (!menuEl) {
			const menus = document.querySelectorAll('.menu');
			// Find the most recently shown menu (usually the last one)
			if (menus.length > 0) {
				menuEl = menus[menus.length - 1] as HTMLElement;
			}
		}

		if (!menuEl) return;

		// Find all menu items
		const menuItems = menuEl.querySelectorAll('.menu-item');
		menuItems.forEach((itemEl) => {
			const menuItem = itemEl as HTMLElement;
			
			// Try to find title in different ways
			let title = '';
			const titleEl = menuItem.querySelector('.menu-item-title');
			if (titleEl) {
				title = titleEl.textContent?.trim() || '';
			} else {
				// Fallback: get text from the entire menu item
				title = menuItem.textContent?.trim() || '';
			}

			// Check if this item should be hidden
			if (title && hiddenItems[title]) {
				menuItem.style.display = 'none';
			}
		});
	}

	// =================================== observeRibbonIcons ===================================

	/**
	 * Observe ribbon icons and hide them based on settings
	 */
	private observeRibbonIcons(): void {
		// Discover ribbon icons immediately
		this.discoverRibbonIcons();
		
		// Also try to discover from all plugins' ribbon icons
		this.discoverRibbonIconsFromPlugins();
		
		// Apply initial visibility
		this.applyRibbonIconVisibility();

		// Observe changes to ribbon (icons might be added dynamically)
		this.ribbonObserver = new MutationObserver(() => {
			const hasNewIcons = this.discoverRibbonIcons();
			// Save settings if new icons were discovered
			if (hasNewIcons) {
				setTimeout(() => {
					(this.plugin as any).saveSettings?.();
				}, 100);
			}
			this.applyRibbonIconVisibility();
		});

		// Observe left ribbon
		const leftRibbon = this.app.workspace.leftRibbon;
		if (leftRibbon && (leftRibbon as any).containerEl) {
			this.ribbonObserver.observe((leftRibbon as any).containerEl, {
				childList: true,
				subtree: true,
			});
		}

		// Observe right ribbon if exists
		const rightRibbon = this.app.workspace.rightRibbon;
		if (rightRibbon && (rightRibbon as any).containerEl) {
			this.ribbonObserver.observe((rightRibbon as any).containerEl, {
				childList: true,
				subtree: true,
			});
		}
		
		// Periodically check for new icons (in case they're added after initial load)
		this.ribbonIntervalId = window.setInterval(() => {
			const hasNewIcons = this.discoverRibbonIcons();
			if (hasNewIcons) {
				setTimeout(() => {
					(this.plugin as any).saveSettings?.();
				}, 100);
			}
			this.applyRibbonIconVisibility();
		}, 2000);
	}

	/**
	 * Discover ribbon icons from all loaded plugins
	 */
	private discoverRibbonIconsFromPlugins(): void {
		const appAny = this.app as any;
		if (!appAny.plugins) return;
		
		// Try to access plugins list
		const plugins = appAny.plugins.plugins || appAny.plugins._plugins || {};
		Object.values(plugins).forEach((plugin: any) => {
			if (!plugin || !plugin.manifest) return;
			
			// Some plugins store ribbon icon info in manifest or settings
			if (plugin.manifest.name) {
				// Try to find ribbon icon for this plugin
				const iconTitle = plugin.manifest.name;
				// No direct add; wait for DOM discovery to populate unified map
			}
		});
	}

	/**
	 * Discover ribbon icons for UI display
	 * Returns true if new icons were discovered
	 */
	private discoverRibbonIcons(): boolean {
		const discoveredIcons: string[] = [];
		
		const processRibbon = (ribbon: any) => {
			if (!ribbon || !ribbon.containerEl) return;
			
			// Try multiple selectors to find all ribbon icons
			const selectors = [
				'.workspace-ribbon-icon',
				'[class*="workspace-ribbon-icon"]',
				'.sidebar-toggle-button',
				'[data-tooltip]',
				'[aria-label]',
			];
			
			for (const selector of selectors) {
				const icons = ribbon.containerEl.querySelectorAll(selector);
				icons.forEach((iconEl: HTMLElement) => {
					// Try multiple ways to get title
					let title = 
						iconEl.getAttribute('aria-label') || 
						iconEl.getAttribute('title') || 
						iconEl.getAttribute('data-tooltip') ||
						iconEl.title || 
						'';
					
					// If no title, try to get from child elements
					if (!title) {
						const tooltipEl = iconEl.querySelector('[data-tooltip]');
						if (tooltipEl) {
							title = tooltipEl.getAttribute('data-tooltip') || '';
						}
					}
					
					// If still no title, try text content
					if (!title) {
						title = iconEl.textContent?.trim() || '';
					}
					
					if (title && !discoveredIcons.includes(title)) {
						discoveredIcons.push(title);
					}
				});
			}
			
			// Also try to access ribbon's internal items if available
			if (ribbon.items && Array.isArray(ribbon.items)) {
				ribbon.items.forEach((item: any) => {
					if (item && item.title) {
						const title = typeof item.title === 'string' ? item.title : item.title.textContent || '';
						if (title && !discoveredIcons.includes(title)) {
							discoveredIcons.push(title);
						}
					}
				});
			}
		};

		processRibbon(this.app.workspace.leftRibbon);
		processRibbon(this.app.workspace.rightRibbon);
		
		// Update unified discoveredByCategory
		const byCat = (this.settings.discoveredByCategory = this.settings.discoveredByCategory || {});
		const bucket = (byCat['ribbon-icons'] = byCat['ribbon-icons'] || []);
		const before = bucket.length;
		discoveredIcons.forEach(icon => {
			if (icon && !bucket.includes(icon)) {
				bucket.push(icon);
			}
		});
		bucket.sort();
		
		// Return true if new icons were added
		return bucket.length > before;
	}

	/**
	 * Apply ribbon icon visibility based on settings
	 */
	private applyRibbonIconVisibility(): void {
		// Hide individual icons - use same logic as discovery
		const processRibbonIcons = (ribbon: any) => {
			if (!ribbon || !ribbon.containerEl) return;
			
			// Try multiple selectors for ribbon icons (same as discovery)
			const selectors = [
				'.workspace-ribbon-icon',
				'[class*="workspace-ribbon-icon"]',
				'.sidebar-toggle-button',
				'[data-tooltip]',
				'[aria-label]',
			];
			
			for (const selector of selectors) {
				const icons = ribbon.containerEl.querySelectorAll(selector);
				icons.forEach((iconEl: HTMLElement) => {
					// Use same logic as discovery to get title
					let title = 
						iconEl.getAttribute('aria-label') || 
						iconEl.getAttribute('title') || 
						iconEl.getAttribute('data-tooltip') ||
						iconEl.title || 
						'';
					
					// If no title, try to get from child elements
					if (!title) {
						const tooltipEl = iconEl.querySelector('[data-tooltip]');
						if (tooltipEl) {
							title = tooltipEl.getAttribute('data-tooltip') || '';
						}
					}
					
					// If still no title, try text content
					if (!title) {
						title = iconEl.textContent?.trim() || '';
					}
					
					// Match against hidden icons
					const hiddenIcons = this.settings.hiddenMenuItems['ribbon-icons'] || {};
					if (title && hiddenIcons[title]) {
						iconEl.style.display = 'none';
					} else if (title) {
						// Show icon if it's not in the hidden list
						iconEl.style.display = '';
					}
				});
			}
		};

		processRibbonIcons(this.app.workspace.leftRibbon);
		processRibbonIcons(this.app.workspace.rightRibbon);
	}

	// =================================== unload ===================================

	/**
	 * Cleanup and unregister all listeners
	 */
	unload(): void {
		this.unregisterMenuListeners();
		if (this.ribbonObserver) {
			this.ribbonObserver.disconnect();
		}
		if (this.slashCommandObserver) {
			this.slashCommandObserver.disconnect();
		}
		if (this.commandPaletteObserver) {
			this.commandPaletteObserver.disconnect();
		}
		if (this.ribbonIntervalId) {
			window.clearInterval(this.ribbonIntervalId);
			this.ribbonIntervalId = undefined;
		}
		
		// Restore original methods
		if (this.originalAddItem) {
			const MenuProto = Menu.prototype as any;
			MenuProto.addItem = this.originalAddItem;
		}
		
		if (this.originalRegisterEditorSuggest) {
			(Plugin.prototype as any).registerEditorSuggest = this.originalRegisterEditorSuggest;
		}
		
		if (this.originalAddCommand) {
			const appAny = this.app as any;
			if (appAny.commands) {
				appAny.commands.addCommand = this.originalAddCommand;
			}
		}
		
		this.menuItemMap.clear();
	}

	/**
	 * Unregister all menu listeners
	 */
	private unregisterMenuListeners(): void {
		this.menuEventRefs.forEach(({ ref }) => {
			this.app.workspace.offref(ref);
		});
		this.menuEventRefs = [];
	}
}

