// T8 Ambient ports — narrow, capability-shaped dependency contracts.
//
// Before T8 the Ambient Push pipeline reached into `AppContext`,
// `sqliteStoreManager`, the Zustand UI stores, and the LLM provider
// graph from inside service-layer code. T8 hides each of those behind
// a port named in the AMBIENT vocabulary (not in Obsidian's or
// sqlite's), and forces the single runtime composition site
// (`src/app/ambient/composeAmbientRuntime`) to be the only place that
// wires app singletons into adapters.
//
// Discipline (mirrors T6/T7 Vault Lint):
//   - Ports must not pass `AppContext` itself. Each port describes the
//     ONE capability the runtime actually needs.
//   - This file may import only types from `../types` and from
//     `@/core/search/searchTypes`. No runtime singleton, no app-shell
//     import, no UI import. `test/ambient-source-guard.test.ts`
//     enforces this by source scan.
//   - Adapter implementations live in `src/app/ambient/*`.

import type { SearchQuery, SearchResponse } from '@/core/search/searchTypes';
import type {
	AmbientContext,
	AmbientPushItem,
	AmbientPushSettings,
	BriefingItem,
	TriggerType,
	UserAction,
} from '@/core/types/ambient';
import type { LearnedPattern } from '@/service/ambient/PatternLearner';

/**
 * Reads the current `ambientPush` settings slice. Implementations
 * typically wrap `AppContext.getSettings().ambientPush`; the runtime
 * receives a function (not a snapshot) so settings changes during
 * editor activity are picked up without re-binding.
 */
export interface AmbientSettingsPort {
	getSettings(): AmbientPushSettings;
}

export type AmbientTriggerCallback = (
	filePath: string,
	triggerType: TriggerType,
) => void;

/**
 * Wraps the Obsidian editor surface the runtime needs: workspace event
 * subscriptions for writing-pause / doc-switch triggers, and the
 * ability to project the active editor into an `AmbientContext`.
 */
export interface AmbientEditorContextPort {
	start(onTrigger: AmbientTriggerCallback): void;
	triggerManual(): void;
	/**
	 * Extract a current paragraph + surrounding context for the given
	 * file path (or the active markdown view when none is provided).
	 * Returns `null` when no markdown editor is active.
	 */
	extractContext(filePath?: string): AmbientContext | null;
	dispose(): void;
}

/**
 * The whole search pipeline (vault search + serendipity injection +
 * pattern boost) is hidden behind one port. The adapter wires
 * `searchClient.search`, `MobiusNodeRepo` / `MobiusEdgeRepo` /
 * `EmbeddingRepo` (for serendipity), and `AmbientPersistencePort` (for
 * pattern boosts) into the pure orchestrator.
 */
export interface AmbientSearchPort {
	search(
		context: AmbientContext,
		maxItems: number,
		pushHistory: ReadonlyMap<string, number>,
		settings: AmbientPushSettings,
	): Promise<AmbientPushItem[]>;
}

/**
 * Underlying search primitives the pure `ambientSearch` orchestrator
 * depends on. Adapters supply this object to the orchestrator; the
 * orchestrator never reaches sqlite or `AppContext` itself.
 */
export interface AmbientSearchDeps {
	searchVault(query: SearchQuery): Promise<SearchResponse>;
	getLearnedPatterns(): Promise<LearnedPattern[]>;
	searchSerendipity(
		context: AmbientContext,
		existingOutlinksLower: ReadonlySet<string>,
		maxResults: number,
	): Promise<AmbientPushItem[]>;
}

/**
 * Write-side surface for the Zustand UI stores. The runtime treats the
 * stores as projections; the adapter is the only place that imports
 * `useAmbientPushStore` / `useMorningBriefingStore`.
 */
export interface AmbientUiProjectionPort {
	getPushHistory(): ReadonlyMap<string, number>;
	setItems(items: AmbientPushItem[], sourceFilePath: string): void;
	clearItems(): void;
	recordPush(filePath: string, timestamp: number): void;
	updateLlmExplanation(filePath: string, explanation: string): void;
	showMorningBriefing(items: BriefingItem[]): void;
}

/**
 * Persistence for push logging, action recording, and pattern
 * learning. The adapter owns `sqliteStoreManager.getAmbientPushRepo()`;
 * the runtime never sees it.
 */
export interface AmbientPersistencePort {
	logPushes(
		context: AmbientContext,
		items: AmbientPushItem[],
		triggerType: TriggerType,
	): Promise<void>;
	recordAction(
		sourceFilePath: string,
		pushedFilePath: string,
		action: UserAction,
	): Promise<void>;
	getLearnedPatterns(): Promise<LearnedPattern[]>;
	/** Drop the in-adapter pattern cache (after a logPushes batch). */
	invalidatePatternCache(): void;
}

/**
 * Morning Briefing data access. The runtime only knows about briefing
 * timestamps and an item list; the adapter wraps `IndexStateRepo` and
 * the three briefing query helpers.
 */
export interface AmbientBriefingPort {
	isReady(): boolean;
	/** Returns 0 when no previous briefing has been recorded. */
	getLastBriefingTimestamp(): Promise<number>;
	/** Returns the fallback (e.g. `now - 24h`) when no record exists. */
	getLastSessionTimestamp(fallback: number): Promise<number>;
	recordSessionTimestamps(now: number): Promise<void>;
	loadBriefingItems(lastSessionTs: number): Promise<BriefingItem[]>;
}

/**
 * Optional LLM tier-2 explanation. Returns `null` when rate-limited,
 * profile missing, or model errored. The adapter wraps
 * Harness model execution + `ProfileRegistry`.
 */
export interface AmbientExplanationPort {
	generateLlmExplanation(
		contextParagraph: string,
		pushNoteTitle: string,
		pushNoteExcerpt: string,
		cooldownMs: number,
	): Promise<string | null>;
}

/** Monotonic clock — tests inject a fake. */
export interface AmbientClockPort {
	now(): number;
}

/**
 * Aggregate handed to `new AmbientPushRuntime(ports)`. Keeping it as a
 * single bag makes constructor signature changes localized to the
 * runtime + composition.
 */
export interface AmbientPorts {
	readonly settings: AmbientSettingsPort;
	readonly editorContext: AmbientEditorContextPort;
	readonly search: AmbientSearchPort;
	readonly projection: AmbientUiProjectionPort;
	readonly persistence: AmbientPersistencePort;
	readonly briefing: AmbientBriefingPort;
	readonly explanation: AmbientExplanationPort;
	readonly clock: AmbientClockPort;
}
