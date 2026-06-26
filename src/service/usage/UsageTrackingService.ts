import type { AppHandle } from '@/core/ports/AppHandle';
import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '@/core/storage/sqlite/ddl';
import { EventBus, ViewEventType } from '@/core/eventBus';
import type { UsageRecordedViewEvent } from '@/core/eventBus';
import { UsageLogRepo } from '@/core/storage/sqlite/repositories/UsageLogRepo';
import type { UsageRecordPayload, UsageKPIs, TimeRange } from './types';

/**
 * Snapshot of where the user stands inside the current monthly budget cycle.
 * `projected` extrapolates linearly from used-so-far × (daysInCycle / daysElapsed),
 * the simplest projection that still surfaces "off-pace" without overweighting
 * the most recent day. `percentProjected` may exceed 1 — the dashboard renders
 * the pace bar accordingly (capped + warning tone).
 */
export interface MonthlyPaceSnapshot {
	cycleStartMs: number;
	cycleEndMs: number;
	daysInCycle: number;
	daysElapsed: number;
	used: number;
	projected: number;
	remaining: number;
	percentUsed: number;
	percentProjected: number;
	monthlyUsd: number;
}

export interface CostPerSavedArtifact {
	value: number | null;
	prevValue: number | null;
	deltaPct: number | null;
	savedCount: number;
	totalCost: number;
}

export interface SparklinePoint {
	date: string;
	value: number;
}

export interface ThisWeekTrio {
	spend: { total: number; deltaPct: number | null; points: SparklinePoint[] };
	tokens: { total: number; deltaPct: number | null; points: SparklinePoint[] };
	costPerSaved: { value: number | null; deltaPct: number | null; points: SparklinePoint[] };
}

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
	init(db: Kysely<DbSchema>, app: AppHandle, settings: UsageSettings): void {
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

	/**
	 * Per-feature cost + call count rollup. Drives the Outcome Value screen
	 * (spec §6.2 per-feature MPG).
	 */
	async getCostByFeature(range: TimeRange) {
		const { start, end } = rangeToMs(range);
		return this.getRepo().groupByFeatureCost(start, end);
	}

	/**
	 * Per-feature message_id list (extracted from usage_log.metadata_json).
	 * The dashboard hook intersects this with UsageOutcomeService to find
	 * useful / adopted counts per feature.
	 */
	async getMessageIdsByFeature(range: TimeRange) {
		const { start, end } = rangeToMs(range);
		return this.getRepo().messageIdsByFeature(start, end);
	}

	/**
	 * Single usage_log row lookup — used by the History detail panel after
	 * the user clicks a row.
	 */
	async getLogById(id: number) {
		return this.getRepo().getById(id);
	}

	/**
	 * Most-recent usage_log row whose metadata carries `message_id` (scoped
	 * by `session_id` when provided). Backs the inline message receipt
	 * (Dashboard carrier A). Returns undefined when no matching row exists,
	 * which the caller treats as "no receipt to render".
	 */
	async getLogByMessageId(message_id: string, session_id?: string) {
		return this.getRepo().findByMessageId(message_id, session_id);
	}

	/**
	 * Sum cost in the current monthly cycle defined by `resetDayOfMonth` and
	 * project linearly forward. Used by the dashboard's Budget pace KPI + the
	 * Budget & Alerts surface's monthly bar.
	 *
	 * Implementation note: cycle boundaries are derived from local time so
	 * "1st of the month" lines up with what the user expects. `daysElapsed`
	 * counts the partial current day as 1 so brand-new cycles don't divide by
	 * zero and projection over-shoots.
	 */
	async getMonthlyPace(monthlyUsd: number, resetDayOfMonth: number): Promise<MonthlyPaceSnapshot> {
		const { cycleStartMs, cycleEndMs, daysInCycle, daysElapsed } = computeCycle(resetDayOfMonth);
		const agg = await this.getRepo().sumByRange(cycleStartMs, Date.now());
		const used = agg.totalCost;
		// Linear extrapolation; floor daysElapsed at 1 to avoid zero-div.
		const projected = daysElapsed > 0 ? used * (daysInCycle / daysElapsed) : used;
		const remaining = Math.max(monthlyUsd - used, 0);
		const percentUsed = monthlyUsd > 0 ? used / monthlyUsd : 0;
		const percentProjected = monthlyUsd > 0 ? projected / monthlyUsd : 0;
		return {
			cycleStartMs,
			cycleEndMs,
			daysInCycle,
			daysElapsed,
			used,
			projected,
			remaining,
			percentUsed,
			percentProjected,
			monthlyUsd,
		};
	}

	/**
	 * Cost-per-strong-outcome ratio. "Strong" = vault_save / copilot_accept /
	 * agent_file_emit (spec §11.4). Returns null `value` when no saves were
	 * recorded — the dashboard shows "—" in that case rather than ∞. `deltaPct`
	 * is the period-over-period change in the ratio (negative = improvement,
	 * surfaced as "−21%" green in the mock).
	 */
	async getCostPerSavedArtifact(
		range: TimeRange,
		outcome: { adoptedMessageIdsInRange: (r: { from: number; to: number }) => Promise<string[]> },
	): Promise<CostPerSavedArtifact> {
		const { start, end, prevStart, prevEnd } = rangeToMs(range);
		const [cur, prev, curAdopted, prevAdopted] = await Promise.all([
			this.getRepo().sumByRange(start, end),
			this.getRepo().sumByRange(prevStart, prevEnd),
			outcome.adoptedMessageIdsInRange({ from: start, to: end }),
			outcome.adoptedMessageIdsInRange({ from: prevStart, to: prevEnd }),
		]);
		const value = curAdopted.length > 0 ? cur.totalCost / curAdopted.length : null;
		const prevValue = prevAdopted.length > 0 ? prev.totalCost / prevAdopted.length : null;
		const deltaPct = value !== null && prevValue !== null && prevValue > 0
			? (value - prevValue) / prevValue
			: null;
		return {
			value,
			prevValue,
			deltaPct,
			savedCount: curAdopted.length,
			totalCost: cur.totalCost,
		};
	}

	/**
	 * Compact "This week" sparkline trio — spend / token / cost-per-saved
	 * series over the requested range, plus prior-period deltas. Reuses
	 * dailyTokensTotal + dailyCostByProvider; cost-per-saved is approximated
	 * as `dailyCost / max(usefulCountThatDay, 1)` and accepts a callback that
	 * supplies per-day adopted counts so we don't tightly couple to
	 * UsageOutcomeService here.
	 */
	async getThisWeekTrio(
		range: TimeRange,
		adoptedCountByDay: (start: number, end: number) => Promise<Map<string, number>>,
	): Promise<ThisWeekTrio> {
		const { start, end, prevStart, prevEnd } = rangeToMs(range);
		const [tokens, costs, prevTokens, prevCosts, adopted] = await Promise.all([
			this.getRepo().dailyTokensTotal(start, end),
			this.getRepo().dailyCostByProvider(start, end),
			this.getRepo().dailyTokensTotal(prevStart, prevEnd),
			this.getRepo().dailyCostByProvider(prevStart, prevEnd),
			adoptedCountByDay(start, end),
		]);

		const tokenPoints: SparklinePoint[] = tokens.map((r) => ({
			date: r.date,
			value: r.inputTokens + r.outputTokens,
		}));
		const tokenTotal = tokenPoints.reduce((s, p) => s + p.value, 0);
		const prevTokenTotal = prevTokens.reduce((s, r) => s + r.inputTokens + r.outputTokens, 0);

		const costByDate = new Map<string, number>();
		for (const row of costs) {
			costByDate.set(row.date, (costByDate.get(row.date) ?? 0) + row.cost);
		}
		const costPoints: SparklinePoint[] = Array.from(costByDate.entries())
			.sort((a, b) => a[0].localeCompare(b[0]))
			.map(([date, value]) => ({ date, value }));
		const costTotal = costPoints.reduce((s, p) => s + p.value, 0);
		const prevCostTotal = prevCosts.reduce((s, r) => s + r.cost, 0);

		const mpgPoints: SparklinePoint[] = costPoints.map(({ date, value }) => {
			const saves = adopted.get(date) ?? 0;
			return { date, value: saves > 0 ? value / saves : 0 };
		});
		const mpgValue = mpgPoints.length > 0
			? mpgPoints.reduce((s, p) => s + p.value, 0) / mpgPoints.length
			: null;

		return {
			spend: {
				total: costTotal,
				deltaPct: prevCostTotal > 0 ? (costTotal - prevCostTotal) / prevCostTotal : null,
				points: costPoints,
			},
			tokens: {
				total: tokenTotal,
				deltaPct: prevTokenTotal > 0 ? (tokenTotal - prevTokenTotal) / prevTokenTotal : null,
				points: tokenPoints,
			},
			costPerSaved: {
				value: mpgValue,
				deltaPct: null,
				points: mpgPoints,
			},
		};
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
				metadata_json: payload.metadata ? JSON.stringify(payload.metadata) : null,
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

/**
 * Determine the current monthly cycle [start, end) based on `resetDayOfMonth`.
 * If today is past the reset day, the cycle starts at this month's reset day;
 * otherwise it started in the previous month. `daysInCycle` is the natural
 * span between the two cycle anchors (28..31).
 */
function computeCycle(resetDayOfMonth: number): {
	cycleStartMs: number;
	cycleEndMs: number;
	daysInCycle: number;
	daysElapsed: number;
} {
	const safeDay = Math.max(1, Math.min(28, Math.floor(resetDayOfMonth || 1)));
	const now = new Date();
	const y = now.getFullYear();
	const m = now.getMonth();
	const d = now.getDate();

	let cycleStart: Date;
	let cycleEnd: Date;
	if (d >= safeDay) {
		cycleStart = new Date(y, m, safeDay, 0, 0, 0, 0);
		cycleEnd = new Date(y, m + 1, safeDay, 0, 0, 0, 0);
	} else {
		cycleStart = new Date(y, m - 1, safeDay, 0, 0, 0, 0);
		cycleEnd = new Date(y, m, safeDay, 0, 0, 0, 0);
	}

	const cycleStartMs = cycleStart.getTime();
	const cycleEndMs = cycleEnd.getTime();
	const daysInCycle = Math.max(1, Math.round((cycleEndMs - cycleStartMs) / DAY_MS));
	const daysElapsed = Math.max(1, Math.ceil((Date.now() - cycleStartMs) / DAY_MS));
	return { cycleStartMs, cycleEndMs, daysInCycle, daysElapsed };
}
