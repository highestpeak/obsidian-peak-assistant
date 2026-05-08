import type { App } from 'obsidian';
import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '@/core/storage/sqlite/ddl';
import { EventBus, ViewEventType } from '@/core/eventBus';
import type { UsageRecordedViewEvent } from '@/core/eventBus';
import { UsageLogRepo } from '@/core/storage/sqlite/repositories/UsageLogRepo';
import type { UsageRecordPayload, UsageKPIs, TimeRange } from './types';

interface UsageSettings {
	usageTrackingEnabled: boolean;
	usageDetailRetentionDays: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Convert a TimeRange to absolute ms boundaries for current and previous period.
 */
function rangeToMs(range: TimeRange): { start: number; end: number; prevStart: number; prevEnd: number } {
	const now = Date.now();
	const end = now;
	let start: number;

	switch (range) {
		case 'today': {
			const d = new Date();
			d.setHours(0, 0, 0, 0);
			start = d.getTime();
			break;
		}
		case '7d':
			start = now - 7 * DAY_MS;
			break;
		case '30d':
			start = now - 30 * DAY_MS;
			break;
		case 'all':
			start = 0;
			break;
	}

	const span = end - start;
	const prevEnd = start;
	const prevStart = range === 'all' ? 0 : start - span;

	return { start, end, prevStart, prevEnd };
}

/**
 * Singleton service that subscribes to usage events, persists them,
 * runs daily compaction, and provides query methods for the dashboard.
 */
export class UsageTrackingService {
	private static instance: UsageTrackingService | null = null;

	private repo: UsageLogRepo | null = null;
	private unsubscribe: (() => void) | null = null;
	private compactionTimer: ReturnType<typeof setInterval> | null = null;
	private settings: UsageSettings = { usageTrackingEnabled: true, usageDetailRetentionDays: 30 };

	static getInstance(): UsageTrackingService {
		if (!UsageTrackingService.instance) {
			UsageTrackingService.instance = new UsageTrackingService();
		}
		return UsageTrackingService.instance;
	}

	/**
	 * Initialize the service: create repo, subscribe to events, run compaction, start timer.
	 */
	init(db: Kysely<DbSchema>, app: App, settings: UsageSettings): void {
		this.repo = new UsageLogRepo(db);
		this.settings = { ...settings };

		// Subscribe to usage events
		const eventBus = EventBus.getInstance(app);
		this.unsubscribe = eventBus.on<UsageRecordedViewEvent>(
			ViewEventType.USAGE_RECORDED,
			(event) => {
				if (this.settings.usageTrackingEnabled) {
					void this.record(event.payload);
				}
			},
		);

		// Run compaction on startup
		void this.runCompaction();

		// Schedule compaction every 24h
		this.compactionTimer = setInterval(() => {
			void this.runCompaction();
		}, DAY_MS);
	}

	/**
	 * Clean up timer and event subscription.
	 */
	destroy(): void {
		if (this.compactionTimer) {
			clearInterval(this.compactionTimer);
			this.compactionTimer = null;
		}
		if (this.unsubscribe) {
			this.unsubscribe();
			this.unsubscribe = null;
		}
		this.repo = null;
		UsageTrackingService.instance = null;
	}

	/**
	 * Update tracking settings at runtime.
	 */
	updateSettings(settings: Partial<UsageSettings>): void {
		Object.assign(this.settings, settings);
	}

	// ── Query methods (delegate to repo) ────────────────────

	async getKPIs(range: TimeRange): Promise<UsageKPIs> {
		const { start, end, prevStart, prevEnd } = rangeToMs(range);
		const repo = this.getRepo();

		const [current, prev] = await Promise.all([
			repo.sumByRange(start, end),
			repo.sumByRange(prevStart, prevEnd),
		]);

		return {
			totalTokens: current.totalInputTokens + current.totalOutputTokens,
			totalCostUsd: current.totalCost,
			callCount: current.callCount,
			avgDurationMs: current.avgDuration,
			p95DurationMs: current.p95Duration,
			prevTotalTokens: prev.totalInputTokens + prev.totalOutputTokens,
			prevTotalCostUsd: prev.totalCost,
		};
	}

	async getTokenTrend(range: TimeRange) {
		const { start, end } = rangeToMs(range);
		return this.getRepo().dailyTokensTotal(start, end);
	}

	async getCostTrend(range: TimeRange) {
		const { start, end } = rangeToMs(range);
		return this.getRepo().dailyCostByProvider(start, end);
	}

	async getFeatureDistribution(range: TimeRange) {
		const { start, end } = rangeToMs(range);
		return this.getRepo().groupByFeature(start, end);
	}

	async getModelDistribution(range: TimeRange) {
		const { start, end } = rangeToMs(range);
		return this.getRepo().groupByModel(start, end);
	}

	async getCostBreakdown(range: TimeRange) {
		const { start, end } = rangeToMs(range);
		return this.getRepo().groupByCostProvider(start, end);
	}

	async getDailyBreakdown(range: TimeRange) {
		const { start, end } = rangeToMs(range);
		return this.getRepo().dailyTokensByFeature(start, end);
	}

	async getRecentCalls(range: TimeRange, feature?: string, limit = 50, offset = 0) {
		const { start, end } = rangeToMs(range);
		return this.getRepo().getLogsByRangeFiltered(start, end, feature, limit, offset);
	}

	// ── Private ─────────────────────────────────────────────

	private async record(payload: UsageRecordPayload): Promise<void> {
		try {
			await this.getRepo().insert({
				session_id: payload.sessionId,
				feature: payload.feature,
				action: payload.action,
				provider: payload.provider,
				model: payload.model,
				input_tokens: payload.inputTokens,
				output_tokens: payload.outputTokens,
				cached_tokens: payload.cachedTokens,
				reasoning_tokens: payload.reasoningTokens,
				cost_usd: payload.costUsd,
				duration_ms: payload.durationMs,
				is_streaming: payload.isStreaming ? 1 : 0,
				metadata: payload.metadata ? JSON.stringify(payload.metadata) : null,
				created_at: Date.now(),
			});
		} catch (e) {
			console.error('[UsageTrackingService] Failed to record usage:', e);
		}
	}

	private async runCompaction(): Promise<void> {
		try {
			const cutoff = Date.now() - this.settings.usageDetailRetentionDays * DAY_MS;
			const deleted = await this.getRepo().compactBefore(cutoff);
			if (deleted > 0) {
				console.log(`[UsageTrackingService] Compacted ${deleted} rows older than ${this.settings.usageDetailRetentionDays}d`);
			}
		} catch (e) {
			console.error('[UsageTrackingService] Compaction failed:', e);
		}
	}

	private getRepo(): UsageLogRepo {
		if (!this.repo) {
			throw new Error('[UsageTrackingService] Not initialized — call init() first');
		}
		return this.repo;
	}
}
