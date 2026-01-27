import { App } from 'obsidian';
import { AIServiceManager } from '@/service/chat/service-manager';
import { SearchClient } from '@/service/search/SearchClient';
import { ViewManager } from '@/app/view/ViewManager';
import type MyPlugin from 'main';
import { MyPluginSettings } from '../settings/types';
import { BusinessError, ErrorCode } from '@/core/errors';
import { EventBus, ViewEventType } from '@/core/eventBus';
import { GraphInspectorTestTools } from '@/app/context/test-tools';
import { IndexService } from '@/service/search/index/indexService';

/**
 * Application context containing all global dependencies.
 * Created once at plugin initialization and passed to all views and components.
 */
export class AppContext {
	public viewManager: ViewManager;

	private static instance: AppContext | null = null;

	public static getInstance(): AppContext {
		if (!AppContext.instance) {
			throw new BusinessError(
				ErrorCode.CONFIGURATION_MISSING,
				'AppContext is not initialized'
			);
		}
		return AppContext.instance;
	}

	constructor(
		public readonly app: App,
		public readonly manager: AIServiceManager,
		public readonly searchClient: SearchClient,
		public readonly plugin: MyPlugin,
		public settings: MyPluginSettings,
	) {
		// viewManager will be set after ViewManager is created
		this.viewManager = null as any;
		AppContext.instance = this;

		this.handleDevToolsSettingChange(this.settings.enableDevTools ?? false);

		EventBus.getInstance(app).on(ViewEventType.SETTINGS_UPDATED, (event) => {
			const previousEnableDevTools = this.settings.enableDevTools ?? false;
			this.settings = this.plugin!.settings!;

			// Handle dynamic enableDevTools setting changes
			const currentEnableDevTools = this.settings.enableDevTools ?? false;
			if (previousEnableDevTools !== currentEnableDevTools) {
				this.handleDevToolsSettingChange(currentEnableDevTools);
			}
		});
	}

	/**
	 * Handle dynamic changes to enableDevTools setting
	 */
	private handleDevToolsSettingChange(enabled: boolean) {
		if (enabled) {
			// Dynamically initialize test tools when setting is enabled
			if (typeof window !== 'undefined') {
				(window as any).testGraphTools = new GraphInspectorTestTools();
				(window as any).indexDocument = (docPath: string) => IndexService.getInstance().indexDocument(docPath, this.settings.search);

				console.debug('🔧 Graph Inspector Test Tools initialized!');
				console.debug('📖 Usage: window.testGraphTools.inspectNote("path/to/note.md")');
				console.debug('📖 Usage: window.indexService.indexDocument("path/to/note.md")');
				console.debug('📖 Available methods:', [
					...Object.getOwnPropertyNames(GraphInspectorTestTools.prototype).filter(name => name !== 'constructor'),
					'indexDocument'
				]);
			}
		} else {
			// Remove test tools when setting is disabled
			if (typeof window !== 'undefined' && (window as any).testGraphTools) {
				delete (window as any).testGraphTools;
				console.log('🔧 Graph Inspector Test Tools disabled');
			}
		}
	}
}

