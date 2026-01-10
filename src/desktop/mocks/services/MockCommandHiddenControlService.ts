import { CommandHiddenControlService } from '@/service/CommandHiddenControlService';
import { CommandHiddenSettings } from '@/service/CommandHiddenControlService';

/**
 * Mock CommandHiddenControlService for desktop development
 */
export class MockCommandHiddenControlService implements CommandHiddenControlService {
	private settings: CommandHiddenSettings;

	constructor(settings: CommandHiddenSettings) {
		this.settings = settings;
	}

	/**
	 * Initialize the service (mock implementation)
	 */
	init(): void {
		// Mock implementation - no-op
		console.log('MockCommandHiddenControlService: init');
	}

	/**
	 * Update settings (mock implementation)
	 */
	updateSettings(settings: CommandHiddenSettings): void {
		this.settings = settings;
		console.log('MockCommandHiddenControlService: updateSettings', settings);
	}

	/**
	 * Get discovered items by category id (mock implementation)
	 * Returns mock data for different menu types
	 */
	getDiscovered(categoryId: string): string[] {
		console.log('MockCommandHiddenControlService: getDiscovered', categoryId);

		// Mock discovered items for different categories
		const mockData: Record<string, string[]> = {
			'slash-commands': [
				'bold',
				'italic',
				'strikethrough',
				'code',
				'codeblock',
				'link',
				'math',
				'table',
				'task',
				'list',
				'heading1',
				'heading2',
				'heading3',
				'blockquote',
				'highlight',
				'internal-link',
				'embed',
				'footnote',
				'tag',
				'date',
				'time'
			],
			'command-palette': [
				'app:open-vault',
				'app:reload',
				'app:show-releases-notes',
				'app:open-settings',
				'app:toggle-left-sidebar',
				'app:toggle-right-sidebar',
				'app:go-back',
				'app:go-forward',
				'app:open-help',
				'app:create-new-vault',
				'app:manage-vaults',
				'app:open-vault-in-new-window',
				'workspace:close',
				'workspace:close-window',
				'workspace:new-tab',
				'workspace:split-vertical',
				'workspace:split-horizontal',
				'workspace:toggle-stacked-tabs',
				'workspace:next-tab',
				'workspace:previous-tab',
				'workspace:close-tab',
				'workspace:close-all-tabs',
				'file-explorer:reveal-active-file',
				'file-explorer:create-new-file',
				'file-explorer:create-new-folder',
				'file-explorer:move-file',
				'file-explorer:duplicate-file',
				'file-explorer:delete',
				'file-explorer:rename-file',
				'markdown:add-internal-link',
				'markdown:toggle-preview',
				'markdown:toggle-source',
				'markdown:insert-wikilink',
				'markdown:insert-embed',
				'markdown:insert-template',
				'markdown:insert-callout',
				'markdown:insert-codeblock',
				'markdown:insert-table',
				'markdown:insert-math',
				'markdown:insert-footnote',
				'markdown:insert-tag',
				'markdown:insert-date',
				'markdown:insert-time',
				'editor:focus',
				'editor:toggle-fold',
				'editor:fold-all',
				'editor:unfold-all',
				'editor:insert-template',
				'editor:insert-callout',
				'editor:insert-codeblock',
				'editor:insert-table',
				'editor:insert-math',
				'editor:insert-footnote',
				'editor:insert-tag',
				'editor:insert-date',
				'editor:insert-time'
			],
			'ribbon-icons': [
				'File Explorer',
				'Search',
				'Quick Switcher',
				'Graph View',
				'Outline',
				'Backlinks',
				'Tag Pane',
				'Command Palette',
				'Open in default app',
				'Toggle left sidebar',
				'Toggle right sidebar',
				'Create new file',
				'Create new folder',
				'Delete',
				'Settings'
			]
		};

		return mockData[categoryId] || [];
	}

	/**
	 * Cleanup (mock implementation)
	 */
	unload(): void {
		console.log('MockCommandHiddenControlService: unload');
	}
}