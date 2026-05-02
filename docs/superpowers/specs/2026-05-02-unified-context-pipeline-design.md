# Unified Context Pipeline Design Spec

> **Date**: 2026-05-02
> **Status**: Draft
> **Scope**: Replace ContextBuilder with ContextPipeline; add unified activity tracking (SessionContextService); add dynamic context discovery tools; refactor context assembly for Chat, AI Analysis, Copilot, Followup, and Ambient Push

---

## Problem

The current context management is fragmented across three isolated systems:

| System | Context Source | Knows | Doesn't Know |
|--------|---------------|-------|--------------|
| **Chat** (`ContextBuilder`) | Last 10 messages + conversation summary + user profile | Current conversation | Recent searches, copilot actions, open files |
| **AI Analysis** (`VaultSearchAgentSDK`) | Vault intuitions + probe hits + round history | Current search session | Chat history, copilot results |
| **Copilot** (`copilot-commands`) | Active file + selection | Current file | Why user opened it, chat context, search results |

Specific gaps:

1. **Chat → AI Analysis blind**: user finishes an analysis, switches to chat to continue — LLM has zero knowledge of the analysis (`ai_analysis_record` stored but never read for context)
2. **AI Analysis → Chat blind**: user discusses topic in chat, then searches — VaultSearchAgent's probe can't leverage chat clues
3. **Copilot fire-and-forget**: polish/review/split/tag results don't feed back to any system
4. **Ambient Push blindly recommends**: doesn't know what user is actively working on in chat
5. **10-message hard cutoff**: `DEFAULT_TOKEN_BUDGET = 16000` declared but never enforced; no intelligent compression
6. **~10 Zustand stores with zero cross-communication**: `useChatDataStore`, `useSearchSessionStore`, `useAmbientPushStore` each manage their own reality
7. **`mobius_operation` write-only**: records AI analysis operations but has zero readers
8. **`ambient_push_log.getDismissedPairs()` dead code**: defined but never called

The current `ContextBuilder` (`src/service/chat/context/ContextBuilder.ts`) is a hardcoded 4-step sequence with no token budget enforcement, no relevance scoring, and no cross-feature awareness:
```
1. SystemPrompt (always)
2. UserProfile (always if enabled)
3. ContextMemory (always — project/conversation summaries)
4. RecentMessages (last 10, always)
```

## Design Goals

1. **Cross-feature coherence**: any LLM interaction (chat, analysis, copilot, agent) can access a unified view of what the user has been doing
2. **Token budget governance**: each context element has a priority and max allocation; budget overflow triggers compression, not silent dropping
3. **Dynamic context discovery**: large context (analysis results, file content) is not stuffed into the window — agents pull it on demand via tools
4. **Scenario-adaptive priorities**: the same context slot has different importance in chat vs copilot vs analysis
5. **Multi-layer compression**: cheapest strategies first (truncate → rule-compress → LLM summarize)
6. **Crash-resilient**: all activity persisted to SQLite immediately, in-memory views are reconstructable

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     SessionContextService                    │
│  (singleton — listens to EventBus, writes mobius_operation,  │
│   maintains in-memory WorkingContext, rebuilds from SQLite)   │
└──────────────┬──────────────────────────────┬────────────────┘
               │ events in                    │ context out
               │                              │
    ┌──────────┴──────────┐       ┌───────────┴───────────┐
    │      Producers       │       │      ContextPipeline   │
    │ (Chat, Copilot,     │       │  (replaces ContextBuilder│
    │  Analysis, FileOpen, │       │   — Slot + Profile +    │
    │  Ambient, etc.)      │       │   BudgetGovernor)       │
    └─────────────────────┘       └───────────┬───────────┘
                                              │
                                   ┌──────────┴──────────┐
                                   │    Consumers          │
                                   │ Chat ContextBuilder   │
                                   │ Agent system prompts  │
                                   │ Copilot context       │
                                   │ Ambient Push scoring   │
                                   └───────────────────────┘
```

Three pillars:

1. **Slot + Profile** (inspired by Cursor's Priompt) — pluggable context slots with scenario-dependent priorities
2. **Multi-layer compression** (inspired by Claude Code's 5-layer pipeline) — cheapest compression first
3. **Dynamic discovery** (inspired by Cursor's file-based tool outputs) — lightweight index in context, detail via on-demand tools

---

## Pillar 1: Slot + Profile

### ContextSlot Interface

Each slot is a reusable building block that knows how to produce, compress, and estimate its own content:

```typescript
interface ContextSlot {
  /** Unique identifier */
  id: string;

  /**
   * Build the slot content.
   * Returns structured content (not yet rendered to LLM messages).
   */
  build(ctx: SlotBuildContext): Promise<SlotContent>;

  /**
   * Compress content to a target level.
   * L1 = truncate (zero LLM), L2 = rule-compress (zero LLM), L3 = LLM summarize.
   * Returns compressed SlotContent with updated token count.
   * Not all slots support all levels — return original if unsupported.
   */
  compress(content: SlotContent, level: 1 | 2 | 3, cache?: SummaryCache): Promise<SlotContent>;

  /**
   * Estimate token count without full rendering.
   * Used by BudgetGovernor for planning.
   */
  estimateTokens(content: SlotContent): number;

  /**
   * Render slot content into LLM message(s).
   */
  render(content: SlotContent): LLMRequestMessage[];
}

interface SlotContent {
  /** Raw data produced by build() */
  data: unknown;
  /** Actual or estimated token count */
  tokens: number;
  /** Whether this content is already compressed */
  compressionLevel: 0 | 1 | 2 | 3; // 0=raw, 1=truncated, 2=rule-compressed, 3=llm-summarized
}

interface SlotBuildContext {
  /** SessionContextService for cross-feature awareness */
  sessionContext: SessionContextService;
  /** Current conversation (if in chat) */
  conversation?: ChatConversation;
  /** Current project (if in chat) */
  project?: ChatProject;
  /** Messages in current conversation */
  messages?: ChatMessage[];
  /** Active file path (if available) */
  activeFilePath?: string;
  /** Model capabilities (vision, pdf, etc.) */
  modelCapabilities?: ModelCapabilities;
  /** Obsidian App reference */
  app: App;
}
```

### Concrete Slots

| Slot ID | Source | Build Logic | Compress Strategy |
|---------|--------|-------------|-------------------|
| `system-prompt` | PromptService | Render `PromptId.ConversationSystem` (or scenario-specific prompt) | Not compressible (required) |
| `user-profile` | UserProfileService | Load profile markdown → `Map<category, texts[]>` → render `PromptId.UserProfileContext` | L1: truncate to top N categories by relevance |
| `working-context` | SessionContextService | Build working theme + recent activity **index** (titles + timestamps only) | L1: reduce to last N items; L2: merge same-file activities |
| `conv-summary` | ChatConversation.context | Read `fullSummary` / `shortSummary` + topics + resource index | L1: use shortSummary instead of fullSummary; L2: drop resource index |
| `recent-messages` | ChatMessage[] | Load last N messages with attachment handling | L1: reduce N; L2: replace older messages with one-line summaries; L3: LLM summarize older chunk |
| `current-file` | App.workspace | Read active file content + metadata | L1: truncate to first K chars; L2: extract key sections only |
| `vault-intuition` | IndexStateRepo | Read `knowledge_intuition_json` + folder intuitions from MobiusNodeRepo | L1: truncate to top N folders; L2: drop folder details, keep only global intuition |
| `prev-analysis` | AIAnalysisHistoryService + vault MD | Read most recent analysis matching working theme — title + summary + sources | L1: summary only; L2: title + source list only |
| `resource-index` | Conversation/Project context | List attached resources with short summaries | L1: drop summaries, keep titles only |
| `activity-index` | SessionContextService | Lightweight list: "3 searches, 2 copilot ops, 5 file opens" with titles | L1: aggregate counts only, drop individual titles |

### ContextProfile

Each scenario defines which slots participate and their priorities:

```typescript
interface ContextProfile {
  id: string;
  /** Total token budget (derived from model context window - output reserve) */
  totalBudget: number;
  /** Ordered slot configurations — pipeline assembles in this order */
  slots: SlotConfig[];
}

interface SlotConfig {
  slotId: string;
  /** Priority: higher = more important to keep. Binary search finds cutoff threshold. */
  priority: number;
  /** Max tokens for this slot in this scenario */
  maxTokens: number;
  /** If true, never drop even when over budget */
  required: boolean;
  /** Max compression level allowed (0 = no compression, 3 = LLM summarize) */
  maxCompressionLevel: 0 | 1 | 2 | 3;
  /** Override build parameters for this scenario */
  buildParams?: Record<string, unknown>;
}
```

### Predefined Profiles

#### ChatProfile
The primary chat conversation context. Recent messages are king; working context provides cross-feature awareness.

```typescript
const ChatProfile: ContextProfile = {
  id: 'chat',
  totalBudget: 'auto', // derived from model
  slots: [
    { slotId: 'system-prompt',    priority: 1000, maxTokens: 1500,  required: true,  maxCompressionLevel: 0 },
    { slotId: 'recent-messages',  priority: 950,  maxTokens: 'rest', required: true,  maxCompressionLevel: 3,
      buildParams: { maxRecentMessages: 20 } },
    { slotId: 'working-context',  priority: 750,  maxTokens: 500,   required: false, maxCompressionLevel: 2 },
    { slotId: 'conv-summary',     priority: 700,  maxTokens: 800,   required: false, maxCompressionLevel: 2 },
    { slotId: 'activity-index',   priority: 650,  maxTokens: 200,   required: false, maxCompressionLevel: 1 },
    { slotId: 'user-profile',     priority: 600,  maxTokens: 400,   required: false, maxCompressionLevel: 1 },
    { slotId: 'prev-analysis',    priority: 500,  maxTokens: 600,   required: false, maxCompressionLevel: 2 },
    { slotId: 'resource-index',   priority: 400,  maxTokens: 300,   required: false, maxCompressionLevel: 1 },
  ],
};
```

#### AiAnalysisProfile
Vault exploration and search. No conversation history; vault structure and working context are critical.

```typescript
const AiAnalysisProfile: ContextProfile = {
  id: 'ai-analysis',
  totalBudget: 'auto',
  slots: [
    { slotId: 'system-prompt',    priority: 1000, maxTokens: 3000,  required: true,  maxCompressionLevel: 0 },
    { slotId: 'vault-intuition',  priority: 900,  maxTokens: 2000,  required: false, maxCompressionLevel: 1 },
    { slotId: 'working-context',  priority: 850,  maxTokens: 600,   required: false, maxCompressionLevel: 2 },
    { slotId: 'activity-index',   priority: 700,  maxTokens: 300,   required: false, maxCompressionLevel: 1 },
    { slotId: 'user-profile',     priority: 400,  maxTokens: 300,   required: false, maxCompressionLevel: 1 },
  ],
};
```

#### CopilotProfile
Document-level operations. Current file is highest priority; working context explains why user is editing this file.

```typescript
const CopilotProfile: ContextProfile = {
  id: 'copilot',
  totalBudget: 'auto',
  slots: [
    { slotId: 'current-file',    priority: 1000, maxTokens: 8000,  required: true,  maxCompressionLevel: 1 },
    { slotId: 'system-prompt',   priority: 950,  maxTokens: 1000,  required: true,  maxCompressionLevel: 0 },
    { slotId: 'working-context', priority: 800,  maxTokens: 400,   required: false, maxCompressionLevel: 2 },
    { slotId: 'activity-index',  priority: 600,  maxTokens: 200,   required: false, maxCompressionLevel: 1 },
    { slotId: 'user-profile',    priority: 400,  maxTokens: 300,   required: false, maxCompressionLevel: 1 },
  ],
};
```

#### FollowupProfile
Follow-up questions after AI analysis. Previous analysis result is the primary context.

```typescript
const FollowupProfile: ContextProfile = {
  id: 'followup',
  totalBudget: 'auto',
  slots: [
    { slotId: 'prev-analysis',    priority: 1000, maxTokens: 3000,  required: true,  maxCompressionLevel: 2 },
    { slotId: 'system-prompt',    priority: 950,  maxTokens: 1000,  required: true,  maxCompressionLevel: 0 },
    { slotId: 'recent-messages',  priority: 850,  maxTokens: 2000,  required: false, maxCompressionLevel: 3,
      buildParams: { maxRecentMessages: 10 } },
    { slotId: 'working-context',  priority: 750,  maxTokens: 500,   required: false, maxCompressionLevel: 2 },
    { slotId: 'vault-intuition',  priority: 500,  maxTokens: 800,   required: false, maxCompressionLevel: 1 },
  ],
};
```

#### AmbientProfile
Used by AmbientPushService to score push candidates against current working context. Lightweight — no LLM call, just scoring input.

```typescript
const AmbientProfile: ContextProfile = {
  id: 'ambient',
  totalBudget: 2000,
  slots: [
    { slotId: 'working-context', priority: 1000, maxTokens: 800,  required: true,  maxCompressionLevel: 1 },
    { slotId: 'activity-index',  priority: 900,  maxTokens: 500,  required: true,  maxCompressionLevel: 1 },
    { slotId: 'current-file',   priority: 700,  maxTokens: 500,  required: false, maxCompressionLevel: 1,
      buildParams: { metadataOnly: true } },
  ],
};
```

---

## Pillar 2: Multi-Layer Compression

### BudgetGovernor

The BudgetGovernor orchestrates the pipeline assembly and compression:

```typescript
class BudgetGovernor {
  /**
   * Assemble context for a given profile.
   * 1. Build all slots in parallel
   * 2. Sum tokens; if within budget, render all
   * 3. If over budget, binary-search for priority cutoff:
   *    - Try compressing slots below cutoff (L1 → L2 → L3)
   *    - If still over, drop non-required slots below cutoff
   * 4. Render surviving slots in profile order → LLMRequestMessage[]
   */
  async assemble(
    profile: ContextProfile,
    buildCtx: SlotBuildContext,
  ): AsyncGenerator<LLMStreamEvent, LLMRequestMessage[], void>;
}
```

### Compression Levels (cheapest first, inspired by Claude Code)

| Level | Name | Cost | How It Works | When |
|-------|------|------|------------|------|
| **L0** | Raw | Free | No compression — full content | Default, within budget |
| **L1** | Truncate | Free | Cut to `maxTokens`, keep head; or use shorter variant (shortSummary vs fullSummary) | First response to budget pressure |
| **L2** | Rule-compress | Free | Slot-specific rules: deduplicate, merge, extract key sentences, aggregate counts | When L1 still over budget |
| **L3** | LLM-summarize | Token cost | Call LLM to generate semantic summary; cache result with content-hash key + TTL | Last resort, only for `maxCompressionLevel >= 3` |

### Compression Algorithm

```
function compressToFit(profile, slotContents, totalBudget):
  totalTokens = sum(slotContents.map(s => s.tokens))
  if totalTokens <= totalBudget: return slotContents  // happy path

  // Sort non-required slots by priority ascending (lowest first)
  compressible = slotContents
    .filter(s => !s.config.required)
    .sort((a, b) => a.config.priority - b.config.priority)

  for slot in compressible:
    if totalTokens <= totalBudget: break

    // Try each compression level
    for level in [1, 2, 3]:
      if level > slot.config.maxCompressionLevel: break
      compressed = slot.compress(level)
      saved = slot.tokens - compressed.tokens
      totalTokens -= saved
      slot = compressed
      if totalTokens <= totalBudget: break

    // If still over after max compression, drop this slot
    if totalTokens > totalBudget:
      totalTokens -= slot.tokens
      slot = DROPPED

  return slotContents.filter(s => s !== DROPPED)
```

### LLM Summary Cache

L3 summaries are expensive. Cache them to avoid redundant calls:

```typescript
interface SummaryCache {
  /** Key: hash(slotId + contentHash), Value: compressed content + expiry */
  get(slotId: string, contentHash: string): SlotContent | null;
  set(slotId: string, contentHash: string, content: SlotContent, ttlMs: number): void;
}
```

- `conv-summary` L3: TTL = until next `ContextUpdateService` refresh (content-hash based invalidation)
- `recent-messages` L3: TTL = until new message added (short-lived)
- `working-context` L3: TTL = 5 minutes (working theme refresh interval)

---

## Pillar 3: Dynamic Context Discovery

### Principle

Inspired by Cursor: "everything large becomes a file; give the agent the ability to read it on demand."

The `working-context` and `activity-index` slots inject a **lightweight index** into context. For detail, agents use **on-demand tools**.

### Static Index (in context, ~100-200 tokens)

What the LLM sees in the `activity-index` slot:

```
## Recent User Activity
- [A1] 3min ago: AI Search — "semantic zoom visualization techniques" → found 12 sources, key insight: IFT paper applicable
- [A2] 8min ago: Copilot Review — research/graph-viz.md → 2 warnings, 1 error (missing citation)
- [A3] 12min ago: File Edit — research/graph-viz.md (added 3 paragraphs on Heptabase comparison)
- [A4] 15min ago: Chat — discussed knowledge graph rendering performance with user
- [A5] 20min ago: File Open — papers/IFT-information-foraging.pdf

Use get_activity_detail(id) for full context of any activity.
```

### On-Demand Tools (agent calls when needed)

Three new tools exposed via MCP to agents, and available as direct calls for Chat:

#### `get_activity_detail`
```typescript
{
  name: 'get_activity_detail',
  description: 'Get full context of a recent user activity by its ID',
  inputSchema: z.object({
    activityId: z.string().describe('Activity ID from the recent activity index, e.g. "A1"'),
  }),
  execute: async ({ activityId }) => {
    // Read from mobius_operation by ID
    // Return: full metadata, related file paths, result summary, duration, etc.
  }
}
```

#### `get_recent_analysis_result`
```typescript
{
  name: 'get_recent_analysis_result',
  description: 'Get the summary and sources of a recent AI analysis session',
  inputSchema: z.object({
    query: z.string().optional().describe('Search query to match against recent analyses'),
    limit: z.number().default(1),
  }),
  execute: async ({ query, limit }) => {
    // Read from ai_analysis_record + vault markdown
    // Return: query, title, summary, sources[], topics[], timestamp
  }
}
```

#### `get_working_theme`
```typescript
{
  name: 'get_working_theme',
  description: 'Get the inferred current working theme with related files and context',
  execute: async () => {
    // Read from SessionContextService.getWorkingContext()
    // Return: theme summary, related files, recent activity summary
  }
}
```

These tools are added to:
- **Chat agent's MCP server** — available during chat conversations
- **VaultSearchAgent's MCP server** — available during AI analysis
- **DocSimpleAgent's tool set** — available during single-file analysis

Copilot commands don't use agents with tools, so they receive the working context via the `working-context` slot in CopilotProfile.

---

## SessionContextService

### Responsibilities

1. **Listen** to events from EventBus and record activities to `mobius_operation`
2. **Maintain** an in-memory `WorkingContext` (materialized view of recent activities)
3. **Rebuild** from SQLite on init (crash recovery)
4. **Provide** `getWorkingContext()` for slot builders and on-demand tools
5. **Manage** working theme inference (rule-based realtime + LLM periodic)

### Event Sources → Activity Types

| Event | Source | Activity Type | Recorded Data |
|-------|--------|---------------|---------------|
| `ViewEventType.MESSAGE_SENT` | ChatView | `chat_message` | conversation_id, message preview, role |
| `ViewEventType.AI_ANALYSIS_COMPLETE` | SearchSession | `ai_analysis_complete` | query, title, sources_count, vault_rel_path |
| `ViewEventType.COPILOT_ACTION` (NEW) | CopilotCommands | `copilot_action` | action type, target file, result summary |
| `workspace:file-open` (Obsidian) | indexUpdater | `file_open` | file path |
| `ViewEventType.RESOURCE_ATTACHED` (NEW) | ChatInputArea | `resource_attach` | resource path, kind, conversation_id |
| `ViewEventType.SEARCH_QUERY` (NEW) | SearchModal | `search_query` | query text, mode (vault/ai) |

### mobius_operation Schema Extension

Current schema is sufficient. Extend usage:

```sql
-- Existing columns, all usable:
-- operation_type: 'chat_message' | 'ai_analysis_complete' | 'copilot_action' | 'file_open' | 'resource_attach' | 'search_query'
-- operation_desc: one-line summary for the activity index
-- related_kind: 'conversation' | 'ai_analysis_record' | 'file' | 'resource'
-- related_id: the related entity's ID or path
-- important_level: 0 (routine) | 1 (notable) | 2 (significant) — used for index filtering
-- continuous_group_id: groups rapid successive actions (e.g., multiple file opens during browsing)
-- meta_json: type-specific structured data
```

Add **reader methods** to `MobiusOperationRepo`:

```typescript
class MobiusOperationRepo {
  // NEW — readers that currently don't exist
  getRecent(params: { limit: number; sinceTs?: number; types?: string[] }): OperationRow[];
  getByType(type: string, limit: number): OperationRow[];
  getGrouped(groupId: string): OperationRow[];
  countByType(sinceTs: number): Record<string, number>;
}
```

### WorkingContext (in-memory materialized view)

```typescript
interface WorkingContext {
  /** Currently active file */
  activeFile: { path: string; title: string; openedAt: number } | null;

  /** Recent activities within decay window (default 30 min), ordered newest first */
  recentActivities: ActivityEntry[];

  /** Working theme — rule-based (always fresh) + LLM-enriched (periodic) */
  workingTheme: WorkingTheme;

  /** Timestamp of last update */
  updatedAt: number;
}

interface ActivityEntry {
  id: string;                    // matches mobius_operation.id
  type: OperationType;
  timestamp: number;
  summary: string;               // one-line, for the activity index
  relatedPaths: string[];        // vault file paths involved
  importanceLevel: 0 | 1 | 2;
  metadata?: Record<string, unknown>;
}

interface WorkingTheme {
  /** Rule-based: aggregated tags, folders, keywords from recent activities */
  ruleBased: {
    topTags: string[];
    topFolders: string[];
    topKeywords: string[];
    summary: string;             // template-generated one-liner
  };
  /** LLM-inferred: deeper semantic understanding (updated periodically) */
  llmInferred: {
    summary: string;             // "用户正在研究知识图谱的语义缩放功能..."
    relatedFiles: string[];
    updatedAt: number;
  } | null;
}
```

### Working Theme Inference (Hybrid: rule + LLM)

**Rule-based** (real-time, every activity event):
1. Extract tags from opened/edited files via `metadataCache`
2. Count folder occurrences in recent activities
3. Extract keywords from search queries and chat messages
4. Template: `"活跃于 {topFolders}, 涉及 {topTags}, 近期搜索 '{topKeywords}'"`

**LLM-inferred** (periodic, triggered by activity threshold):
- Trigger: when `recentActivities` accumulates **10+ new entries** since last LLM inference, OR when a chat session starts
- Prompt: `PromptId.WorkingThemeInference` with recent activity summaries as input
- Output: semantic summary + related files
- Cache: stored in `WorkingContext.workingTheme.llmInferred`, TTL = until next trigger

### Lifecycle

```
Plugin load:
  → SessionContextService.init()
    → Read mobius_operation WHERE created_at > (now - 30min)
    → Rebuild WorkingContext from rows
    → Subscribe to EventBus events
    → Schedule working theme LLM inference if enough activities

During session:
  → Event fires → SessionContextService.handleEvent(event)
    → Write to mobius_operation (immediate, SQLite)
    → Update in-memory WorkingContext (append activity, recalculate rule-based theme)
    → If LLM inference threshold reached → schedule debounced inference

Plugin unload:
  → SessionContextService.destroy()
    → Unsubscribe from EventBus
    → In-memory state discarded (will rebuild from SQLite on next load)
```

### Continuous Group Deduplication

Rapid successive file opens (user browsing) should not flood the activity list. The `continuous_group_id` column groups them:

- If same `operation_type` fires within **3 seconds** of previous → same group
- Activity index shows the group as one entry: "Browsed 5 files in /research/ (most recent: graph-viz.md)"
- `get_activity_detail(groupId)` returns all files in the group

---

## ContextPipeline (replacing ContextBuilder)

### Class Design

```typescript
class ContextPipeline {
  private readonly slotRegistry: Map<string, ContextSlot>;
  private readonly budgetGovernor: BudgetGovernor;
  private readonly summaryCache: SummaryCache;

  constructor(
    slots: ContextSlot[],
    private readonly sessionContext: SessionContextService,
    private readonly promptService: PromptService,
  ) {
    this.slotRegistry = new Map(slots.map(s => [s.id, s]));
    this.budgetGovernor = new BudgetGovernor(this.summaryCache);
  }

  /**
   * Assemble context for a given profile.
   * Drop-in replacement for ContextBuilder.buildContextMessages().
   * Yields progress events for UI feedback.
   */
  async *assemble(
    profile: ContextProfile,
    buildCtx: SlotBuildContext,
  ): AsyncGenerator<LLMStreamEvent, LLMRequestMessage[], void> {
    // 1. Resolve total budget from model if 'auto'
    const totalBudget = this.resolveBudget(profile, buildCtx);

    // 2. Build all slots in parallel
    yield { type: 'tool-call', toolName: 'context-pipeline:build-slots' };
    const slotContents = await Promise.all(
      profile.slots.map(async config => {
        const slot = this.slotRegistry.get(config.slotId);
        if (!slot) return null;
        const content = await slot.build({ ...buildCtx, ...config.buildParams });
        return { config, slot, content };
      })
    );

    // 3. Budget governance: compress/drop as needed
    yield { type: 'tool-call', toolName: 'context-pipeline:budget-govern' };
    const governed = this.budgetGovernor.fit(
      slotContents.filter(Boolean),
      totalBudget,
    );

    // 4. Render surviving slots in profile order → LLMRequestMessage[]
    const messages: LLMRequestMessage[] = [];
    for (const { slot, content, config } of governed) {
      messages.push(...slot.render(content));
    }

    yield { type: 'tool-result', toolName: 'context-pipeline:assemble',
      output: { slotCount: governed.length, totalTokens: governed.reduce((s, g) => s + g.content.tokens, 0) }
    };

    return messages;
  }
}
```

### Migration Path from ContextBuilder

The old `ContextBuilder.buildContextMessages()` call sites switch to `ContextPipeline.assemble(ChatProfile, ctx)`. The mapping:

| Old ContextBuilder Step | New Slot |
|------------------------|----------|
| Step 1: SystemPrompt | `system-prompt` slot |
| Step 2: UserProfile | `user-profile` slot |
| Step 3: ContextMemory | Split into `conv-summary` + `resource-index` + `working-context` + `activity-index` |
| Step 4: RecentMessages | `recent-messages` slot |

`ContextUpdateService` continues to manage conversation/project summary refresh. It now also triggers `SessionContextService` working theme LLM inference when a chat session starts.

### Integration Points

#### Chat (ConversationService)
```typescript
// Before (service-conversation.ts:prepareChatRequest)
const messages = yield* this.contextBuilder.buildContextMessages({ conversation, project, messages, options });

// After
const messages = yield* this.contextPipeline.assemble(ChatProfile, {
  sessionContext: this.sessionContext,
  conversation,
  project,
  messages: historyMessages,
  app: this.app,
  modelCapabilities,
});
```

#### AI Analysis (VaultSearchAgentSDK)
Working context injected into system prompt via `working-context` slot content:
```typescript
// Before: system prompt only has vaultIntuition + probeResults
// After: add working context
const workingCtx = sessionContext.getWorkingContext();
const systemPrompt = await promptService.render(PromptId.VaultSdkPlaybook, {
  vaultIntuition, probeResults, webEnabled,
  workingContext: workingCtx.workingTheme.llmInferred?.summary ?? workingCtx.workingTheme.ruleBased.summary,
  recentActivities: workingCtx.recentActivities.slice(0, 5).map(a => a.summary),
});
```

Plus: add `get_activity_detail`, `get_recent_analysis_result`, `get_working_theme` to vault MCP server tool set.

#### Copilot (copilot-commands.ts)
```typescript
// Before: only getContext() → { content, selected, scope }
// After: enrich with working context
const workingCtx = sessionContext.getWorkingContext();
const result = await aiManager.queryText(PromptId.DocPolish, {
  content: input,
  scope,
  workingContext: workingCtx.workingTheme.ruleBased.summary,
  recentActivity: workingCtx.recentActivities.slice(0, 3).map(a => a.summary).join('\n'),
});

// After copilot action completes, emit event:
eventBus.dispatch({ type: ViewEventType.COPILOT_ACTION, data: { action: 'polish', targetFile, resultSummary } });
```

#### Ambient Push (AmbientPushService)
```typescript
// Before: triggers on writing pause, searches blindly
// After: use working context to filter/boost candidates
const workingCtx = sessionContext.getWorkingContext();
const recentPaths = workingCtx.recentActivities.map(a => a.relatedPaths).flat();
// Suppress pushing notes already in recentPaths (user already knows about them)
// Boost candidates related to workingTheme.topTags
```

---

## New EventBus Event Types

```typescript
enum ViewEventType {
  // Existing
  MESSAGE_SENT = 'message-sent',
  SETTINGS_UPDATED = 'settings-updated',

  // New — for SessionContextService
  COPILOT_ACTION = 'copilot-action',
  SEARCH_QUERY = 'search-query',
  RESOURCE_ATTACHED = 'resource-attached',
  AI_ANALYSIS_COMPLETE = 'ai-analysis-complete',
  // file-open handled via Obsidian workspace event, not EventBus
}
```

---

## New Prompt Templates

| PromptId | Purpose | Variables |
|----------|---------|-----------|
| `WorkingThemeInference` | LLM inference of current working theme from activity stream | `{ activities: Array<{type, summary, timestamp}> }` |
| `WorkingContextRender` | Render working context for injection into LLM context | `{ theme, recentActivities, activeFile }` |
| `ActivityIndexRender` | Render lightweight activity index | `{ activities, counts }` |
| `MessageChunkSummarize` | L3 compression: summarize a chunk of older messages | `{ messages: Array<{role, content}> }` |

---

## File Structure

```
src/service/context/                          # NEW directory
  ├── SessionContextService.ts                # Singleton, event listener, activity recorder
  ├── WorkingThemeInferrer.ts                 # Rule-based + LLM theme inference
  ├── types.ts                                # WorkingContext, ActivityEntry, WorkingTheme
  └── context-tools/                          # On-demand discovery tools
      ├── getActivityDetailTool.ts
      ├── getRecentAnalysisResultTool.ts
      └── getWorkingThemeTool.ts

src/service/chat/context/                     # EXISTING directory, refactored
  ├── ContextPipeline.ts                      # Replaces ContextBuilder.ts
  ├── BudgetGovernor.ts                       # Token budget management + compression orchestration
  ├── SummaryCache.ts                         # LLM summary cache with content-hash keys
  ├── slots/                                  # Slot implementations
  │   ├── types.ts                            # ContextSlot, SlotContent, SlotConfig interfaces
  │   ├── SystemPromptSlot.ts
  │   ├── UserProfileSlot.ts
  │   ├── WorkingContextSlot.ts               # Reads from SessionContextService
  │   ├── ConvSummarySlot.ts
  │   ├── RecentMessagesSlot.ts
  │   ├── CurrentFileSlot.ts
  │   ├── VaultIntuitionSlot.ts
  │   ├── PrevAnalysisSlot.ts
  │   ├── ResourceIndexSlot.ts
  │   └── ActivityIndexSlot.ts
  ├── profiles/                               # Profile definitions
  │   ├── ChatProfile.ts
  │   ├── AiAnalysisProfile.ts
  │   ├── CopilotProfile.ts
  │   ├── FollowupProfile.ts
  │   └── AmbientProfile.ts
  ├── ContextBuilder.ts                       # DEPRECATED — thin wrapper delegating to ContextPipeline for migration
  ├── ContextUpdateService.ts                 # EXISTING — unchanged, still manages summary refresh
  ├── ResourceSummaryService.ts               # EXISTING — unchanged
  └── UserProfileService.ts                   # EXISTING — unchanged
```

---

## Token Budget Calculation

```typescript
function resolveBudget(profile: ContextProfile, modelCapabilities: ModelCapabilities): number {
  if (typeof profile.totalBudget === 'number') return profile.totalBudget;

  // 'auto' mode: derive from model
  const modelContextWindow = modelCapabilities.contextWindow; // e.g., 200000 or 1000000
  const outputReserve = Math.min(modelCapabilities.maxOutputTokens ?? 8192, 16384);
  const safetyMargin = 0.05 * modelContextWindow; // 5% safety margin

  return modelContextWindow - outputReserve - safetyMargin;
}
```

---

## Token Estimation

Each slot's `estimateTokens()` uses a fast heuristic (chars / 3.5 for English, chars / 2 for CJK-heavy content) rather than actual tokenization. Actual tokenization is expensive and unnecessary for budget planning — the 5% safety margin absorbs estimation error.

For `recent-messages` slot, per-message token counts are available from `chat_message.token_usage_json` (stored at generation time) and can be summed directly without re-estimation.

---

## Testing Strategy

### Unit Tests
- `BudgetGovernor`: verify compression cascade (L1 → L2 → L3 → drop) with mock slots
- `SessionContextService`: verify event → activity recording → WorkingContext update
- Each slot: verify build(), compress(level), render() independently
- Profile assembly: verify correct slot selection and priority ordering

### Integration Tests
- Full pipeline: `ContextPipeline.assemble(ChatProfile, ctx)` returns valid `LLMRequestMessage[]`
- Budget overflow: verify lower-priority slots get compressed/dropped
- Crash recovery: kill SessionContextService, reinit, verify WorkingContext rebuilt from SQLite
- Cross-feature flow: emit copilot event → verify it appears in chat's working-context slot

---

## Migration Plan (High Level)

### Phase 1: Foundation
- Implement `SessionContextService` (event listener + `mobius_operation` writer + WorkingContext)
- Add new EventBus event types
- Add `MobiusOperationRepo` reader methods
- Add new prompt templates

### Phase 2: Slot System
- Implement `ContextSlot` interface and all concrete slots
- Implement `BudgetGovernor` with L1/L2 compression
- Implement `ContextPipeline.assemble()`
- Implement `ContextProfile` definitions

### Phase 3: Chat Integration
- Wire `ContextPipeline` into `ConversationService.prepareChatRequest()`
- Deprecate `ContextBuilder` (keep as thin wrapper for migration)
- Verify chat works end-to-end with new pipeline

### Phase 4: Cross-Feature Integration
- Wire `SessionContextService` events into Copilot, AI Analysis, Search
- Add dynamic discovery tools to vault MCP server
- Wire ambient push to use working context for filtering

### Phase 5: L3 Compression + Polish
- Implement `SummaryCache` and LLM-based L3 compression for `recent-messages` slot
- Implement LLM working theme inference
- Performance tuning and token budget calibration
- Remove deprecated `ContextBuilder`

---

## Appendix: Research References

### Claude Code (Anthropic)
- 5-layer compaction: Budget Reduction → Snip → Microcompact → Context Collapse → Auto-Compact (cheapest first)
- Per-tool-result budget: 25k token default, 500k char ceiling, excess written to disk as file references
- Context Reconstruction: CLAUDE.md and MEMORY.md re-injected from disk after compaction; invoked skills capped at 5k tokens each, 25k total
- Deferred tool loading: only tool names (~120 tokens) at startup; schemas loaded on-demand via ToolSearch
- Subagent isolation: full conversation in separate context; only summary returns (6100 tokens → 420 tokens)
- Compaction ratio: ~12% of original tokens
- Source: [Dive into Claude Code (VILA-Lab)](https://arxiv.org/html/2604.14228v1), [Claude Code Docs](https://code.claude.com/docs/en/context-window)

### Cursor (Anysphere)
- Priompt: JSX-based prompt compilation with priority scores; binary search drops lowest-priority elements when over budget
- Dynamic Context Discovery: tool outputs as files, chat history as files, selective MCP loading (46.9% token reduction), terminal as files
- Codebase indexing: tree-sitter AST-aware chunking → Turbopuffer vector DB; fine-tuned 7B CodeLlama reranker with blob-storage KV caching (20x cheaper)
- Two context types: intent context (semantic retrieval) vs state context (deterministic from IDE state)
- Source: [Cursor Dynamic Context Discovery](https://cursor.com/blog/dynamic-context-discovery), [How Cursor Indexes Codebases](https://towardsdatascience.com/how-cursor-actually-indexes-your-codebase/)

### MemGPT / Letta
- Two-tier memory: Main context (in-context, RAM analogy) + External context (archival + recall, disk analogy)
- Self-editing memory: agent manages own context via tool calls
- Source: [MemGPT paper](https://arxiv.org/abs/2310.08560)

### Mem0
- Three memory scopes: User (cross-session) + Session (single conversation) + Agent (self-state)
- Hybrid storage: vector + graph + KV store; 91% lower p95 latency, 90% token savings
- Source: [Mem0 paper](https://arxiv.org/abs/2504.19413)

### LangChain
- ConversationSummaryBufferMemory: recent messages verbatim + older messages LLM-summarized
- Token-triggered: summarization fires when buffer exceeds `max_token_limit`
- Industry consensus: recent = verbatim, older = compressed
