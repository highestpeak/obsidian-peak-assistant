// T8: Ambient runtime — service-layer class.
//
// This class is the single owner of trigger orchestration. It does NOT
// touch Obsidian, sqlite, the Zustand UI stores, the LLM provider
// graph, or `AppContext`; every dependency flows through `AmbientPorts`.
// The runtime composition (`src/app/ambient/composeAmbientRuntime.ts`)
// builds the adapters and binds the instance into `AppRuntimeRegistry`.
//
// Behavior is intentionally byte-identical to the pre-T8
// `AmbientPushService` + `MorningBriefingService` flow:
//   - extract context → settings gate → search → projection;
//   - tier-2 LLM micro-explanation fires async + non-blocking;
//   - pushHistory records every projected item;
//   - push log is fire-and-forget against the persistence port;
//   - briefing checks the 4h gap, sorts by score desc, projects items.

import type { AmbientPushSettings, AmbientPushItem, TriggerType, UserAction } from '@/core/types/ambient';
import { DEFAULT_AMBIENT_PUSH_SETTINGS } from '@/core/types/ambient';
import type { AmbientPorts } from '@/core/ports/AmbientPorts';
import type { AmbientRuntime } from './AmbientRuntime';
import { ambientSearch } from './AmbientSearcher';
import type { DebugTracePort } from '@/core/debug-trace';
import {
	recordAmbientTrigger,
	recordAmbientCandidates,
	recordAmbientDedupContext,
	recordAmbientSerendipity,
	finalizeAmbientRun,
} from './debugTraceAdapter';

/** Minimum gap between briefings to avoid showing on quick restarts. */
const BRIEFING_MIN_SESSION_GAP_MS = 4 * 60 * 60 * 1000; // 4 hours
const BRIEFING_DEFAULT_LAST_SESSION_FALLBACK_MS = 24 * 60 * 60 * 1000; // 24 hours

export class AmbientPushRuntime implements AmbientRuntime {
	private pendingSearch: AbortController | null = null;
	private started = false;

	constructor(
		private readonly ports: AmbientPorts,
		private readonly debugTrace: DebugTracePort | null = null,
	) {}

	start(): void {
		if (this.started) return;
		this.started = true;
		this.ports.editorContext.start((filePath, triggerType) => {
			void this.handleTrigger(filePath, triggerType);
		});
	}

	triggerManual(): void {
		this.ports.editorContext.triggerManual();
	}

	dispose(): void {
		this.ports.editorContext.dispose();
		this.pendingSearch?.abort();
		this.pendingSearch = null;
		this.started = false;
	}

	async recordAction(
		sourceFilePath: string,
		pushedFilePath: string,
		action: UserAction,
	): Promise<void> {
		try {
			await this.ports.persistence.recordAction(sourceFilePath, pushedFilePath, action);
		} catch {
			// SQLite may not be ready or repo not initialized — fail silently
			// (mirrors pre-T8 behavior in `useAmbientPushStore.recordAction`).
		}
	}

	async tryShowMorningBriefing(): Promise<boolean> {
		try {
			const settings = this.getSettings();
			if (!settings.enabled || !settings.enableMorningBriefing) return false;
			if (!this.ports.briefing.isReady()) return false;

			const now = this.ports.clock.now();
			const lastBriefingTs = await this.ports.briefing.getLastBriefingTimestamp();
			if (now - lastBriefingTs < BRIEFING_MIN_SESSION_GAP_MS) {
				return false; // Too soon since last briefing
			}

			const lastSessionTs = await this.ports.briefing.getLastSessionTimestamp(
				now - BRIEFING_DEFAULT_LAST_SESSION_FALLBACK_MS,
			);
			const items = await this.ports.briefing.loadBriefingItems(lastSessionTs);

			// Record timestamps regardless of whether there are items
			await this.ports.briefing.recordSessionTimestamps(now);

			if (items.length === 0) return false;

			// Sort by score descending
			items.sort((a, b) => b.score - a.score);

			this.ports.projection.showMorningBriefing(items);
			return true;
		} catch (err) {
			console.debug('[AmbientPushRuntime] Morning Briefing failed (non-critical):', err);
			return false;
		}
	}

	private getSettings(): AmbientPushSettings {
		return this.ports.settings.getSettings() ?? DEFAULT_AMBIENT_PUSH_SETTINGS;
	}

	private async handleTrigger(filePath: string, triggerType: TriggerType): Promise<void> {
		// Abort any in-flight search
		this.pendingSearch?.abort();
		const abortController = new AbortController();
		this.pendingSearch = abortController;

		const context = this.ports.editorContext.extractContext(filePath);
		if (!context) return;

		// Debug: open one run per trigger. Closed on every return branch below
		// so we always have a receipt, even for skip / empty / error paths.
		const debugRun = this.debugTrace?.isEnabled()
			? this.debugTrace.startRun({ surface: 'ambient', capabilityId: 'ambient.push' })
			: null;
		if (debugRun) {
			recordAmbientTrigger(debugRun, {
				filePath: context.filePath,
				triggerType,
				paragraph: context.currentParagraph,
			});
		}

		// Skip if paragraph is too short
		if (context.currentParagraph.trim().length < 10) {
			if (debugRun) {
				finalizeAmbientRun(debugRun, { skipReason: 'paragraph-too-short' });
				debugRun.finish('completed');
			}
			return;
		}

		const settings = this.getSettings();
		const pushHistory = this.ports.projection.getPushHistory();

		if (debugRun) {
			recordAmbientDedupContext(debugRun, {
				pushHistoryPaths: [...pushHistory.keys()],
			});
		}

		let items: AmbientPushItem[];
		try {
			items = await this.ports.search.search(
				context,
				settings.maxPushItems,
				pushHistory,
				settings,
			);
		} catch (err) {
			if (debugRun) {
				finalizeAmbientRun(debugRun, { skipReason: `search-error: ${String(err)}` });
				debugRun.finish('failed');
			}
			return;
		}

		// If aborted during search, discard results
		if (abortController.signal.aborted) {
			if (debugRun) {
				finalizeAmbientRun(debugRun, { skipReason: 'aborted' });
				debugRun.finish('cancelled');
			}
			return;
		}

		if (debugRun) {
			recordAmbientCandidates(
				debugRun,
				items.map((i) => ({
					filePath: i.filePath,
					title: i.title,
					score: i.score ?? 0,
					source: i.signals?.[0]?.type,
				})),
			);
			// Surface serendipity picks as their own span so a reader can see
			// which items came from the 2-hop bridge path vs. direct-neighbor
			// or semantic recall.
			recordAmbientSerendipity(debugRun, items);
		}

		if (items.length === 0) {
			this.ports.projection.clearItems();
			if (debugRun) {
				finalizeAmbientRun(debugRun, { skipReason: 'no-items' });
				debugRun.finish('completed');
			}
			return;
		}

		this.ports.projection.setItems(items, context.filePath);

		if (debugRun) {
			finalizeAmbientRun(debugRun, { chosen: items.map((i) => i.filePath) });
			debugRun.finish('completed');
		}

		// --- LLM Tier 2 micro-explanation (async, non-blocking) ---
		if (settings.enableLlmExplanation && items.length > 0) {
			const topItem = items[0];
			this.ports.explanation
				.generateLlmExplanation(
					context.currentParagraph,
					topItem.title,
					topItem.excerpt,
					settings.llmExplanationCooldownMs,
				)
				.then((llmExplanation) => {
					if (llmExplanation) {
						this.ports.projection.updateLlmExplanation(topItem.filePath, llmExplanation);
					}
				})
				.catch(() => {
					/* LLM explanation is non-critical — fail silently */
				});
		}

		const now = this.ports.clock.now();
		for (const item of items) {
			this.ports.projection.recordPush(item.filePath, now);
		}

		// Fire-and-forget: log pushes to SQLite
		void this.logPushes(context, items, triggerType);
	}

	private async logPushes(
		context: import('./types').AmbientContext,
		items: AmbientPushItem[],
		triggerType: TriggerType,
	): Promise<void> {
		try {
			await this.ports.persistence.logPushes(context, items, triggerType);
			this.ports.persistence.invalidatePatternCache();
		} catch {
			/* SQLite may not be ready — fail silently */
		}
	}
}
