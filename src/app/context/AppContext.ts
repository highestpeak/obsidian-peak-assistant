import { App } from 'obsidian';
import { AIServiceManager } from '@/service/chat/service-manager';
import { SearchClient } from '@/service/search/SearchClient';
import { ViewManager } from '@/app/view/ViewManager';
import type MyPlugin from 'main';
import { MyPluginSettings } from '../settings/types';
import { BusinessError, ErrorCode } from '@/core/errors';
import { EventBus, ViewEventType } from '@/core/eventBus';
import { GraphInspectorTestTools } from '@/app/context/test-tools';
import { cleanupGraphTable } from '@/app/context/graph-cleanup';
import { IndexService } from '@/service/search/index/indexService';
import { AIAnalysisHistoryService } from '@/service/AIAnalysisHistoryService';
import { AISearchAgent, AISearchAgentOptions } from '@/service/agents/AISearchAgent';

/**
 * Application context containing all global dependencies.
 * Created once at plugin initialization and passed to all views and components.
 */
export class AppContext {
	public viewManager: ViewManager;

	private static instance: AppContext | null = null;

	/** Unsubscribe from EventBus so workspace ref is released on unload. */
	private unsubscribeSettingsUpdated?: () => void;

	public static getInstance(): AppContext {
		if (!AppContext.instance) {
			throw new BusinessError(
				ErrorCode.CONFIGURATION_MISSING,
				'AppContext is not initialized'
			);
		}
		return AppContext.instance;
	}

	/**
	 * Clear singleton and unsubscribe from workspace events.
	 * Must be called from plugin onunload to break reference chains and allow GC.
	 */
	public static clearForUnload(): void {
		if (AppContext.instance) {
			AppContext.instance.unsubscribeSettingsUpdated?.();
			// Explicitly clean up window globals to break closure-based memory leaks
			AppContext.instance.handleDevToolsSettingChange(false);
			AppContext.instance = null;
		}
	}

	constructor(
		public readonly app: App,
		public readonly manager: AIServiceManager,
		public readonly searchClient: SearchClient,
		public readonly plugin: MyPlugin,
		public settings: MyPluginSettings,
		public readonly aiAnalysisHistoryService: AIAnalysisHistoryService,
		public readonly searchAgentFactory: (aiServiceManager: AIServiceManager, options: AISearchAgentOptions) => AISearchAgent,
		/** When true, running in mock/dev environment (e.g. desktop dev). */
		public readonly isMockEnv: boolean = false,
	) {
		// viewManager will be set after ViewManager is created
		this.viewManager = null as any;
		AppContext.instance = this;

		this.handleDevToolsSettingChange(this.settings.enableDevTools ?? false);

		this.unsubscribeSettingsUpdated = EventBus.getInstance(app).on(ViewEventType.SETTINGS_UPDATED, (event) => {
			const previousEnableDevTools = this.settings.enableDevTools ?? false;
			this.settings = this.plugin!.settings!;

			// Handle dynamic enableDevTools setting changes
			const currentEnableDevTools = this.settings.enableDevTools ?? false;
			if (previousEnableDevTools !== currentEnableDevTools) {
				this.handleDevToolsSettingChange(currentEnableDevTools);
			}
		});
	}

	public static searchAgent(options: AISearchAgentOptions) {
		return AppContext.getInstance().searchAgentFactory(AppContext.getInstance().manager, options);
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
				(window as any).cleanupGraphTable = () => cleanupGraphTable();

				console.debug('🔧 Graph Inspector Test Tools initialized!');
				console.debug('📖 Usage: window.testGraphTools.inspectNote("path/to/note.md")');
				console.debug('📖 Usage: window.indexDocument("path/to/note.md")');
				console.debug('📖 Usage: await window.cleanupGraphTable() — clean graph_nodes/edges (nodes whose path not in doc_meta, orphan edges)');
				console.debug('📖 Available methods:', [
					...Object.getOwnPropertyNames(GraphInspectorTestTools.prototype).filter(name => name !== 'constructor'),
					'indexDocument',
					'cleanupGraphTable',
				]);
			}
		} else {
			if (typeof window !== 'undefined') {
				if ((window as any).testGraphTools) delete (window as any).testGraphTools;
				if ((window as any).indexDocument) delete (window as any).indexDocument;
				if ((window as any).cleanupGraphTable) delete (window as any).cleanupGraphTable;
				console.log('🔧 Graph Inspector Test Tools disabled');
			}
		}
	}
}

