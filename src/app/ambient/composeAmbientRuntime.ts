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
import type { AmbientPorts } from '@/service/ambient/ports/AmbientPorts';
import { ObsidianAmbientSettingsAdapter } from './ObsidianAmbientSettingsAdapter';
import { ObsidianAmbientEditorContextAdapter } from './ObsidianAmbientEditorContextAdapter';
import { SearchAmbientSearchAdapter } from './SearchAmbientSearchAdapter';
import { AmbientUiProjectionAdapter } from './AmbientUiProjectionAdapter';
import { SqliteAmbientPersistenceAdapter } from './SqliteAmbientPersistenceAdapter';
import { SqliteAmbientBriefingAdapter } from './SqliteAmbientBriefingAdapter';
import { LlmAmbientExplanationAdapter } from './LlmAmbientExplanationAdapter';
import { DefaultAmbientClock } from './DefaultAmbientClock';

export function composeAmbientRuntime(app: App): AmbientRuntime {
	const settings = new ObsidianAmbientSettingsAdapter();
	const editorContext = new ObsidianAmbientEditorContextAdapter(app, settings);
	const persistence = new SqliteAmbientPersistenceAdapter();
	const search = new SearchAmbientSearchAdapter(persistence);
	const projection = new AmbientUiProjectionAdapter();
	const briefing = new SqliteAmbientBriefingAdapter();
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
