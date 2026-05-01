import type { App } from 'obsidian';
import type { AmbientPushSettings, TriggerType, AmbientContext, AmbientPushItem } from './types';
import { DEFAULT_AMBIENT_PUSH_SETTINGS } from './types';
import { AmbientTrigger } from './AmbientTrigger';
import { extractContext } from './ContextExtractor';
import { ambientSearch } from './AmbientSearcher';
import { useAmbientPushStore } from '@/ui/store/ambientPushStore';
import { AppContext } from '@/app/context/AppContext';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';

/**
 * Singleton orchestrator that wires the ambient push pipeline:
 * trigger → context → search → explain → store → SQLite log.
 */
export class AmbientPushService {
	private static instance: AmbientPushService | null = null;

	private trigger: AmbientTrigger | null = null;
	private pendingSearch: AbortController | null = null;
	private app: App | null = null;

	static getInstance(): AmbientPushService {
		if (!AmbientPushService.instance) {
			AmbientPushService.instance = new AmbientPushService();
		}
		return AmbientPushService.instance;
	}

	/**
	 * Start listening for ambient triggers.
	 */
	start(app: App): void {
		this.app = app;
		this.trigger = new AmbientTrigger(
			app,
			() => this.getSettings(),
			(filePath, reason) => this.handleTrigger(filePath, reason),
		);
		this.trigger.start();
	}

	/**
	 * Force-trigger an ambient search for the current active file.
	 */
	triggerManual(): void {
		this.trigger?.triggerManual();
	}

	/**
	 * Clean up all resources.
	 */
	dispose(): void {
		this.trigger?.dispose();
		this.trigger = null;
		this.pendingSearch?.abort();
		this.pendingSearch = null;
		this.app = null;
		AmbientPushService.instance = null;
	}

	private getSettings(): AmbientPushSettings {
		return AppContext.getSettings().ambientPush ?? DEFAULT_AMBIENT_PUSH_SETTINGS;
	}

	private async handleTrigger(filePath: string, triggerType: TriggerType): Promise<void> {
		// Abort any in-flight search
		this.pendingSearch?.abort();
		const abortController = new AbortController();
		this.pendingSearch = abortController;

		const app = this.app;
		if (!app || !this.trigger) return;

		// Extract context from the active editor
		const context = extractContext(app, this.trigger.getFileOpenedAt());
		if (!context) return;

		// Skip if paragraph is too short
		if (context.currentParagraph.trim().length < 10) return;

		const settings = this.getSettings();
		const store = useAmbientPushStore.getState();

		let items: AmbientPushItem[];
		try {
			items = await ambientSearch(context, settings.maxPushItems, store.pushHistory);
		} catch {
			return;
		}

		// If aborted during search, discard results
		if (abortController.signal.aborted) return;

		if (items.length === 0) {
			store.clearItems();
			return;
		}

		store.setItems(items);

		const now = Date.now();
		for (const item of items) {
			store.recordPush(item.filePath, now);
		}

		// Fire-and-forget: log pushes to SQLite
		this.logPushes(context, items, triggerType);
	}

	private async logPushes(
		context: AmbientContext,
		items: AmbientPushItem[],
		triggerType: TriggerType,
	): Promise<void> {
		try {
			const repo = sqliteStoreManager.getAmbientPushRepo();
			for (const item of items) {
				await repo.logPush({
					timestamp: item.timestamp,
					triggerType,
					sourceFilePath: context.filePath,
					contextParagraph: context.currentParagraph || null,
					pushedFilePath: item.filePath,
					pushedScore: item.score,
					explanationType: item.explanationType,
					explanationText: item.explanation,
				});
			}
		} catch {
			/* SQLite may not be ready — fail silently */
		}
	}
}
