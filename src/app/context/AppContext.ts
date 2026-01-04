import { App } from 'obsidian';
import { AIServiceManager } from '@/service/chat/service-manager';
import { SearchClient } from '@/service/search/SearchClient';
import { ViewManager } from '@/app/view/ViewManager';

/**
 * Application context containing all global dependencies.
 * Created once at plugin initialization and passed to all views and components.
 */
export class AppContext {
	public viewManager: ViewManager;

	constructor(
		public readonly app: App,
		public readonly manager: AIServiceManager,
		public readonly searchClient: SearchClient | null = null,
	) {
		// viewManager will be set after ViewManager is created
		this.viewManager = null as any;
	}
}

