# Token Usage Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a unified token usage tracking system that records every AI API call to SQLite and presents an interactive dashboard View with KPIs, charts, and drill-down table.

**Architecture:** Event bus (pub-sub) pattern — AI call methods auto-emit `usage-recorded` events, `UsageTrackingService` subscribes and persists to `usage_log` table. Dashboard View queries both `usage_log` (recent detail) and `usage_daily` (compressed history). Retention is configurable.

**Tech Stack:** SQLite (Kysely), React 18, recharts (new dependency for charts), Obsidian ItemView, EventBus (existing `src/core/eventBus.ts`)

**Spec:** `docs/superpowers/specs/2026-05-08-token-usage-dashboard-design.md`
**Mockup:** `.superpowers/brainstorm/85527-1778205143/content/panel-mockup-v4.html`

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `src/service/usage/types.ts` | `UsageRecordedEvent` interface, `UsageFeature` enum, query result types |
| `src/service/usage/UsageTrackingService.ts` | Subscribe to events, persist, compact, query methods |
| `src/core/storage/sqlite/repositories/UsageLogRepo.ts` | Kysely CRUD for `usage_log` and `usage_daily` tables |
| `src/ui/view/usage-dashboard/UsageDashboardView.ts` | Obsidian `ItemView` subclass, mounts React |
| `src/ui/view/usage-dashboard/UsageDashboard.tsx` | React root: time range state, data fetching, layout |
| `src/ui/view/usage-dashboard/components/KpiCards.tsx` | 4 stat cards row |
| `src/ui/view/usage-dashboard/components/TrendCharts.tsx` | Token trend + Cost trend line charts (recharts) |
| `src/ui/view/usage-dashboard/components/DistributionCharts.tsx` | 3 donut charts row (recharts) |
| `src/ui/view/usage-dashboard/components/DailyBreakdown.tsx` | Stacked bar chart (recharts) |
| `src/ui/view/usage-dashboard/components/RecentCallsTable.tsx` | Filterable detail table |
| `src/ui/view/usage-dashboard/hooks/useUsageData.ts` | Data fetching hook, calls UsageTrackingService |
| `test/usage-tracking.test.ts` | Tests for repo + service logic |

### Files to modify

| File | Change |
|------|--------|
| `src/core/storage/sqlite/ddl.ts:78` | Add `usage_log` and `usage_daily` to `Database` interface |
| `src/core/storage/sqlite/ddl.ts:422` | Add `CREATE TABLE` statements in `migrateSqliteSchema` |
| `src/core/eventBus.ts:7` | Add `USAGE_RECORDED` to `ViewEventType` enum |
| `src/core/eventBus.ts` | Add `UsageRecordedViewEvent` class |
| `src/service/chat/service-manager.ts:790,826,896,945` | Wrap 4 query methods to auto-emit usage events |
| `src/service/agents/core/sdkAgentPool.ts:131` | Wrap `queryWithProfile` to auto-emit |
| `src/core/providers/vercel/index.ts:31` | Fix `vercelGenerateText` to capture usage |
| `src/service/agents/vault-sdk/sdkMessageAdapter.ts:134` | Map `cache_read_input_tokens` → `cachedInputTokens` |
| `src/core/embeddings/embedClient.ts:38` | Parse `usage.prompt_tokens` from response + emit |
| `src/app/settings/types.ts:383,447` | Add `usageTrackingEnabled`, `usageDetailRetentionDays` |
| `src/app/view/ViewManager.ts:28` | Register `UsageDashboardView` |
| `main.ts:252` | Init `UsageTrackingService` after SQLite |

---

## Task 1: Schema & DDL

**Files:**
- Modify: `src/core/storage/sqlite/ddl.ts:78-408` (Database interface)
- Modify: `src/core/storage/sqlite/ddl.ts:422+` (migrateSqliteSchema)

- [ ] **Step 1: Add row types to Database interface**

In `src/core/storage/sqlite/ddl.ts`, add these interfaces and table keys to the `Database` interface (after existing table definitions around line 408):

```typescript
export interface UsageLogRow {
    id: number;
    session_id: string;
    feature: string;
    action: string;
    provider: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    cached_tokens: number;
    reasoning_tokens: number;
    cost_usd: number;
    duration_ms: number;
    is_streaming: number;
    created_at: number;
    metadata_json: string | null;
}

export interface UsageDailyRow {
    id: number;
    date: string;
    feature: string;
    action: string;
    provider: string;
    model: string;
    call_count: number;
    total_input_tokens: number;
    total_output_tokens: number;
    total_cached_tokens: number;
    total_reasoning_tokens: number;
    total_cost_usd: number;
    avg_duration_ms: number;
    max_duration_ms: number;
}
```

Add to the `Database` interface:
```typescript
usage_log: UsageLogRow;
usage_daily: UsageDailyRow;
```

- [ ] **Step 2: Add CREATE TABLE statements**

In `migrateSqliteSchema()`, add after the last existing `db.exec(...)` block:

```sql
CREATE TABLE IF NOT EXISTS usage_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      TEXT NOT NULL,
    feature         TEXT NOT NULL,
    action          TEXT NOT NULL,
    provider        TEXT NOT NULL,
    model           TEXT NOT NULL,
    input_tokens    INTEGER NOT NULL DEFAULT 0,
    output_tokens   INTEGER NOT NULL DEFAULT 0,
    cached_tokens   INTEGER DEFAULT 0,
    reasoning_tokens INTEGER DEFAULT 0,
    cost_usd        REAL NOT NULL DEFAULT 0,
    duration_ms     INTEGER NOT NULL DEFAULT 0,
    is_streaming    INTEGER NOT NULL DEFAULT 0,
    created_at      INTEGER NOT NULL,
    metadata_json   TEXT
);
CREATE INDEX IF NOT EXISTS idx_usage_log_created_at ON usage_log(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_log_feature ON usage_log(feature);
CREATE INDEX IF NOT EXISTS idx_usage_log_session ON usage_log(session_id);

CREATE TABLE IF NOT EXISTS usage_daily (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    date                   TEXT NOT NULL,
    feature                TEXT NOT NULL,
    action                 TEXT NOT NULL,
    provider               TEXT NOT NULL,
    model                  TEXT NOT NULL,
    call_count             INTEGER NOT NULL DEFAULT 0,
    total_input_tokens     INTEGER NOT NULL DEFAULT 0,
    total_output_tokens    INTEGER NOT NULL DEFAULT 0,
    total_cached_tokens    INTEGER NOT NULL DEFAULT 0,
    total_reasoning_tokens INTEGER NOT NULL DEFAULT 0,
    total_cost_usd         REAL NOT NULL DEFAULT 0,
    avg_duration_ms        REAL NOT NULL DEFAULT 0,
    max_duration_ms        INTEGER NOT NULL DEFAULT 0,
    UNIQUE(date, feature, action, provider, model)
);
CREATE INDEX IF NOT EXISTS idx_usage_daily_date ON usage_daily(date);
```

- [ ] **Step 3: Build to verify schema compiles**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/core/storage/sqlite/ddl.ts
git commit -m "feat(usage): add usage_log and usage_daily table schemas"
```

---

## Task 2: UsageLogRepo

**Files:**
- Create: `src/core/storage/sqlite/repositories/UsageLogRepo.ts`

- [ ] **Step 1: Create the repository**

Create `src/core/storage/sqlite/repositories/UsageLogRepo.ts`:

```typescript
import { Kysely, sql } from 'kysely';

// Import the Database type from ddl.ts — follow existing import pattern in ChatMessageRepo
type DbSchema = import('../ddl').Database;

export interface UsageLogInsert {
    session_id: string;
    feature: string;
    action: string;
    provider: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    cached_tokens: number;
    reasoning_tokens: number;
    cost_usd: number;
    duration_ms: number;
    is_streaming: number;
    created_at: number;
    metadata_json: string | null;
}

export interface DailyAggRow {
    date: string;
    feature: string;
    action: string;
    provider: string;
    model: string;
    call_count: number;
    total_input_tokens: number;
    total_output_tokens: number;
    total_cached_tokens: number;
    total_reasoning_tokens: number;
    total_cost_usd: number;
    avg_duration_ms: number;
    max_duration_ms: number;
}

export class UsageLogRepo {
    constructor(private readonly db: Kysely<DbSchema>) {}

    async insert(row: UsageLogInsert): Promise<void> {
        await this.db.insertInto('usage_log').values(row).execute();
    }

    async getLogsByRange(startMs: number, endMs: number): Promise<import('../ddl').UsageLogRow[]> {
        return this.db
            .selectFrom('usage_log')
            .selectAll()
            .where('created_at', '>=', startMs)
            .where('created_at', '<=', endMs)
            .orderBy('created_at', 'desc')
            .execute();
    }

    async getLogsByRangeFiltered(
        startMs: number,
        endMs: number,
        feature?: string,
        limit = 100,
        offset = 0,
    ): Promise<import('../ddl').UsageLogRow[]> {
        let query = this.db
            .selectFrom('usage_log')
            .selectAll()
            .where('created_at', '>=', startMs)
            .where('created_at', '<=', endMs);
        if (feature) query = query.where('feature', '=', feature);
        return query.orderBy('created_at', 'desc').limit(limit).offset(offset).execute();
    }

    async getDailyByRange(startDate: string, endDate: string): Promise<import('../ddl').UsageDailyRow[]> {
        return this.db
            .selectFrom('usage_daily')
            .selectAll()
            .where('date', '>=', startDate)
            .where('date', '<=', endDate)
            .orderBy('date', 'asc')
            .execute();
    }

    /** Aggregate expired detail rows into daily buckets and delete originals. */
    async compactBefore(cutoffMs: number): Promise<number> {
        // Step 1: aggregate expired rows
        const rows = await sql<DailyAggRow>`
            SELECT
                date(created_at / 1000, 'unixepoch', 'localtime') as date,
                feature, action, provider, model,
                COUNT(*) as call_count,
                SUM(input_tokens) as total_input_tokens,
                SUM(output_tokens) as total_output_tokens,
                SUM(cached_tokens) as total_cached_tokens,
                SUM(reasoning_tokens) as total_reasoning_tokens,
                SUM(cost_usd) as total_cost_usd,
                AVG(duration_ms) as avg_duration_ms,
                MAX(duration_ms) as max_duration_ms
            FROM usage_log
            WHERE created_at < ${cutoffMs}
            GROUP BY date, feature, action, provider, model
        `.execute(this.db);

        if (rows.rows.length === 0) return 0;

        // Step 2: upsert into usage_daily
        for (const r of rows.rows) {
            await sql`
                INSERT INTO usage_daily (date, feature, action, provider, model,
                    call_count, total_input_tokens, total_output_tokens,
                    total_cached_tokens, total_reasoning_tokens, total_cost_usd,
                    avg_duration_ms, max_duration_ms)
                VALUES (${r.date}, ${r.feature}, ${r.action}, ${r.provider}, ${r.model},
                    ${r.call_count}, ${r.total_input_tokens}, ${r.total_output_tokens},
                    ${r.total_cached_tokens}, ${r.total_reasoning_tokens}, ${r.total_cost_usd},
                    ${r.avg_duration_ms}, ${r.max_duration_ms})
                ON CONFLICT(date, feature, action, provider, model) DO UPDATE SET
                    call_count = call_count + excluded.call_count,
                    total_input_tokens = total_input_tokens + excluded.total_input_tokens,
                    total_output_tokens = total_output_tokens + excluded.total_output_tokens,
                    total_cached_tokens = total_cached_tokens + excluded.total_cached_tokens,
                    total_reasoning_tokens = total_reasoning_tokens + excluded.total_reasoning_tokens,
                    total_cost_usd = total_cost_usd + excluded.total_cost_usd,
                    avg_duration_ms = (avg_duration_ms * call_count + excluded.avg_duration_ms * excluded.call_count)
                        / (call_count + excluded.call_count),
                    max_duration_ms = MAX(max_duration_ms, excluded.max_duration_ms)
            `.execute(this.db);
        }

        // Step 3: delete compacted rows
        const result = await this.db
            .deleteFrom('usage_log')
            .where('created_at', '<', cutoffMs)
            .executeTakeFirst();

        return Number(result.numDeletedRows);
    }

    // --- Aggregation queries for dashboard ---

    async sumByRange(startMs: number, endMs: number): Promise<{
        totalInputTokens: number;
        totalOutputTokens: number;
        totalCostUsd: number;
        callCount: number;
        avgDurationMs: number;
        p95DurationMs: number;
    }> {
        const row = await sql<{
            total_input: number;
            total_output: number;
            total_cost: number;
            call_count: number;
            avg_dur: number;
        }>`
            SELECT
                COALESCE(SUM(input_tokens), 0) as total_input,
                COALESCE(SUM(output_tokens), 0) as total_output,
                COALESCE(SUM(cost_usd), 0) as total_cost,
                COUNT(*) as call_count,
                COALESCE(AVG(duration_ms), 0) as avg_dur
            FROM usage_log
            WHERE created_at >= ${startMs} AND created_at <= ${endMs}
        `.execute(this.db);

        // p95 via subquery
        const p95Row = await sql<{ p95: number }>`
            SELECT COALESCE(duration_ms, 0) as p95
            FROM usage_log
            WHERE created_at >= ${startMs} AND created_at <= ${endMs}
            ORDER BY duration_ms ASC
            LIMIT 1 OFFSET (
                SELECT CAST(COUNT(*) * 0.95 AS INTEGER)
                FROM usage_log
                WHERE created_at >= ${startMs} AND created_at <= ${endMs}
            )
        `.execute(this.db);

        const r = row.rows[0];
        return {
            totalInputTokens: r?.total_input ?? 0,
            totalOutputTokens: r?.total_output ?? 0,
            totalCostUsd: r?.total_cost ?? 0,
            callCount: r?.call_count ?? 0,
            avgDurationMs: r?.avg_dur ?? 0,
            p95DurationMs: p95Row.rows[0]?.p95 ?? 0,
        };
    }

    async groupByFeature(startMs: number, endMs: number): Promise<Array<{ feature: string; tokens: number; cost: number }>> {
        const rows = await sql<{ feature: string; tokens: number; cost: number }>`
            SELECT feature,
                COALESCE(SUM(input_tokens + output_tokens), 0) as tokens,
                COALESCE(SUM(cost_usd), 0) as cost
            FROM usage_log
            WHERE created_at >= ${startMs} AND created_at <= ${endMs}
            GROUP BY feature ORDER BY tokens DESC
        `.execute(this.db);
        return rows.rows;
    }

    async groupByModel(startMs: number, endMs: number): Promise<Array<{ provider: string; model: string; tokens: number }>> {
        const rows = await sql<{ provider: string; model: string; tokens: number }>`
            SELECT provider, model,
                COALESCE(SUM(input_tokens + output_tokens), 0) as tokens
            FROM usage_log
            WHERE created_at >= ${startMs} AND created_at <= ${endMs}
            GROUP BY provider, model ORDER BY tokens DESC
        `.execute(this.db);
        return rows.rows;
    }

    async groupByCostProvider(startMs: number, endMs: number): Promise<Array<{ provider: string; cost: number }>> {
        const rows = await sql<{ provider: string; cost: number }>`
            SELECT provider,
                COALESCE(SUM(cost_usd), 0) as cost
            FROM usage_log
            WHERE created_at >= ${startMs} AND created_at <= ${endMs}
            GROUP BY provider ORDER BY cost DESC
        `.execute(this.db);
        return rows.rows;
    }

    async dailyTokensByFeature(startMs: number, endMs: number): Promise<Array<{
        date: string; feature: string; tokens: number; cost: number; calls: number;
    }>> {
        const rows = await sql<{ date: string; feature: string; tokens: number; cost: number; calls: number }>`
            SELECT
                date(created_at / 1000, 'unixepoch', 'localtime') as date,
                feature,
                COALESCE(SUM(input_tokens + output_tokens), 0) as tokens,
                COALESCE(SUM(cost_usd), 0) as cost,
                COUNT(*) as calls
            FROM usage_log
            WHERE created_at >= ${startMs} AND created_at <= ${endMs}
            GROUP BY date, feature ORDER BY date ASC
        `.execute(this.db);
        return rows.rows;
    }

    async dailyTokensTotal(startMs: number, endMs: number): Promise<Array<{
        date: string; input_tokens: number; output_tokens: number; total_tokens: number;
    }>> {
        const rows = await sql<{ date: string; input_tokens: number; output_tokens: number; total_tokens: number }>`
            SELECT
                date(created_at / 1000, 'unixepoch', 'localtime') as date,
                COALESCE(SUM(input_tokens), 0) as input_tokens,
                COALESCE(SUM(output_tokens), 0) as output_tokens,
                COALESCE(SUM(input_tokens + output_tokens), 0) as total_tokens
            FROM usage_log
            WHERE created_at >= ${startMs} AND created_at <= ${endMs}
            GROUP BY date ORDER BY date ASC
        `.execute(this.db);
        return rows.rows;
    }

    async dailyCostByProvider(startMs: number, endMs: number): Promise<Array<{
        date: string; provider: string; cost: number;
    }>> {
        const rows = await sql<{ date: string; provider: string; cost: number }>`
            SELECT
                date(created_at / 1000, 'unixepoch', 'localtime') as date,
                provider,
                COALESCE(SUM(cost_usd), 0) as cost
            FROM usage_log
            WHERE created_at >= ${startMs} AND created_at <= ${endMs}
            GROUP BY date, provider ORDER BY date ASC
        `.execute(this.db);
        return rows.rows;
    }
}
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/core/storage/sqlite/repositories/UsageLogRepo.ts
git commit -m "feat(usage): add UsageLogRepo with CRUD and aggregation queries"
```

---

## Task 3: Event Types & EventBus Extension

**Files:**
- Create: `src/service/usage/types.ts`
- Modify: `src/core/eventBus.ts:7-22` (ViewEventType enum)

- [ ] **Step 1: Create usage types**

Create `src/service/usage/types.ts`:

```typescript
export type UsageFeature = 'chat' | 'search_analysis' | 'copilot' | 'graph' | 'indexing' | 'internal';

export interface UsageRecordPayload {
    sessionId: string;
    feature: UsageFeature;
    action: string;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    reasoningTokens: number;
    costUsd: number;
    durationMs: number;
    isStreaming: boolean;
    metadata?: Record<string, unknown>;
}

export interface UsageKPIs {
    totalTokens: number;
    totalCostUsd: number;
    callCount: number;
    avgDurationMs: number;
    p95DurationMs: number;
    prevTotalTokens: number;
    prevTotalCostUsd: number;
}

export type TimeRange = 'today' | '7d' | '30d' | 'all';
```

- [ ] **Step 2: Add USAGE_RECORDED to ViewEventType**

In `src/core/eventBus.ts`, add `USAGE_RECORDED = 'peak:usage-recorded'` to the `ViewEventType` enum (after the last existing entry around line 22).

- [ ] **Step 3: Add UsageRecordedViewEvent class**

In `src/core/eventBus.ts`, after the existing event classes, add:

```typescript
export class UsageRecordedViewEvent extends ViewEvent {
    constructor(public readonly payload: import('@/service/usage/types').UsageRecordPayload) {
        super(ViewEventType.USAGE_RECORDED);
    }
}
```

- [ ] **Step 4: Build to verify**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/service/usage/types.ts src/core/eventBus.ts
git commit -m "feat(usage): add usage event types and USAGE_RECORDED event"
```

---

## Task 4: UsageTrackingService

**Files:**
- Create: `src/service/usage/UsageTrackingService.ts`

- [ ] **Step 1: Create the service**

Create `src/service/usage/UsageTrackingService.ts`:

```typescript
import { Kysely } from 'kysely';
import { App } from 'obsidian';
import { EventBus, UsageRecordedViewEvent, ViewEventType } from '@/core/eventBus';
import { UsageLogRepo } from '@/core/storage/sqlite/repositories/UsageLogRepo';
import type { UsageRecordPayload, TimeRange, UsageKPIs } from './types';

type DbSchema = import('@/core/storage/sqlite/ddl').Database;

export class UsageTrackingService {
    private static instance: UsageTrackingService | null = null;
    private repo!: UsageLogRepo;
    private compactionTimer: ReturnType<typeof setInterval> | null = null;
    private retentionDays = 30;
    private enabled = true;
    private unsubscribe: (() => void) | null = null;

    private constructor() {}

    static getInstance(): UsageTrackingService {
        if (!this.instance) this.instance = new UsageTrackingService();
        return this.instance;
    }

    async init(db: Kysely<DbSchema>, app: App, settings: { usageTrackingEnabled: boolean; usageDetailRetentionDays: number }): Promise<void> {
        this.repo = new UsageLogRepo(db);
        this.enabled = settings.usageTrackingEnabled;
        this.retentionDays = settings.usageDetailRetentionDays;

        // Subscribe to usage events
        const eventBus = EventBus.getInstance(app);
        this.unsubscribe = eventBus.on(ViewEventType.USAGE_RECORDED, (event: UsageRecordedViewEvent) => {
            if (!this.enabled) return;
            void this.record(event.payload);
        });

        // Run compaction on startup
        await this.runCompaction();

        // Schedule daily compaction (24h)
        this.compactionTimer = setInterval(() => void this.runCompaction(), 24 * 60 * 60 * 1000);
    }

    destroy(): void {
        if (this.compactionTimer) clearInterval(this.compactionTimer);
        if (this.unsubscribe) this.unsubscribe();
        UsageTrackingService.instance = null;
    }

    private async record(payload: UsageRecordPayload): Promise<void> {
        await this.repo.insert({
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
            created_at: Date.now(),
            metadata_json: payload.metadata ? JSON.stringify(payload.metadata) : null,
        });
    }

    private async runCompaction(): Promise<void> {
        const cutoffMs = Date.now() - this.retentionDays * 24 * 60 * 60 * 1000;
        await this.repo.compactBefore(cutoffMs);
    }

    updateSettings(settings: { usageTrackingEnabled: boolean; usageDetailRetentionDays: number }): void {
        this.enabled = settings.usageTrackingEnabled;
        this.retentionDays = settings.usageDetailRetentionDays;
    }

    // --- Query methods for dashboard ---

    private rangeToMs(range: TimeRange): { start: number; end: number; prevStart: number; prevEnd: number } {
        const now = Date.now();
        const end = now;
        let start: number;
        switch (range) {
            case 'today': {
                const d = new Date(); d.setHours(0, 0, 0, 0);
                start = d.getTime();
                break;
            }
            case '7d': start = now - 7 * 24 * 60 * 60 * 1000; break;
            case '30d': start = now - 30 * 24 * 60 * 60 * 1000; break;
            case 'all': start = 0; break;
        }
        const duration = end - start;
        return { start, end, prevStart: start - duration, prevEnd: start };
    }

    async getKPIs(range: TimeRange): Promise<UsageKPIs> {
        const { start, end, prevStart, prevEnd } = this.rangeToMs(range);
        const [current, prev] = await Promise.all([
            this.repo.sumByRange(start, end),
            this.repo.sumByRange(prevStart, prevEnd),
        ]);
        return {
            totalTokens: current.totalInputTokens + current.totalOutputTokens,
            totalCostUsd: current.totalCostUsd,
            callCount: current.callCount,
            avgDurationMs: current.avgDurationMs,
            p95DurationMs: current.p95DurationMs,
            prevTotalTokens: prev.totalInputTokens + prev.totalOutputTokens,
            prevTotalCostUsd: prev.totalCostUsd,
        };
    }

    async getTokenTrend(range: TimeRange) {
        const { start, end } = this.rangeToMs(range);
        return this.repo.dailyTokensTotal(start, end);
    }

    async getCostTrend(range: TimeRange) {
        const { start, end } = this.rangeToMs(range);
        return this.repo.dailyCostByProvider(start, end);
    }

    async getFeatureDistribution(range: TimeRange) {
        const { start, end } = this.rangeToMs(range);
        return this.repo.groupByFeature(start, end);
    }

    async getModelDistribution(range: TimeRange) {
        const { start, end } = this.rangeToMs(range);
        return this.repo.groupByModel(start, end);
    }

    async getCostBreakdown(range: TimeRange) {
        const { start, end } = this.rangeToMs(range);
        return this.repo.groupByCostProvider(start, end);
    }

    async getDailyBreakdown(range: TimeRange) {
        const { start, end } = this.rangeToMs(range);
        return this.repo.dailyTokensByFeature(start, end);
    }

    async getRecentCalls(range: TimeRange, feature?: string, limit = 100, offset = 0) {
        const { start, end } = this.rangeToMs(range);
        return this.repo.getLogsByRangeFiltered(start, end, feature, limit, offset);
    }
}
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/service/usage/UsageTrackingService.ts
git commit -m "feat(usage): add UsageTrackingService with event subscription and compaction"
```

---

## Task 5: Fix Usage Data Gaps

**Files:**
- Modify: `src/core/providers/vercel/index.ts:31-42`
- Modify: `src/service/agents/vault-sdk/sdkMessageAdapter.ts:134-147`

- [ ] **Step 1: Fix vercelGenerateText to capture usage**

In `src/core/providers/vercel/index.ts`, the `vercelGenerateText()` function (line 31) currently discards usage. Change the function to also capture the `complete` event:

Find the loop (lines 37-41):
```typescript
let text = '';
for await (const event of vercelStreamChat(profile, modelId, { messages, outputControl })) {
    if (event.type === 'text-delta') text += event.text;
}
return text;
```

Replace with:
```typescript
let text = '';
let usage: import('../types').LLMUsage | undefined;
for await (const event of vercelStreamChat(profile, modelId, { messages, outputControl })) {
    if (event.type === 'text-delta') text += event.text;
    else if (event.type === 'complete') usage = event.usage;
}
return { text, usage };
```

Update the return type from `Promise<string>` to `Promise<{ text: string; usage?: import('../types').LLMUsage }>`.

Then find all callers of `vercelGenerateText` and update them to destructure `{ text }` (or `{ text, usage }` when we need usage). The callers are in `service-manager.ts` — search for `vercelGenerateText` to find them.

- [ ] **Step 2: Fix sdkMessageAdapter to map cached/reasoning tokens**

In `src/service/agents/vault-sdk/sdkMessageAdapter.ts`, find the `result` case (around line 134-147). The current usage mapping:

```typescript
usage: {
    inputTokens: msg.usage?.input_tokens ?? 0,
    outputTokens: msg.usage?.output_tokens ?? 0,
    totalTokens: (msg.usage?.input_tokens ?? 0) + (msg.usage?.output_tokens ?? 0),
},
```

Add the missing fields:
```typescript
usage: {
    inputTokens: msg.usage?.input_tokens ?? 0,
    outputTokens: msg.usage?.output_tokens ?? 0,
    totalTokens: (msg.usage?.input_tokens ?? 0) + (msg.usage?.output_tokens ?? 0),
    cachedInputTokens: msg.usage?.cache_read_input_tokens ?? 0,
},
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: No TypeScript errors. Fix any callers of `vercelGenerateText` that break due to the return type change.

- [ ] **Step 4: Run existing tests**

Run: `npm run test`
Expected: All existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/providers/vercel/index.ts src/service/agents/vault-sdk/sdkMessageAdapter.ts
git commit -m "fix(usage): capture usage from vercelGenerateText and map cached tokens in SDK adapter"
```

---

## Task 6: Auto-emit in AIServiceManager

**Files:**
- Modify: `src/service/chat/service-manager.ts:790,826,896,945`

This is the core instrumentation task. Each of the 4 query methods needs to:
1. Record start time
2. Execute the original logic
3. Capture usage from the result
4. Emit `UsageRecordedViewEvent` via EventBus

The methods need a `feature` and `action` parameter so callers can tag what they're doing. Add these as optional fields in the existing `opts` parameter.

- [ ] **Step 1: Add usage emit helper to AIServiceManager**

Add a private helper method to the class (before `queryText` around line 788):

```typescript
import { EventBus, UsageRecordedViewEvent } from '@/core/eventBus';
import { computeUsdFromUsage } from '@/service/search/support/llm-cost-utils';
import type { UsageFeature } from '@/service/usage/types';

// Add to the opts types used by query methods:
interface UsageTagOpts {
    usageFeature?: UsageFeature;
    usageAction?: string;
    usageSessionId?: string;
}

// Add helper method in the class:
private emitUsage(
    usage: LLMUsage | undefined,
    startMs: number,
    isStreaming: boolean,
    tags: UsageTagOpts,
): void {
    if (!usage) return;
    const profile = this.profileRegistry.getActiveAgentProfile();
    if (!profile) return;
    const modelInfo = this.getModelInfo(profile.primaryModel, profile.kind);
    const costUsd = computeUsdFromUsage(usage, modelInfo);
    const eventBus = EventBus.getInstance(this.app);
    eventBus.dispatch(new UsageRecordedViewEvent({
        sessionId: tags.usageSessionId ?? crypto.randomUUID(),
        feature: tags.usageFeature ?? 'internal',
        action: tags.usageAction ?? 'unknown',
        provider: profile.kind,
        model: profile.primaryModel,
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        cachedTokens: usage.cachedInputTokens ?? 0,
        reasoningTokens: usage.reasoningTokens ?? 0,
        costUsd,
        durationMs: Date.now() - startMs,
        isStreaming,
        metadata: undefined,
    }));
}
```

- [ ] **Step 2: Instrument queryText()**

At `service-manager.ts:790`, wrap the method body. Add `UsageTagOpts` to the `opts` parameter type. After the call completes and returns the text, emit usage. The `vercelGenerateText` return type was changed in Task 5 to `{ text, usage }`, so extract usage from there. For the Agent SDK path, extract usage from the stream's `complete` event.

- [ ] **Step 3: Instrument queryTextStream()**

At `service-manager.ts:826`, wrap the generator. After yielding the final `done` event, emit usage from the `complete` event captured during iteration.

- [ ] **Step 4: Instrument queryStream()**

At `service-manager.ts:896`, wrap the generator. Intercept the `complete` event in the stream to capture usage, yield it through, then emit.

- [ ] **Step 5: Instrument queryStructured()**

At `service-manager.ts:945`, wrap the method. Similar to `queryText` — capture usage from the underlying call and emit.

- [ ] **Step 6: Build and test**

Run: `npm run build && npm run test`
Expected: No errors. Existing tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/service/chat/service-manager.ts
git commit -m "feat(usage): auto-emit usage events from AIServiceManager query methods"
```

---

## Task 7: Auto-emit in queryWithProfile & embedClient

**Files:**
- Modify: `src/service/agents/core/sdkAgentPool.ts:131`
- Modify: `src/core/embeddings/embedClient.ts:12`

- [ ] **Step 1: Instrument queryWithProfile**

In `src/service/agents/core/sdkAgentPool.ts`, the `queryWithProfile` generator function (line 131) yields raw SDK messages. Wrap it to intercept `result` messages and emit usage:

After the `for await (const msg of messages)` loop (around line 196-199), intercept messages that have `type === 'result'` and extract `msg.usage`. Emit via EventBus.

Note: `queryWithProfile` doesn't know which feature/action is calling it. Add optional `usageTags?: { feature: UsageFeature; action: string; sessionId?: string }` to the `QueryOptions` interface and thread it through from callers. Callers that don't provide tags will get `feature: 'internal', action: 'unknown'`.

- [ ] **Step 2: Instrument embedClient**

In `src/core/embeddings/embedClient.ts:38`, after `const data = await response.json()`, parse usage and emit:

```typescript
const data = await response.json();

// Emit usage for embedding call
const promptTokens: number = data.usage?.prompt_tokens ?? 0;
if (promptTokens > 0) {
    const eventBus = EventBus.getInstance(AppContext.getInstance().app);
    eventBus.dispatch(new UsageRecordedViewEvent({
        sessionId: crypto.randomUUID(),
        feature: 'indexing',
        action: 'embed',
        provider: profile.kind ?? 'openai',
        model: profile.embeddingModel ?? 'unknown',
        inputTokens: promptTokens,
        outputTokens: 0,
        cachedTokens: 0,
        reasoningTokens: 0,
        costUsd: 0, // embedding costs are negligible; could compute if model-catalog has embedding pricing
        durationMs: Date.now() - startMs,
        isStreaming: false,
    }));
}
```

Add `const startMs = Date.now();` at the beginning of the function.

Note: `embedTexts` needs access to `App` for EventBus. Use `AppContext.getInstance().app` which is available globally.

- [ ] **Step 3: Build and test**

Run: `npm run build && npm run test`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/service/agents/core/sdkAgentPool.ts src/core/embeddings/embedClient.ts
git commit -m "feat(usage): auto-emit usage from queryWithProfile and embedClient"
```

---

## Task 8: Settings & Initialization Wiring

**Files:**
- Modify: `src/app/settings/types.ts:383,447`
- Modify: `main.ts:252`

- [ ] **Step 1: Add settings fields**

In `src/app/settings/types.ts`, add to `MyPluginSettings` interface (around line 383):

```typescript
usageTrackingEnabled: boolean;
usageDetailRetentionDays: number;
```

In `DEFAULT_SETTINGS` (around line 447), add:

```typescript
usageTrackingEnabled: true,
usageDetailRetentionDays: 30,
```

- [ ] **Step 2: Initialize UsageTrackingService in main.ts**

In `main.ts`, inside `initSqlite()` (after `sqliteStoreManager.init` succeeds around line 252), add:

```typescript
await UsageTrackingService.getInstance().init(
    sqliteStoreManager.getDb(),
    this.app,
    {
        usageTrackingEnabled: this.settings.usageTrackingEnabled,
        usageDetailRetentionDays: this.settings.usageDetailRetentionDays,
    },
);
```

Add import at top: `import { UsageTrackingService } from '@/service/usage/UsageTrackingService';`

In the plugin `onunload()` method, add: `UsageTrackingService.getInstance().destroy();`

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/settings/types.ts main.ts
git commit -m "feat(usage): add settings and wire UsageTrackingService into plugin lifecycle"
```

---

## Task 9: Install recharts & Dashboard View Shell

**Files:**
- Create: `src/ui/view/usage-dashboard/UsageDashboardView.ts`
- Create: `src/ui/view/usage-dashboard/UsageDashboard.tsx`
- Modify: `src/app/view/ViewManager.ts:28`

- [ ] **Step 1: Install recharts**

```bash
npm install recharts
```

- [ ] **Step 2: Create the Obsidian ItemView**

Create `src/ui/view/usage-dashboard/UsageDashboardView.ts`:

```typescript
import { ItemView, WorkspaceLeaf, type IconName } from 'obsidian';
import { ReactRenderer } from '@/ui/component/ReactRenderer';
import { UsageDashboard } from './UsageDashboard';
import type { AppContext } from '@/app/AppContext';

export const USAGE_DASHBOARD_VIEW_TYPE = 'peak-usage-dashboard';

export class UsageDashboardView extends ItemView {
    private renderer: ReactRenderer | null = null;

    constructor(leaf: WorkspaceLeaf, private readonly appContext: AppContext) {
        super(leaf);
    }

    getViewType(): string { return USAGE_DASHBOARD_VIEW_TYPE; }
    getDisplayText(): string { return 'Token Usage'; }
    getIcon(): IconName { return 'bar-chart-3'; }

    async onOpen(): Promise<void> {
        this.renderer = new ReactRenderer(this.containerEl.children[1] as HTMLElement);
        this.renderer.render(UsageDashboard, { appContext: this.appContext });
    }

    async onClose(): Promise<void> {
        this.renderer?.unmount();
    }
}
```

- [ ] **Step 3: Create the React root component (skeleton)**

Create `src/ui/view/usage-dashboard/UsageDashboard.tsx`:

```tsx
import React, { useState } from 'react';
import type { AppContext } from '@/app/AppContext';
import type { TimeRange } from '@/service/usage/types';
import { KpiCards } from './components/KpiCards';
import { TrendCharts } from './components/TrendCharts';
import { DistributionCharts } from './components/DistributionCharts';
import { DailyBreakdown } from './components/DailyBreakdown';
import { RecentCallsTable } from './components/RecentCallsTable';
import { useUsageData } from './hooks/useUsageData';

const TIME_RANGES: Array<{ label: string; value: TimeRange }> = [
    { label: 'Today', value: 'today' },
    { label: '7 Days', value: '7d' },
    { label: '30 Days', value: '30d' },
    { label: 'All Time', value: 'all' },
];

export function UsageDashboard({ appContext }: { appContext: AppContext }) {
    const [range, setRange] = useState<TimeRange>('7d');
    const data = useUsageData(range);

    return (
        <div className="p-6 space-y-5 overflow-y-auto h-full">
            {/* Header */}
            <div className="flex items-center justify-between">
                <span className="text-lg font-semibold">Token Usage</span>
                <div className="flex gap-1 bg-[--background-secondary] rounded-lg p-0.5">
                    {TIME_RANGES.map((r) => (
                        <button
                            key={r.value}
                            onClick={() => setRange(r.value)}
                            className={`px-3 py-1 text-xs rounded-md transition-colors ${
                                range === r.value
                                    ? 'bg-[--interactive-accent] text-[--text-on-accent] font-semibold'
                                    : 'text-[--text-muted] hover:text-[--text-normal]'
                            }`}
                        >
                            {r.label}
                        </button>
                    ))}
                </div>
            </div>

            <KpiCards kpis={data.kpis} />
            <TrendCharts tokenTrend={data.tokenTrend} costTrend={data.costTrend} />
            <DistributionCharts
                featureDist={data.featureDist}
                modelDist={data.modelDist}
                costBreakdown={data.costBreakdown}
            />
            <DailyBreakdown data={data.dailyBreakdown} />
            <RecentCallsTable calls={data.recentCalls} range={range} />
        </div>
    );
}
```

- [ ] **Step 4: Register view in ViewManager**

In `src/app/view/ViewManager.ts`, add import and registration:

```typescript
import { UsageDashboardView, USAGE_DASHBOARD_VIEW_TYPE } from '@/ui/view/usage-dashboard/UsageDashboardView';
```

In the constructor, add:
```typescript
this.viewCreators.set(USAGE_DASHBOARD_VIEW_TYPE, (leaf) => new UsageDashboardView(leaf, appContext));
```

- [ ] **Step 5: Build to verify**

Run: `npm run build`
Expected: Will fail because child components don't exist yet — that's fine, this verifies the shell compiles. Create empty placeholder files for each component/hook if needed to unblock the build.

- [ ] **Step 6: Commit**

```bash
git add src/ui/view/usage-dashboard/ src/app/view/ViewManager.ts package.json package-lock.json
git commit -m "feat(usage): add dashboard view shell with recharts and register in ViewManager"
```

---

## Task 10: Data Fetching Hook

**Files:**
- Create: `src/ui/view/usage-dashboard/hooks/useUsageData.ts`

- [ ] **Step 1: Create the hook**

Create `src/ui/view/usage-dashboard/hooks/useUsageData.ts`:

```typescript
import { useState, useEffect } from 'react';
import { UsageTrackingService } from '@/service/usage/UsageTrackingService';
import type { TimeRange, UsageKPIs } from '@/service/usage/types';

interface UsageData {
    kpis: UsageKPIs | null;
    tokenTrend: Array<{ date: string; input_tokens: number; output_tokens: number; total_tokens: number }>;
    costTrend: Array<{ date: string; provider: string; cost: number }>;
    featureDist: Array<{ feature: string; tokens: number; cost: number }>;
    modelDist: Array<{ provider: string; model: string; tokens: number }>;
    costBreakdown: Array<{ provider: string; cost: number }>;
    dailyBreakdown: Array<{ date: string; feature: string; tokens: number; cost: number; calls: number }>;
    recentCalls: Array<import('@/core/storage/sqlite/ddl').UsageLogRow>;
    loading: boolean;
}

export function useUsageData(range: TimeRange): UsageData {
    const [data, setData] = useState<UsageData>({
        kpis: null,
        tokenTrend: [],
        costTrend: [],
        featureDist: [],
        modelDist: [],
        costBreakdown: [],
        dailyBreakdown: [],
        recentCalls: [],
        loading: true,
    });

    useEffect(() => {
        let cancelled = false;
        const svc = UsageTrackingService.getInstance();

        async function load() {
            setData((prev) => ({ ...prev, loading: true }));
            const [kpis, tokenTrend, costTrend, featureDist, modelDist, costBreakdown, dailyBreakdown, recentCalls] =
                await Promise.all([
                    svc.getKPIs(range),
                    svc.getTokenTrend(range),
                    svc.getCostTrend(range),
                    svc.getFeatureDistribution(range),
                    svc.getModelDistribution(range),
                    svc.getCostBreakdown(range),
                    svc.getDailyBreakdown(range),
                    svc.getRecentCalls(range),
                ]);
            if (cancelled) return;
            setData({ kpis, tokenTrend, costTrend, featureDist, modelDist, costBreakdown, dailyBreakdown, recentCalls, loading: false });
        }

        void load();
        return () => { cancelled = true; };
    }, [range]);

    return data;
}
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/usage-dashboard/hooks/useUsageData.ts
git commit -m "feat(usage): add useUsageData hook for dashboard data fetching"
```

---

## Task 11: Dashboard UI — KPI Cards + Charts

**Files:**
- Create: `src/ui/view/usage-dashboard/components/KpiCards.tsx`
- Create: `src/ui/view/usage-dashboard/components/TrendCharts.tsx`
- Create: `src/ui/view/usage-dashboard/components/DistributionCharts.tsx`
- Create: `src/ui/view/usage-dashboard/components/DailyBreakdown.tsx`

- [ ] **Step 1: Create KpiCards**

Create `src/ui/view/usage-dashboard/components/KpiCards.tsx`:

```tsx
import React from 'react';
import type { UsageKPIs } from '@/service/usage/types';

function formatTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
}

function formatUsd(n: number): string {
    return `$${n.toFixed(2)}`;
}

function formatMs(ms: number): string {
    return `${(ms / 1000).toFixed(1)}s`;
}

function pctChange(current: number, prev: number): { text: string; isUp: boolean } | null {
    if (prev === 0) return null;
    const pct = ((current - prev) / prev) * 100;
    return { text: `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%`, isUp: pct > 0 };
}

export function KpiCards({ kpis }: { kpis: UsageKPIs | null }) {
    if (!kpis) return <div className="grid grid-cols-4 gap-3.5">{Array.from({ length: 4 }, (_, i) =>
        <div key={i} className="bg-[--background-secondary] border border-[--background-modifier-border] rounded-lg p-4 animate-pulse h-24" />
    )}</div>;

    const tokenChange = pctChange(kpis.totalTokens, kpis.prevTotalTokens);
    const costChange = pctChange(kpis.totalCostUsd, kpis.prevTotalCostUsd);

    const cards = [
        { label: 'TOTAL TOKENS', value: formatTokens(kpis.totalTokens), change: tokenChange },
        { label: 'ESTIMATED COST', value: formatUsd(kpis.totalCostUsd), change: costChange, isCost: true },
        { label: 'API CALLS', value: String(kpis.callCount), sub: `avg ${Math.round(kpis.callCount / 7)}/day` },
        { label: 'AVG LATENCY', value: formatMs(kpis.avgDurationMs), sub: `p95: ${formatMs(kpis.p95DurationMs)}` },
    ];

    return (
        <div className="grid grid-cols-4 gap-3.5">
            {cards.map((c) => (
                <div key={c.label} className="bg-[--background-secondary] border border-[--background-modifier-border] rounded-lg p-4">
                    <span className="text-[11px] text-[--text-muted] uppercase tracking-wider">{c.label}</span>
                    <span className={`block text-2xl font-bold mt-1 ${c.isCost ? 'text-[#f9e2af]' : ''}`}>{c.value}</span>
                    {c.change && (
                        <span className={`text-xs ${c.change.isUp ? 'text-[#f38ba8]' : 'text-[#a6e3a1]'}`}>
                            {c.change.text} vs last period
                        </span>
                    )}
                    {c.sub && <span className="text-xs text-[--text-muted]">{c.sub}</span>}
                </div>
            ))}
        </div>
    );
}
```

- [ ] **Step 2: Create TrendCharts**

Create `src/ui/view/usage-dashboard/components/TrendCharts.tsx`:

```tsx
import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';

const FEATURE_COLORS: Record<string, string> = {
    anthropic: '#89b4fa', openai: '#a6e3a1', google: '#f9e2af',
    ollama: '#cba6f7', openrouter: '#f38ba8', perplexity: '#94e2d5',
};

function formatTokenAxis(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return String(n);
}

export function TrendCharts({
    tokenTrend,
    costTrend,
}: {
    tokenTrend: Array<{ date: string; input_tokens: number; output_tokens: number; total_tokens: number }>;
    costTrend: Array<{ date: string; provider: string; cost: number }>;
}) {
    // Pivot costTrend: group by date, providers as columns
    const providers = [...new Set(costTrend.map((r) => r.provider))];
    const costByDate = new Map<string, Record<string, number>>();
    for (const r of costTrend) {
        const existing = costByDate.get(r.date) ?? { date: r.date };
        existing[r.provider] = r.cost;
        costByDate.set(r.date, existing);
    }
    const costData = [...costByDate.values()];

    return (
        <div className="grid grid-cols-2 gap-3.5">
            {/* Token Usage Trend */}
            <div className="bg-[--background-secondary] border border-[--background-modifier-border] rounded-lg p-4">
                <span className="text-sm font-semibold mb-3 block">Token Usage Trend</span>
                <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={tokenTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--background-modifier-border)" />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                        <YAxis tickFormatter={formatTokenAxis} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                        <Tooltip />
                        <Area type="monotone" dataKey="total_tokens" stroke="#89b4fa" fill="#89b4fa" fillOpacity={0.1} strokeWidth={2} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {/* Cost Trend */}
            <div className="bg-[--background-secondary] border border-[--background-modifier-border] rounded-lg p-4">
                <span className="text-sm font-semibold mb-3 block">Cost Trend</span>
                <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={costData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--background-modifier-border)" />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                        <YAxis tickFormatter={(v: number) => `$${v.toFixed(2)}`} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                        <Tooltip />
                        {providers.map((p) => (
                            <Line key={p} type="monotone" dataKey={p} stroke={FEATURE_COLORS[p] ?? '#89b4fa'} strokeWidth={2} dot={false} />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
                <div className="flex gap-4 mt-2 justify-end">
                    {providers.map((p) => (
                        <span key={p} className="flex items-center gap-1 text-[11px] text-[--text-muted]">
                            <span className="w-2 h-2 rounded-full" style={{ background: FEATURE_COLORS[p] ?? '#89b4fa' }} />
                            {p}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 3: Create DistributionCharts**

Create `src/ui/view/usage-dashboard/components/DistributionCharts.tsx`:

```tsx
import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

const FEATURE_COLORS: Record<string, string> = {
    chat: '#89b4fa', search_analysis: '#a6e3a1', copilot: '#f9e2af',
    graph: '#f38ba8', indexing: '#cba6f7', internal: '#94e2d5',
};
const PROVIDER_COLORS: Record<string, string> = {
    anthropic: '#89b4fa', openai: '#a6e3a1', google: '#f9e2af',
    ollama: '#cba6f7', openrouter: '#f38ba8', perplexity: '#94e2d5',
};
const FALLBACK_COLORS = ['#89b4fa', '#a6e3a1', '#f9e2af', '#f38ba8', '#cba6f7', '#94e2d5', '#b4befe', '#fab387'];

function formatTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return String(n);
}

function DonutCard({
    title,
    data,
    colorMap,
}: {
    title: string;
    data: Array<{ name: string; value: number; label: string }>;
    colorMap: Record<string, string>;
}) {
    return (
        <div className="bg-[--background-secondary] border border-[--background-modifier-border] rounded-lg p-4">
            <span className="text-sm font-semibold mb-3 block">{title}</span>
            <div className="flex items-center gap-4">
                <ResponsiveContainer width={120} height={120}>
                    <PieChart>
                        <Pie data={data} dataKey="value" cx="50%" cy="50%" innerRadius={30} outerRadius={50} paddingAngle={2}>
                            {data.map((entry, i) => (
                                <Cell key={entry.name} fill={colorMap[entry.name] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]} />
                            ))}
                        </Pie>
                    </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-1.5">
                    {data.map((entry, i) => (
                        <div key={entry.name} className="flex items-center gap-1.5 text-xs">
                            <span className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ background: colorMap[entry.name] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length] }} />
                            <span className="truncate max-w-[100px]">{entry.name}</span>
                            <span className="ml-auto text-[--text-muted] tabular-nums">{entry.label}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export function DistributionCharts({
    featureDist,
    modelDist,
    costBreakdown,
}: {
    featureDist: Array<{ feature: string; tokens: number; cost: number }>;
    modelDist: Array<{ provider: string; model: string; tokens: number }>;
    costBreakdown: Array<{ provider: string; cost: number }>;
}) {
    return (
        <div className="grid grid-cols-3 gap-3.5">
            <DonutCard
                title="By Feature"
                data={featureDist.map((r) => ({ name: r.feature, value: r.tokens, label: formatTokens(r.tokens) }))}
                colorMap={FEATURE_COLORS}
            />
            <DonutCard
                title="By Provider & Model"
                data={modelDist.map((r) => ({ name: `${r.model}`, value: r.tokens, label: formatTokens(r.tokens) }))}
                colorMap={PROVIDER_COLORS}
            />
            <DonutCard
                title="Cost Breakdown"
                data={costBreakdown.map((r) => ({ name: r.provider, value: r.cost, label: `$${r.cost.toFixed(2)}` }))}
                colorMap={PROVIDER_COLORS}
            />
        </div>
    );
}
```

- [ ] **Step 4: Create DailyBreakdown**

Create `src/ui/view/usage-dashboard/components/DailyBreakdown.tsx`:

```tsx
import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const FEATURE_COLORS: Record<string, string> = {
    chat: '#89b4fa', search_analysis: '#a6e3a1', copilot: '#f9e2af',
    graph: '#f38ba8', indexing: '#cba6f7', internal: '#94e2d5',
};

export function DailyBreakdown({
    data,
}: {
    data: Array<{ date: string; feature: string; tokens: number; cost: number; calls: number }>;
}) {
    // Pivot: each date is a row, features are columns
    const features = [...new Set(data.map((r) => r.feature))];
    const byDate = new Map<string, Record<string, number>>();
    for (const r of data) {
        const existing = byDate.get(r.date) ?? { date: r.date };
        existing[r.feature] = (existing[r.feature] ?? 0) + r.tokens;
        byDate.set(r.date, existing);
    }
    const chartData = [...byDate.values()];

    return (
        <div className="bg-[--background-secondary] border border-[--background-modifier-border] rounded-lg p-4">
            <span className="text-sm font-semibold mb-3 block">Daily Breakdown</span>
            <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--background-modifier-border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {features.map((f) => (
                        <Bar key={f} dataKey={f} stackId="a" fill={FEATURE_COLORS[f] ?? '#89b4fa'} maxBarSize={48} />
                    ))}
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
```

- [ ] **Step 5: Build to verify**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/ui/view/usage-dashboard/components/
git commit -m "feat(usage): add KPI cards, trend charts, distribution donuts, daily breakdown components"
```

---

## Task 12: Dashboard UI — Recent Calls Table

**Files:**
- Create: `src/ui/view/usage-dashboard/components/RecentCallsTable.tsx`

- [ ] **Step 1: Create the table component**

Create `src/ui/view/usage-dashboard/components/RecentCallsTable.tsx`:

```tsx
import React, { useState } from 'react';
import type { UsageLogRow } from '@/core/storage/sqlite/ddl';
import type { TimeRange } from '@/service/usage/types';
import { UsageTrackingService } from '@/service/usage/UsageTrackingService';
import { Button } from '@/ui/component/shadcn/button';

const FEATURE_BADGE_CLASSES: Record<string, string> = {
    chat: 'bg-[#89b4fa]/15 text-[#89b4fa]',
    search_analysis: 'bg-[#a6e3a1]/15 text-[#a6e3a1]',
    copilot: 'bg-[#f9e2af]/15 text-[#f9e2af]',
    graph: 'bg-[#f38ba8]/15 text-[#f38ba8]',
    indexing: 'bg-[#cba6f7]/15 text-[#cba6f7]',
    internal: 'bg-[#94e2d5]/15 text-[#94e2d5]',
};

const FILTERS = ['All', 'chat', 'search_analysis', 'copilot', 'graph', 'indexing'] as const;

function formatTime(ms: number): string {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatTokens(n: number): string {
    return n.toLocaleString();
}

export function RecentCallsTable({ calls: initialCalls, range }: { calls: UsageLogRow[]; range: TimeRange }) {
    const [filter, setFilter] = useState<string>('All');
    const [calls, setCalls] = useState(initialCalls);

    React.useEffect(() => { setCalls(initialCalls); }, [initialCalls]);

    const handleFilter = async (f: string) => {
        setFilter(f);
        const svc = UsageTrackingService.getInstance();
        const result = await svc.getRecentCalls(range, f === 'All' ? undefined : f);
        setCalls(result);
    };

    return (
        <div className="bg-[--background-secondary] border border-[--background-modifier-border] rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold">Recent Calls</span>
                <div className="flex gap-2">
                    {FILTERS.map((f) => (
                        <Button
                            key={f}
                            variant="outline"
                            size="sm"
                            onClick={() => void handleFilter(f)}
                            className={`text-xs h-7 ${filter === f ? 'border-[--interactive-accent] text-[--interactive-accent]' : ''}`}
                        >
                            {f === 'search_analysis' ? 'Search' : f.charAt(0).toUpperCase() + f.slice(1)}
                        </Button>
                    ))}
                </div>
            </div>
            <table className="w-full text-[13px]">
                <thead>
                    <tr className="border-b border-[--background-modifier-border]">
                        <th className="text-left p-2 text-[--text-muted] font-medium text-xs">Time</th>
                        <th className="text-left p-2 text-[--text-muted] font-medium text-xs">Feature</th>
                        <th className="text-left p-2 text-[--text-muted] font-medium text-xs">Action</th>
                        <th className="text-left p-2 text-[--text-muted] font-medium text-xs">Provider / Model</th>
                        <th className="text-right p-2 text-[--text-muted] font-medium text-xs">Input</th>
                        <th className="text-right p-2 text-[--text-muted] font-medium text-xs">Output</th>
                        <th className="text-right p-2 text-[--text-muted] font-medium text-xs">Cost</th>
                        <th className="text-right p-2 text-[--text-muted] font-medium text-xs">Latency</th>
                    </tr>
                </thead>
                <tbody>
                    {calls.map((c) => (
                        <tr key={c.id} className="border-b border-[--background-modifier-border]/50 hover:bg-[--background-modifier-hover]">
                            <td className="p-2 text-[--text-muted]">{formatTime(c.created_at)}</td>
                            <td className="p-2">
                                <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${FEATURE_BADGE_CLASSES[c.feature] ?? ''}`}>
                                    {c.feature}
                                </span>
                            </td>
                            <td className="p-2">{c.action}</td>
                            <td className="p-2 font-mono text-xs">{c.provider} / {c.model}</td>
                            <td className="p-2 text-right font-mono text-xs">{formatTokens(c.input_tokens)}</td>
                            <td className="p-2 text-right font-mono text-xs">{c.output_tokens > 0 ? formatTokens(c.output_tokens) : '—'}</td>
                            <td className="p-2 text-right font-mono text-xs text-[#f9e2af]">${c.cost_usd.toFixed(3)}</td>
                            <td className="p-2 text-right font-mono text-xs">{(c.duration_ms / 1000).toFixed(1)}s</td>
                        </tr>
                    ))}
                    {calls.length === 0 && (
                        <tr><td colSpan={8} className="p-8 text-center text-[--text-muted]">No usage data yet</td></tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/usage-dashboard/components/RecentCallsTable.tsx
git commit -m "feat(usage): add Recent Calls table with feature filtering"
```

---

## Task 13: Commands & Final Wiring

**Files:**
- Modify: `src/app/commands/` (find the command registration file)
- Modify: `main.ts` or command builder

- [ ] **Step 1: Register "Open Usage Dashboard" command**

Find the command registration pattern (in `buildCoreCommands` or similar). Add:

```typescript
plugin.addCommand({
    id: 'open-usage-dashboard',
    name: 'Open Usage Dashboard',
    callback: () => {
        const leaf = app.workspace.getLeaf('tab');
        void leaf.setViewState({ type: USAGE_DASHBOARD_VIEW_TYPE, active: true });
    },
});
```

Import `USAGE_DASHBOARD_VIEW_TYPE` from `@/ui/view/usage-dashboard/UsageDashboardView`.

- [ ] **Step 2: Build full project**

Run: `npm run build`
Expected: Clean build, no errors.

- [ ] **Step 3: Run all tests**

Run: `npm run test`
Expected: All existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(usage): register Open Usage Dashboard command"
```

---

## Task 14: Manual Testing & Polish

- [ ] **Step 1: Load plugin in Obsidian**

Reload the plugin in Obsidian. Open DevTools console, check for errors.

- [ ] **Step 2: Open dashboard**

Run command "Peak Assistant: Open Usage Dashboard". Verify:
- View opens in a new tab
- Header shows with time range buttons
- KPI cards show (may be all zeros if no data yet)
- Charts render without errors
- Table shows "No usage data yet"

- [ ] **Step 3: Generate some usage data**

Send a chat message, run a copilot action, trigger a search. Then:
- Switch to dashboard and refresh (close/reopen view)
- Verify KPI cards update
- Verify charts show data points
- Verify table shows recent calls with correct feature badges

- [ ] **Step 4: Verify time range switching**

Click Today → 7 Days → 30 Days → All Time. Verify data changes accordingly.

- [ ] **Step 5: Verify feature filtering**

In the Recent Calls table, click different filter buttons. Verify table rows filter correctly.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat(usage): token usage dashboard complete"
```
