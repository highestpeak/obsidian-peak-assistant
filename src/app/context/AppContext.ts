import { App } from 'obsidian';
import { AIServiceManager } from '@/service/chat/service-manager';
import { SearchClient } from '@/service/search/SearchClient';
import { ViewManager } from '@/app/view/ViewManager';
import type MyPlugin from 'main';
import { MyPluginSettings } from '../settings/types';
import { BusinessError, ErrorCode } from '@/core/errors';
import { EventBus, ViewEventType } from '@/core/eventBus';

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

		EventBus.getInstance(app).on(ViewEventType.SETTINGS_UPDATED, (event) => {
			this.settings = this.plugin!.settings!;
		});
	}
}

