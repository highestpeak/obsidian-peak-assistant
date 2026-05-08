# Token Usage Dashboard — Design Spec

## Overview

A unified token usage tracking and statistics system that records every AI API call across all features (Chat, Search & Analysis, Copilot, Graph, Indexing, Internal), persists to SQLite, and presents an interactive dashboard View within the Obsidian plugin. Supports configurable retention with automatic daily aggregation of expired detail records.

## Architecture

### Event Bus Pattern (Pub-Sub)

```
AIServiceManager.queryText()        ──→ auto-emit ──→ 'usage-recorded' event
AIServiceManager.queryTextStream()  ──→ auto-emit ──→ 'usage-recorded' event
AIServiceManager.queryStream()      ──→ auto-emit ──→ 'usage-recorded' event
AIServiceManager.queryStructured()  ──→ auto-emit ──→ 'usage-recorded' event
sdkAgentPool.queryWithProfile()     ──→ auto-emit ──→ 'usage-recorded' event
embedClient.embedTexts()            ──→ manual emit ──→ 'usage-recorded' event
                                                          │
                                                          ▼
                                                   UsageTrackingService
                                                          │
                                                          ▼
                                                   usage_log (SQLite)
```

- The 5 canonical AI call methods (`queryText`, `queryTextStream`, `queryStream`, `queryStructured`, `queryWithProfile`) auto-emit `usage-recorded` events after each call completes. Callers do not need to change.
- `embedClient.embedTexts()` bypasses `AIServiceManager` — needs manual emit at `src/core/embeddings/embedClient.ts`.
- Cost is computed at emit time in the auto-emit wrappers via `computeUsdFromUsage()` + model-catalog pricing, and included in the event payload. `UsageTrackingService` simply persists the payload to `usage_log`.
- Any future call path that bypasses the above 6 points only needs to add one `emit('usage-recorded', payload)` line.

### Event Payload

```typescript
interface UsageRecordedEvent {
  sessionId: string;         // groups calls from the same user action (e.g., chat + title_gen + summary)
  feature: UsageFeature;     // 'chat' | 'search_analysis' | 'copilot' | 'graph' | 'indexing' | 'internal'
  action: string;            // specific action: 'chat_stream', 'title_gen', 'vault_search', 'summarize', 'embed', etc.
  provider: string;          // 'anthropic' | 'openai' | 'google' | 'ollama' | 'openrouter' | 'perplexity' | 'custom'
  model: string;             // 'claude-sonnet-4-20250514', 'gpt-4o', etc.
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;     // cached input tokens (Anthropic)
  reasoningTokens?: number;  // extended thinking tokens
  costUsd: number;           // pre-computed from model-catalog pricing
  durationMs: number;
  isStreaming: boolean;
  metadata?: Record<string, unknown>;  // optional: conversationId, promptId, etc.
}
```

### Feature Taxonomy

| Feature | `feature` value | Included actions |
|---------|----------------|-----------------|
| Chat | `chat` | `chat_stream`, `title_gen`, `summary_gen`, `topic_aggregation`, `suggest_followups`, `user_profile` |
| Search & Analysis | `search_analysis` | `vault_search`, `continue_analysis`, `followup_chat`, `doc_simple`, `report_section`, `report_summary`, `report_mermaid_fix`, `synthesize`, `llm_rerank` |
| Copilot | `copilot` | `summarize`, `translate`, `polish`, `review`, `extract_concepts`, `suggest_links`, `suggest_split`, `suggest_tags`, `knowledge_gaps`, `vault_health`, `add_evidence`, `continue_writing`, `rewrite_selection`, `synthesize_topic` |
| Graph | `graph` | `graph_agent`, `thinking_tree`, `hub_semantic_merge`, `hub_doc_summary` |
| Indexing | `indexing` | `doc_tags`, `doc_summary`, `image_summary`, `image_description`, `embed`, `knowledge_intuition_plan`, `knowledge_intuition_submit` |
| Internal | `internal` | `pattern_discovery` |

## Data Model

### `usage_log` table (chat.sqlite) — Detail Records

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

CREATE INDEX idx_usage_log_created_at ON usage_log(created_at);
CREATE INDEX idx_usage_log_feature ON usage_log(feature);
CREATE INDEX idx_usage_log_session ON usage_log(session_id);
```

### `usage_daily` table (chat.sqlite) — Aggregated Records

```sql
CREATE TABLE IF NOT EXISTS usage_daily (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  date                  TEXT NOT NULL,
  feature               TEXT NOT NULL,
  action                TEXT NOT NULL,
  provider              TEXT NOT NULL,
  model                 TEXT NOT NULL,
  call_count            INTEGER NOT NULL DEFAULT 0,
  total_input_tokens    INTEGER NOT NULL DEFAULT 0,
  total_output_tokens   INTEGER NOT NULL DEFAULT 0,
  total_cached_tokens   INTEGER NOT NULL DEFAULT 0,
  total_reasoning_tokens INTEGER NOT NULL DEFAULT 0,
  total_cost_usd        REAL NOT NULL DEFAULT 0,
  avg_duration_ms       REAL NOT NULL DEFAULT 0,
  max_duration_ms       INTEGER NOT NULL DEFAULT 0,
  UNIQUE(date, feature, action, provider, model)
);

CREATE INDEX idx_usage_daily_date ON usage_daily(date);
```

### Retention Strategy

- Setting: `usageDetailRetentionDays` (default: 30)
- Compaction runs on plugin startup + once per day (24h interval)
- Process:
  1. SELECT from `usage_log` WHERE `created_at < now - retentionDays`
  2. GROUP BY `date(created_at) × feature × action × provider × model`
  3. UPSERT into `usage_daily` (merge with any existing row for same key)
  4. DELETE compacted rows from `usage_log`
- `usage_daily` is never purged (minimal data: ~30-50 rows/day max)

## UI Design

### Entry Points

1. **Independent View** — registered as `peak-usage-dashboard`, accessible from sidebar leaf
2. **Command** — "Peak Assistant: Open Usage Dashboard" opens the view
3. **Quick Modal** (optional) — command "Peak Assistant: Usage Summary" shows a lightweight modal with today's KPI cards

### Dashboard Layout

The view is a single scrollable page, React-based, following the existing view architecture (`ItemView` subclass with React root).

#### Row 1: KPI Cards (4 cards)

| Card | Value | Subtext |
|------|-------|---------|
| Total Tokens | formatted count (e.g., "1.24M") | % change vs previous period |
| Estimated Cost | USD (e.g., "$3.47") | % change vs previous period |
| API Calls | count | avg per day |
| Avg Latency | seconds (e.g., "1.8s") | p95 value |

- Time range selector in header: Today / 7 Days / 30 Days / All Time
- "vs previous period" compares against the equivalent prior window (e.g., 7 days vs prior 7 days)

#### Row 2: Two Line Charts (side by side, equal width)

**Left: Token Usage Trend**
- Daily granularity, area-filled line chart
- Toggle: Total / Input / Output
- X-axis: dates; Y-axis: token count

**Right: Cost Trend**
- Daily granularity, multi-line (one per provider)
- Toggle: By Provider / Total
- Legend below chart showing line style per provider (solid/dashed/dotted)

#### Row 3: Three Donut Charts (side by side, equal width)

| Chart | Dimension | Legend values |
|-------|-----------|--------------|
| By Feature | Token distribution across 6 features | absolute token counts |
| By Provider & Model | Token distribution across provider×model | absolute token counts |
| Cost Breakdown | Cost distribution across providers | USD amounts |

Each donut has an adjacent legend with colored dots and values.

#### Row 4: Daily Breakdown (full width)

- Stacked bar chart, one bar per day, colored by feature
- Toggle: Tokens / Cost / Calls (switches the Y-axis metric)
- Bottom legend showing feature colors
- Bar height: 200px, max bar width: 48px

#### Row 5: Recent Calls Table (full width)

- Columns: Time, Feature (badge), Action, Provider/Model, Input tokens, Output tokens, Cost, Latency
- Feature filter buttons: All / Chat / Search / Copilot / Graph / Indexing
- Rows from `usage_log`, newest first, paginated or virtual-scrolled
- Feature badges use distinct colors matching the donut chart palette
- Clicking a `session_id` group expands to show all calls in that session

### Color Palette

Consistent across all charts:

| Feature/Provider | CSS Variable | Color |
|-----------------|-------------|-------|
| Chat | `--accent` | #89b4fa |
| Search & Analysis | `--accent2` | #a6e3a1 |
| Copilot | `--accent3` | #f9e2af |
| Graph | `--accent4` | #f38ba8 |
| Indexing | `--accent5` | #cba6f7 |
| Internal | `--accent6` | #94e2d5 |

## Service Layer

### UsageTrackingService

Location: `src/service/usage/UsageTrackingService.ts`

Responsibilities:
- Subscribe to `usage-recorded` events
- Write to `usage_log` table
- Run daily compaction (startup + 24h interval)
- Provide query methods for the dashboard:
  - `getKPIs(range: TimeRange): Promise<UsageKPIs>`
  - `getTokenTrend(range: TimeRange): Promise<DailyTokenPoint[]>`
  - `getCostTrend(range: TimeRange): Promise<DailyCostPoint[]>`
  - `getFeatureDistribution(range: TimeRange): Promise<FeatureBreakdown[]>`
  - `getModelDistribution(range: TimeRange): Promise<ModelBreakdown[]>`
  - `getCostBreakdown(range: TimeRange): Promise<CostBreakdown[]>`
  - `getDailyBreakdown(range: TimeRange, metric: 'tokens'|'cost'|'calls'): Promise<DailyBreakdownPoint[]>`
  - `getRecentCalls(filter: CallFilter, page: number): Promise<UsageLogEntry[]>`

### UsageLogRepo

Location: `src/core/storage/sqlite/repositories/UsageLogRepo.ts`

Kysely-based repository following existing repo patterns (e.g., `ChatMessageRepo`). Handles all SQL for `usage_log` and `usage_daily` tables.

### Integration Points — Auto-emit Locations

| Method | File | What to add |
|--------|------|------------|
| `queryText()` | `src/service/chat/service-manager.ts:803` | Wrap return to capture usage + emit |
| `queryTextStream()` | `src/service/chat/service-manager.ts:839` | Intercept `complete` event in stream, emit |
| `queryStream()` | `src/service/chat/service-manager.ts:910` | Intercept `complete` event in stream, emit |
| `queryStructured()` | `src/service/chat/service-manager.ts:959` | Wrap return to capture usage + emit |
| `queryWithProfile()` | `src/service/agents/core/sdkAgentPool.ts` | Intercept `result` message usage, emit |
| `embedTexts()` | `src/core/embeddings/embedClient.ts:12` | Parse `response.usage.prompt_tokens` from API response, emit |

### Gaps to Fix

1. **`vercelGenerateText()` discards usage** — `src/core/providers/vercel/index.ts:31` iterates stream events but drops usage. Must capture and return it.
2. **Agent SDK missing cache/reasoning tokens** — `src/service/agents/vault-sdk/sdkMessageAdapter.ts:134-146` only maps `input_tokens`/`output_tokens`. Add `cache_read_input_tokens` → `cachedTokens` and thinking tokens → `reasoningTokens`.
3. **Embedding response usage not parsed** — `src/core/embeddings/embedClient.ts:39` only reads `data[].embedding`. Add parsing of `usage.prompt_tokens` from OpenAI embedding API response.

## Settings

Add to existing settings UI under a "Usage Tracking" section:

| Setting | Key | Type | Default | Description |
|---------|-----|------|---------|-------------|
| Enable Usage Tracking | `usageTrackingEnabled` | boolean | true | Master toggle |
| Detail Retention | `usageDetailRetentionDays` | number | 30 | Days to keep per-call detail records before compacting to daily aggregates |

## Initialization Order

In `main.ts` plugin `onload()`, `UsageTrackingService` initializes after SQLite is ready and before `AppContext`:

```
TemplateManager → AIServiceManager → DocumentLoaderManager → SQLite
  → UsageTrackingService (new — subscribes to events, runs compaction)
  → SearchService → AppContext → ViewManager → Commands/Events
```

## Mockup Reference

Visual mockup saved at: `.superpowers/brainstorm/85527-1778205143/content/panel-mockup-v4.html`
