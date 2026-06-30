// T8 Ambient Ports — runtime composition.
//
// This file is the ONE place that wires app-shell singletons
// (`AppContext`, `sqliteStoreManager`, `ProfileRegistry`, `SearchClient`,
// Obsidian `App`) and the Zustand UI stores into the engine's ports.
// It runs from `main.onload` after sqlite is initialized.
//
// Everything below this line is allowed to reach `AppContext`,
// `sqliteStoreManager`, the LLM provider graph, or the UI stores;
// everything above it (the runtime, the searcher, the contract, the
// detectors) is not.
//
// `composeAmbientRuntime()` returns a ready-to-bind `AmbientRuntime`
// implementation. `main.ts` stores it via
// `AppContext.setAmbientRuntime(...)` on the app-owned
// `AppRuntimeRegistry`. Consumers reach it via
// `AppContext.getAmbientRuntime()` or React `ServiceContext`.

import type { App } from 'obsidian';
import { AppContext } from '@/app/context/AppContext';
import { AmbientPushRuntime } from '@/service/ambient/AmbientPushRuntime';
import type { AmbientRuntime } from '@/service/ambient/AmbientRuntime';
import type {
	AmbientClockPort,
	AmbientPersistencePort,
	AmbientPorts,
	AmbientSettingsPort,
	AmbientUiProjectionPort,
} from '@/core/ports/AmbientPorts';
import type { AmbientPushItem, AmbientPushSettings, BriefingItem } from '@/core/types/ambient';
import { DEFAULT_AMBIENT_PUSH_SETTINGS } from '@/core/types/ambient';
import { SqliteSemanticGraphTraversalAdapter } from '@/app/ambient/SqliteSemanticGraphTraversalAdapter';
import { SqliteAmbientBriefingReadAdapter } from '@/app/ambient/SqliteAmbientBriefingReadAdapter';
import { SerendipitySearcher } from '@/service/ambient/serendipity/SerendipitySearcher';
import { BriefingItemBuilder } from '@/service/ambient/briefing/BriefingItemBuilder';
import { PatternLearningService } from '@/service/ambient/PatternLearningService';
import { markAmbientPushPanelAutoOpened } from '@/service/ambient/ambientPanelStartup';
import { useAmbientPushStore } from '@/ui/store/ambientPushStore';
import { useMorningBriefingStore } from '@/ui/store/morningBriefingStore';
import { ObsidianAmbientEditorContextAdapter } from './ObsidianAmbientEditorContextAdapter';
import { SearchAmbientSearchAdapter } from './SearchAmbientSearchAdapter';
import { SqliteAmbientPersistenceAdapter } from './SqliteAmbientPersistenceAdapter';
import { LlmAmbientExplanationAdapter } from './LlmAmbientExplanationAdapter';

// T8: settings adapter. Wraps AppContext.getSettings() and forwards the
// markAmbientPushPanelAutoOpened write through the plugin's saveSettings.
class ObsidianAmbientSettingsAdapter implements AmbientSettingsPort {
	getSettings(): AmbientPushSettings {
		return AppContext.getSettings().ambientPush ?? DEFAULT_AMBIENT_PUSH_SETTINGS;
	}

	async markPanelAutoOpened(): Promise<void> {
		const plugin = AppContext.getPlugin();
		plugin.settings.ambientPush = markAmbientPushPanelAutoOpened(plugin.settings.ambientPush);
		await plugin.saveSettings();
	}
}

// T8: UI projection adapter. Wraps the two Ambient Zustand stores so the
// runtime never imports @/ui/*. Every method maps one-to-one to a store action.
class AmbientUiProjectionAdapter implements AmbientUiProjectionPort {
	getPushHistory(): ReadonlyMap<string, number> {
		return useAmbientPushStore.getState().pushHistory;
	}

	setItems(items: AmbientPushItem[], sourceFilePath: string): void {
		useAmbientPushStore.getState().setItems(items, sourceFilePath);
	}

	clearItems(): void {
		useAmbientPushStore.getState().clearItems();
	}

	recordPush(filePath: string, timestamp: number): void {
		useAmbientPushStore.getState().recordPush(filePath, timestamp);
	}

	updateLlmExplanation(filePath: string, explanation: string): void {
		useAmbientPushStore.getState().updateLlmExplanation(filePath, explanation);
	}

	showMorningBriefing(items: BriefingItem[]): void {
		const store = useMorningBriefingStore.getState();
		store.setItems(items);
		store.show();
	}
}

// T8: monotonic clock adapter. Tests inject a fake clock to make
// debounce / cooldown / briefing-gap assertions deterministic.
class DefaultAmbientClock implements AmbientClockPort {
	now(): number {
		return Date.now();
	}
}

export function composeAmbientRuntime(app: App): AmbientRuntime {
	const settings = new ObsidianAmbientSettingsAdapter();
	const editorContext = new ObsidianAmbientEditorContextAdapter(app, settings);
	const sqlitePersistence = new SqliteAmbientPersistenceAdapter();
	// Pattern cache duration, lookback window, min-occurrences, and
	// strength formula now live in the service layer; the adapter is
	// pure SQL.
	const patternLearner = new PatternLearningService(sqlitePersistence);
	const persistence: AmbientPersistencePort = {
		logPushes: (ctx, items, trigger) => sqlitePersistence.logPushes(ctx, items, trigger),
		recordAction: (src, pushed, action) => sqlitePersistence.recordAction(src, pushed, action),
		getLearnedPatterns: () => patternLearner.getLearnedPatterns(),
		invalidatePatternCache: () => patternLearner.invalidateCache(),
	};
	const graphTraversal = new SqliteSemanticGraphTraversalAdapter();
	const serendipity = new SerendipitySearcher(graphTraversal);
	const search = new SearchAmbientSearchAdapter(persistence, serendipity);
	const projection = new AmbientUiProjectionAdapter();
	const briefingRead = new SqliteAmbientBriefingReadAdapter();
	const briefing = new BriefingItemBuilder(briefingRead);
	const explanation = new LlmAmbientExplanationAdapter();
	const clock = new DefaultAmbientClock();

	const ports: AmbientPorts = {
		settings,
		editorContext,
		search,
		projection,
		persistence,
		briefing,
		explanation,
		clock,
	};

	return new AmbientPushRuntime(ports);
}
