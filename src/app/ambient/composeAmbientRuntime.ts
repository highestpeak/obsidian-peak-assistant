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
import { AmbientPushRuntime } from '@/service/ambient/AmbientPushRuntime';
import type { AmbientRuntime } from '@/service/ambient/AmbientRuntime';
import type {
	AmbientPersistencePort,
	AmbientPorts,
} from '@/service/ambient/ports/AmbientPorts';
import { SqliteSemanticGraphTraversalAdapter } from '@/app/adapters/search/SqliteSemanticGraphTraversalAdapter';
import { SqliteAmbientBriefingReadAdapter } from '@/app/adapters/ambient/SqliteAmbientBriefingReadAdapter';
import { SerendipitySearcher } from '@/service/ambient/serendipity/SerendipitySearcher';
import { BriefingItemBuilder } from '@/service/ambient/briefing/BriefingItemBuilder';
import { PatternLearningService } from '@/service/ambient/PatternLearningService';
import { ObsidianAmbientSettingsAdapter } from './ObsidianAmbientSettingsAdapter';
import { ObsidianAmbientEditorContextAdapter } from './ObsidianAmbientEditorContextAdapter';
import { SearchAmbientSearchAdapter } from './SearchAmbientSearchAdapter';
import { AmbientUiProjectionAdapter } from './AmbientUiProjectionAdapter';
import { SqliteAmbientPersistenceAdapter } from './SqliteAmbientPersistenceAdapter';
import { LlmAmbientExplanationAdapter } from './LlmAmbientExplanationAdapter';
import { DefaultAmbientClock } from './DefaultAmbientClock';

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
