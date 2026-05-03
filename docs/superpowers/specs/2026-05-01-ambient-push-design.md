# Ambient Push — Technical Design Spec

> Date: 2026-05-01
> Status: Draft
> Priority: Highest (★★★★★)
> Phase: S1 — Core differentiator

---

## 1. Problem Statement

### User Pain Point

Knowledge workers accumulate hundreds of notes over months and years. When writing, the most relevant prior knowledge often stays buried — not because search is broken, but because **the user doesn't know what to search for**. The gap is between "I wrote something related to this" and actually recalling that it exists.

Current tools require the user to context-switch from writing to searching. This breaks flow state and incurs a cognitive cost that most users avoid, leading to knowledge silos within their own vault.

### Competitive Gap

| Competitor | Ambient Capability | Gap |
|---|---|---|
| Smart Connections | Shows related notes in sidebar | **No explanation** of why notes are related or how they connect to current writing |
| Notion AI | On-demand Q&A | Purely reactive — no push |
| Mem.ai | Basic similarity suggestions | No graph intelligence, no reasoning |
| Copilot / Khoj / Reflect | None | Fully query-driven |
| InfraNodus | Graph gap analysis | Not Obsidian-native, no writing-time integration |

**No competitor simultaneously delivers: ambient push + explanation of relevance + Obsidian-native + graph-aware intelligence.**

Smart Connections is the closest at ★★★★ for ambient display, but it answers "what is related?" without answering "**why is it related and what should I do about it?**" — the latter is the cognitive value that Ambient Push provides.

<!-- 核心定位：Smart Connections 展示相关笔记但不解释，Peak 要同时回答"相关什么"和"为什么相关" -->

---

## 2. Academic Foundation

### 2.1 Proactive Information Retrieval — Koskela et al. (2018, ACM TiiS Vol. 8 No. 3)

**"Proactive Information Retrieval by Capturing Search Intent from Primary Task Context"**

Core finding: search intent can be inferred from writing context, and proactively pushed results are rated as relevant and useful by participants. The essay-writing experimental scenario maps directly to Obsidian note-writing.

Key design implication: **context extraction from the current writing paragraph is sufficient** to generate useful proactive queries — no explicit user intent signal needed.

### 2.2 Brain Cache — CHI 2025 Workshop on Generative AI and HCI

Proposes a three-layer cognitive exoskeleton framework:

1. **Externalization** — migrate volatile biological memory to an AI-curated personal knowledge store
2. **Structuring** — transform fragmented insights into a semantic network (dynamic knowledge graph)
3. **Activation** — use context-aware interfaces to proactively resurface relevant knowledge via recommendations

Peak Assistant's architecture maps precisely to this framework: vault storage (externalization) → SQLite index + graph (structuring) → **Ambient Push (activation)**. The "activation" layer is identified as the missing piece in existing PKM tools.

<!-- Brain Cache 的三层框架就是 Peak 的产品架构：vault=外化, SQLite+graph=结构化, Ambient Push=激活 -->

### 2.3 Ambient Information Design — Mankoff et al. (2003, CHI)

Design principles for ambient information systems:
- Notifications must be **glanceable** — comprehensible within ~2 seconds
- Must not interrupt the primary task (writing)
- Transition from peripheral attention to focused attention must be **smooth and user-initiated**

### 2.4 Proactive Retrieval Benchmark — ProCIS (SIGIR 2024)

Samarinas & Zamani established the first large-scale benchmark for proactive retrieval (2.8M+ conversations), proving that proactive retrieval is an independently measurable IR task. Their npDCG metric provides a concrete evaluation framework for measuring push quality. This benchmark can guide our internal testing: we can measure whether ambient push results would rank highly under npDCG compared to the user's actual subsequent searches.

### 2.5 Karpathy LLM Wiki Contrast

Karpathy's LLM Wiki (April 2026, 10+ open-source implementations) validates "compiled knowledge > real-time re-derivation" but operates in a **purely reactive query-response mode**. Ambient Push is the dimension where Peak leads: proactive surfacing of knowledge that the user doesn't know to ask for. This is explicitly noted in the competitive crosswalk (research doc Section 4.3): "Ambient Push — **Peak ahead** (LLM Wiki does not address this)."

### 2.6 Serendipitous Information Encounter — Chen & Xiao (2025, Frontiers in Psychology)

Survey of 645 university students found that AI-driven unexpected information encounters positively predict creativity, mediated by cognitive flexibility. **Critical nuance: the effect is moderated by AI literacy** — only significant for medium-to-high AI literacy users. Implication: the Serendipity Engine (Phase 3) needs good onboarding to teach users what ambient push is and how to act on it. Low AI literacy users may find surprising pushes confusing rather than creative.

### 2.7 Extended Mind Theory — Andy Clark (2025, Nature Communications)

Clark applies extended mind theory to AI tools: LLMs are qualitatively new cognitive extensions — not just storage, but generative reasoning. **Strict warning: the product must preserve the user's cognitive agency.** The UI must clearly distinguish "AI-pushed knowledge" from "user's own ideas." This reinforces the decision that ambient push is suggestion-only and visually separated (sidebar panel, not inline content injection).

### 2.8 Safety Rails

**Generation Effect** (Slamecka & Graf 1978): fully automated actions (silent tag insertion, auto-linking) degrade the user's mastery of their own knowledge. Ambient Push must be **suggestion-mode only** — the user decides whether to act on each push.

**Technology Overload** (Karr-Wisniewski & Lu 2010): push frequency and relevance threshold are product-critical design parameters. Over-frequent or irrelevant pushes transform a cognitive offload tool into a cognitive burden source.

---

## 3. Architecture Design

### 3.1 System Overview

```
┌──────────────────────────────────────────────────┐
│  Editor (Obsidian CodeMirror)                    │
│  ┌────────────────────────────────────────────┐  │
│  │  User is writing...                        │  │
│  └────────────────────────────────────────────┘  │
│        │ editor-change / cursor-idle events       │
│        ▼                                          │
│  ┌─────────────────┐                              │
│  │ AmbientTrigger   │ ← debounce + cooldown       │
│  │ (event gateway)  │   + significance filter      │
│  └────────┬────────┘                              │
│           │ significant change detected            │
│           ▼                                        │
│  ┌──────────────────┐                              │
│  │ ContextExtractor  │ ← current paragraph          │
│  │                   │   + doc title/tags            │
│  │                   │   + recent edit delta          │
│  └────────┬─────────┘                              │
│           │ context payload                         │
│           ▼                                         │
│  ┌──────────────────┐     ┌────────────────────┐   │
│  │ AmbientSearcher   │────▶│ QueryService       │   │
│  │                   │     │ (existing pipeline) │   │
│  │                   │────▶│ GraphRepo           │   │
│  │                   │     │ (hop traversal)     │   │
│  └────────┬─────────┘     └────────────────────┘   │
│           │ ranked results                          │
│           ▼                                         │
│  ┌──────────────────┐                               │
│  │ RelevanceExplainer│ ← LLM micro-call              │
│  │ (why relevant?)   │   or template-based explain   │
│  └────────┬─────────┘                               │
│           │ push items with explanations              │
│           ▼                                          │
│  ┌──────────────────┐                                │
│  │ AmbientPushPanel  │ ← sidebar / inline UI         │
│  │ (React component) │   glanceable cards             │
│  └──────────────────┘                                │
└──────────────────────────────────────────────────────┘
```

### 3.2 Trigger Conditions

The trigger gateway (`AmbientTrigger`) monitors three event types:

| Event | Source | Trigger Condition |
|---|---|---|
| **Writing pause** | CodeMirror `update` listener | Cursor idle for ≥5 seconds after ≥30 characters of new text |
| **Document switch** | `workspace.on('file-open')` | Different file opened (not tab refocus) |
| **Explicit request** | Command palette / hotkey | User manually invokes "Peak: Show Related" |

**Significance filter** — not every editor change warrants a push:
- Minimum delta: ≥30 characters of net new text since last trigger (ignores formatting-only edits, whitespace, and undo/redo cycles)
- Structural change: heading added/modified, or new paragraph started
- Skip if active file is in `shouldSkipListenerIndexing()` paths (hub summaries, AI analysis output)

**Throttling:**
- Minimum 30-second cooldown between ambient pushes for the same document
- Minimum 5-second cooldown on document switch
- Maximum 1 concurrent ambient search in-flight; new triggers while searching are queued (latest-wins, not FIFO)

<!-- 节流策略：30秒同文档冷却 + 5秒切换冷却 + 单并发限制，防止频繁搜索 -->

### 3.3 Context Extraction

`ContextExtractor` produces a structured payload from the active editor state:

```typescript
interface AmbientContext {
  // Primary — what the user is writing RIGHT NOW
  currentParagraph: string;       // paragraph containing cursor (≤500 chars)
  cursorSection: string;          // heading hierarchy to cursor position

  // Secondary — broader document context
  documentTitle: string;
  documentTags: string[];         // frontmatter tags
  documentHeadings: string[];     // all H1-H3 headings
  existingOutlinks: string[];     // [[wikilinks]] already in the doc

  // Temporal — what changed
  recentEditDelta: string;        // text added in last 60 seconds (≤300 chars)
  editSessionDuration: number;    // seconds since file was opened

  // File metadata
  filePath: string;
  lastModified: number;
}
```

**Extraction strategy:** use Obsidian's `editor.getCursor()` to locate cursor position, then extract the enclosing paragraph via line scanning. `existingOutlinks` are extracted via regex `\[\[([^\]]+)\]\]` from the full document — these are used for **deduplication** (never push a note already linked in the document).

**Obsidian API specifics:**
- Cursor position: `MarkdownView.editor.getCursor()` returns `{line, ch}`
- Line content: `editor.getLine(lineNumber)`
- Document content: `editor.getValue()` (use sparingly, cache result per trigger cycle)
- Editor change events: register via `workspace.on('editor-change', (editor, info) => ...)` — this fires on every keystroke, so debounce is critical
- File metadata: `app.metadataCache.getFileCache(file)` provides frontmatter tags, headings, and links without re-parsing

### 3.4 Related Content Retrieval

`AmbientSearcher` performs a **two-stage retrieval**:

**Stage 1 — Fast signal search (≤100ms budget)**

Reuse `QueryService.textSearch()` with a lightweight configuration:

```typescript
const query: SearchQuery = {
  text: context.currentParagraph,  // primary signal
  scopeMode: 'vault',
  scopeValue: { currentFilePath: context.filePath },
  topK: 15,
  searchMode: 'fulltext',         // skip embedding for speed
  excludeFolderPrefixes: AMBIENT_EXCLUDE_FOLDERS,
};
const results = await queryService.textSearch(query, false); // no LLM rerank
```

Setting `scopeValue.currentFilePath` activates graph-proximity boost in `Reranker.applyRankingBoosts()` automatically — notes within 2 hops get a +0.2 boost.

**Stage 2 — Graph neighborhood expansion (≤50ms budget)**

```typescript
const graphNeighbors = await graphRepo.getRelatedFilePaths({
  currentFilePath: context.filePath,
  maxHops: 2,
});
// Surface graph neighbors that didn't appear in Stage 1
// but have semantic relevance to the current paragraph
```

This captures notes that are **structurally related** (linked, co-cited, in the same hub cluster) even if they don't share keywords with the current paragraph.

**Merge & filter:**

1. Union Stage 1 and Stage 2 results
2. Remove notes already linked in the document (`existingOutlinks`)
3. Remove the active document itself
4. Remove notes pushed in the last 10 minutes (session-level dedup via `PushHistory`)
5. Apply `Reranker.applyRankingBoosts()` for final scoring
6. Take top 3-5 results

### 3.5 Relevance Explanation

The key differentiator over Smart Connections: **every pushed note comes with a human-readable explanation of WHY it's relevant**.

**Two-tier explanation strategy:**

**Tier 1 — Template-based (zero LLM cost, ≤10ms):**

For results with clear structural signals, generate explanations from metadata:

| Signal | Explanation Template |
|---|---|
| Shared tags | "Both tagged with #{tag}" |
| Graph neighbor (1-hop) | "Directly linked from [[{source}]]" |
| Graph neighbor (2-hop) | "Connected via [[{bridge}]]" |
| Co-citation | "Co-cited with current note in [[{citing_note}]]" |
| Hub membership | "Both part of the {hub_name} knowledge cluster" |
| High text overlap | "Contains similar discussion of '{matched_terms}'" |
| Recent edit correlation | "You edited this {n} days ago in a related session" |

**Tier 2 — LLM micro-explanation (for top-1 result only, optional):**

If the user has enabled "detailed explanations" in settings, send a micro-prompt for the highest-scored result:

```
Given the user is writing about: "{currentParagraph}"
And this note exists: "{pushNoteTitle}" with excerpt: "{pushNoteExcerpt}"
In one sentence, explain how this note could contribute to the current writing.
```

Budget: ≤100 tokens output, using the cheapest configured model. This is opt-in and rate-limited to 1 LLM call per 2 minutes.

<!-- 解释分两级：模板解释（零成本），LLM 微解释（可选，仅最相关的第一条） -->

### 3.6 Push Delivery Strategy

**Progressive disclosure — three levels of intrusiveness:**

| Level | When | What the user sees |
|---|---|---|
| **Peripheral** | Default state | Subtle indicator in status bar: "3 related notes" with dot color |
| **Glanceable** | User hovers status bar OR sidebar panel is open | Compact card list in sidebar panel |
| **Focused** | User clicks a card | Full note preview + explanation + action buttons |

This follows Mankoff's ambient design principle: **information exists at the periphery and moves to focus only when the user pulls it**.

---

## 4. Data Model

### 4.1 Push Record

```sql
CREATE TABLE IF NOT EXISTS ambient_push_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,           -- Unix ms
  trigger_type TEXT NOT NULL,            -- 'writing_pause' | 'doc_switch' | 'manual'
  source_file_path TEXT NOT NULL,        -- file being edited
  context_paragraph TEXT,                -- extracted paragraph (≤500 chars)

  pushed_file_path TEXT NOT NULL,        -- recommended note path
  pushed_score REAL NOT NULL,            -- final relevance score
  explanation_type TEXT NOT NULL,        -- 'template' | 'llm'
  explanation_text TEXT NOT NULL,        -- human-readable reason

  user_action TEXT,                      -- NULL | 'opened' | 'linked' | 'dismissed' | 'ignored'
  user_action_ts INTEGER,               -- when user acted

  UNIQUE(timestamp, source_file_path, pushed_file_path)
);

CREATE INDEX idx_push_log_source ON ambient_push_log(source_file_path, timestamp);
CREATE INDEX idx_push_log_pushed ON ambient_push_log(pushed_file_path, timestamp);
```

<!-- 存储在 vault.sqlite 中，与搜索索引同库 -->

### 4.2 Push Session State (In-Memory)

```typescript
interface AmbientPushState {
  isActive: boolean;                      // global on/off
  currentPushItems: AmbientPushItem[];    // currently displayed items (max 5)
  pushHistory: Map<string, number>;       // path → last push timestamp (session dedup)
  lastTriggerTs: number;                  // cooldown enforcement
  pendingSearch: AbortController | null;  // cancel in-flight search on new trigger
  stats: {
    totalPushes: number;
    totalOpened: number;
    totalLinked: number;
    totalDismissed: number;
  };
}

interface AmbientPushItem {
  filePath: string;
  title: string;
  excerpt: string;                        // first ~150 chars of matched content
  score: number;
  explanation: string;
  explanationType: 'template' | 'llm';
  signals: AmbientSignal[];              // which signals contributed
  timestamp: number;
}

type AmbientSignal =
  | { type: 'shared_tag'; tag: string }
  | { type: 'graph_neighbor'; hop: number; via?: string }
  | { type: 'co_citation'; citingNote: string }
  | { type: 'hub_member'; hubName: string }
  | { type: 'text_overlap'; terms: string[] }
  | { type: 'recency'; editedDaysAgo: number };
```

### 4.3 User Feedback Loop

Each `user_action` in `ambient_push_log` feeds back into future ranking:

- `opened` / `linked` → **positive signal**: boost the pushed note's `openCount` in `RankingSignals`, which flows into `Reranker.applyRankingBoosts()` `freqBoost`
- `dismissed` → **negative signal**: suppress this (source, pushed) pair for 7 days
- `ignored` (no action within 5 minutes) → **weak negative**: reduce score by 0.05 in future pushes to same source

This creates a **passive learning loop** without explicit thumbs-up/down UI.

---

## 5. UI Design

### 5.1 Ambient Push Panel (Right Sidebar)

The primary display surface is a **collapsible sidebar panel** registered as an Obsidian leaf view.

```
┌──────────────────────────────┐
│ ⚡ Related Notes         ⋮  │  ← header with overflow menu
│                              │     (settings, pause, clear)
├──────────────────────────────┤
│ ┌──────────────────────────┐ │
│ │ 📄 Jazz Improvisation    │ │  ← note title (click to open)
│ │ Theory                   │ │
│ │                          │ │
│ │ "...feedback loops in    │ │  ← excerpt (first ~100 chars)
│ │ creative practice..."    │ │
│ │                          │ │
│ │ 🔗 Connected via         │ │  ← explanation tag
│ │ [[Creative Processes]]   │ │
│ │                          │ │
│ │ [Insert Link] [Open] [×] │ │  ← action buttons (hover-reveal)
│ └──────────────────────────┘ │
│                              │
│ ┌──────────────────────────┐ │
│ │ 📄 Agile Retrospective   │ │
│ │ Patterns                 │ │
│ │                          │ │
│ │ "...structured reflection│ │
│ │ cycles that mirror..."   │ │
│ │                          │ │
│ │ 🏷️ Both tagged #process  │ │
│ │                          │ │
│ │ [Insert Link] [Open] [×] │ │
│ └──────────────────────────┘ │
│                              │
│ ┌──────────────────────────┐ │
│ │ 📄 Distributed Systems   │ │
│ │ Consensus               │ │
│ │                          │ │
│ │ "...convergence through  │ │
│ │ iterative rounds..."     │ │
│ │                          │ │
│ │ 🧠 AI: "Both describe   │ │  ← LLM explanation (Tier 2)
│ │ feedback-driven          │ │
│ │ convergence patterns"    │ │
│ │                          │ │
│ │ [Insert Link] [Open] [×] │ │
│ └──────────────────────────┘ │
│                              │
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
│ Showing 3 of 5 related notes │  ← "Show more" expander
│ Last updated 12s ago    🔄   │  ← timestamp + manual refresh
└──────────────────────────────┘
```

**Card components:**
- `NoteTitle` — clickable, opens note in new tab
- `Excerpt` — first ~100 chars of the matched content region, keyword-highlighted
- `ExplanationTag` — styled badge explaining the connection signal
- `ActionButtons` — hover-reveal row:
  - **Insert Link** — inserts `[[note-title]]` at cursor position in the active editor
  - **Open** — opens note in a new tab (records `opened` action)
  - **Dismiss (×)** — removes card, records `dismissed` action

<!-- UI 原则：不用 emoji 做图标，用 Lucide React icons；不用 <button>，用 shadcn/ui Button -->

### 5.2 Status Bar Indicator

When the sidebar panel is closed, a **status bar item** provides peripheral awareness:

```
[⚡ 3 related]    ← click to toggle sidebar panel
```

- Dot color reflects relevance quality: green (high confidence), amber (moderate), gray (stale/no results)
- Number updates live as pushes arrive
- Click toggles the sidebar panel

### 5.3 Inline Hint (Phase 3 — Serendipity Engine)

Future enhancement: when the user pauses writing for ≥5 seconds, show a subtle `?` icon in the editor gutter at the cursor line. Hover reveals a tooltip with the top-1 push item. This is the "Serendipity Engine" described in the brainstorm (scored 28/30).

Implementation deferred to Phase 3 as it requires CodeMirror plugin integration.

---

## 6. Integration Points

### 6.1 With Existing Search Pipeline

| Component | Integration | Notes |
|---|---|---|
| `QueryService.textSearch()` | Primary search entry point | `searchMode: 'fulltext'` for speed; `scopeValue.currentFilePath` for graph boost |
| `Reranker.applyRankingBoosts()` | Automatic scoring | Graph proximity, recency, hub tier boosts all apply |
| `GraphRepo.getRelatedFilePaths()` | Stage 2 graph expansion | 2-hop neighborhood for structural relevance |

### 6.2 With Graph / Hub System

| Component | Integration | Notes |
|---|---|---|
| `hubDiscover.ts` | Hub membership signal | Used in explanation templates ("Both part of {hub} cluster") |
| `coCitationService.ts` | Co-citation signal | Notes co-cited ≥2 times surface in push |
| `semanticRelatedEdges.ts` | Semantic edge signal | Provides similarity edges for graph expansion |

### 6.3 With Existing Event Infrastructure

| Component | Integration | Notes |
|---|---|---|
| `SearchUpdateListener` (`indexUpdater.ts`) | Event source | Share `vault.on('modify')` and `workspace.on('file-open')` events; separate debounce timers |
| `PatternDiscoveryTrigger` | Architectural pattern | Counter-threshold + cooldown pattern reused for ambient trigger |
| `shouldSkipListenerIndexing()` | Path filter | Reused as-is to skip hub-summary and AI-analysis folders |

### 6.4 With S3 Cascade Update (Future)

When S3 cascade update lands, ambient push results will automatically improve because:
- Semantic edges will be fresher (cascade updates neighbor edges on note change)
- Hub summaries will be current (cascade invalidates stale hubs)
- Graph proximity scores will reflect recent structural changes

No explicit wiring needed — ambient push reads from the same graph/index that cascade updates write to.

### 6.5 With Pattern Discovery

The existing `PatternDiscoveryTrigger` can be extended: patterns discovered from user query history can **seed ambient push queries**. If the system knows the user frequently searches for "distributed systems + consensus" when writing about "agile retrospectives", it can proactively push those results during ambient search without waiting for text overlap.

---

## 7. Performance Constraints

### 7.1 Latency Budget

**Hard constraint: ambient push must NEVER block editor input or cause visible jank.**

| Phase | Budget | Strategy |
|---|---|---|
| Event → trigger decision | ≤5ms | Simple counter + timestamp check, synchronous |
| Context extraction | ≤10ms | Synchronous cursor/paragraph scan, no async |
| Search execution | ≤200ms | FTS5 only (skip embedding), topK=15, no LLM rerank |
| Graph expansion | ≤50ms | SQLite BFS query, cached graph in memory |
| Result merge + filter | ≤10ms | In-memory set operations |
| Template explanation | ≤5ms | String interpolation |
| LLM explanation (opt-in) | ≤3000ms | Async, non-blocking, updates card after delivery |
| **Total (without LLM)** | **≤280ms** | |
| **Total (with LLM, top-1 only)** | **≤3280ms** | LLM result fills in asynchronously |

### 7.2 Resource Budget

- **Memory:** ≤5MB for ambient push state (push history, current items, pending search)
- **SQLite queries:** ≤3 queries per ambient push cycle (FTS5 + graph neighbors + ranking signals)
- **CPU:** All search runs on a `requestIdleCallback` or `setTimeout(0)` to yield to editor input
- **Network:** LLM micro-explanation uses ≤200 tokens input + ≤100 tokens output per call; rate-limited to 1 call per 2 minutes

### 7.3 Degradation Strategy

If the vault has ≥10,000 notes and search latency exceeds the 200ms budget:

1. Reduce `topK` from 15 to 8
2. Reduce graph expansion from 2-hop to 1-hop
3. Disable graph expansion entirely (FTS5-only mode)
4. Increase cooldown from 30s to 60s

Settings are auto-adjusted based on measured latency; user can override in settings.

---

## 8. Implementation Phases

### Phase 1 — Core Pipeline (MVP)

**Goal:** Sidebar panel showing related notes when writing, with template-based explanations.

**Scope:**
- `AmbientTrigger`: writing-pause (≥5s idle + ≥30 char delta) + document-switch triggers
- `ContextExtractor`: current paragraph + document title/tags + existing outlinks
- `AmbientSearcher`: `QueryService.textSearch()` in fulltext mode, no graph expansion
- `AmbientPushPanel`: React sidebar view with note cards, excerpt, template explanation, action buttons (Insert Link / Open / Dismiss)
- Status bar indicator
- `ambient_push_log` SQLite table for action tracking
- Settings: on/off toggle, cooldown duration, max items

**Not included:** graph expansion, LLM explanations, feedback learning, inline hints.

### Phase 2 — Graph Intelligence

**Goal:** Graph-aware push with richer explanations.

**Scope:**
- Graph Stage 2: `GraphRepo.getRelatedFilePaths()` expansion
- Hub membership signal + co-citation signal
- Richer template explanations (graph neighbor, co-citation, hub membership)
- Session-level dedup via `PushHistory`
- Feedback loop: `opened`/`linked` boost future pushes, `dismissed` suppresses pairs for 7 days

### Phase 3 — Serendipity Engine

**Goal:** Inline editor hints + LLM explanations + cross-session learning.

This phase implements the "Serendipity Engine" concept (scored 28/30 in the brainstorm analysis — tied highest). The core insight: find notes that are **maximally distant in embedding space but connected by exactly one structural bridge** in the knowledge graph. This "one-bridge" constraint ensures suggestions are non-random — they represent connections the user's vault *almost* makes but doesn't.

**Scope:**
- CodeMirror gutter decoration: `?` icon on writing pause (≥5s), hover tooltip with top-1 serendipitous push. Implementation via `EditorView.decorations` (CM6 ViewPlugin) — register within the sidebar view's lifecycle to avoid leaking decorations across views
- Serendipity query: `SELECT path FROM graph_edges WHERE from_node_id IN (SELECT to_node_id FROM graph_edges WHERE from_node_id = ?) AND to_node_id NOT IN (direct_neighbors) ORDER BY embedding_distance DESC LIMIT 3` — finds "friends of friends" that are semantically distant but structurally adjacent
- LLM Tier 2 micro-explanations (opt-in, top-1 result, rate-limited)
- Cross-session pattern learning: aggregate `ambient_push_log` to discover recurring (source topic → pushed topic) pairs
- Integration with Pattern Discovery: discovered patterns seed ambient queries
- **Attention signal integration:** if Cognitive Heartbeat attention tracking (brainstorm idea #1, scored 28/30) is implemented, writing pause duration and cursor dwell time become additional inputs to trigger thresholds — longer pauses suggest deeper cognitive engagement, warranting more surprising (higher-distance) suggestions

### Phase 4 — Morning Briefing (Extension)

**Goal:** Proactive session-start recommendations.

**Scope:**
- On Obsidian startup, analyze:
  - Notes edited in the last session that have unresolved connections
  - Hub summaries that changed since last visit
  - Notes with decaying engagement (high PageRank but not opened in 14+ days)
- Display as a dismissible modal or dedicated "Today's Briefing" view
- Connects to Vault Lint (S2) for health-related recommendations

---

## Appendix A: Configuration Schema

```typescript
interface AmbientPushSettings {
  enabled: boolean;                    // default: true
  triggerCooldownMs: number;           // default: 30000 (30s)
  docSwitchCooldownMs: number;         // default: 5000 (5s)
  writingPauseMs: number;              // default: 5000 (5s idle)
  minCharDelta: number;               // default: 30
  maxPushItems: number;                // default: 5
  showStatusBar: boolean;              // default: true
  enableLlmExplanation: boolean;       // default: false
  llmExplanationCooldownMs: number;    // default: 120000 (2min)
  excludeFolders: string[];            // default: [] (additional user exclusions)
  graphExpansionHops: number;          // default: 2 (Phase 2+)
  feedbackLearning: boolean;           // default: true (Phase 2+)
}
```

## Appendix B: Relationship to Other S-Features

```
S1 Ambient Push ◄──── reads from ────► S3 Cascade Update (fresher graph data)
       │                                       │
       │                                       ▼
       │                               S6 Precompiled Knowledge
       │                               (hub docs as push source)
       │
       ├──── shares signals with ──►  S5 PPR Search (PPR scores boost push ranking)
       │
       └──── feeds into ────────────► S2 Vault Lint (push acceptance rate as health signal)
                                      S7 Auto-tag (ambient tag suggestions)
```

## Appendix C: Key Code Anchors

| Concern | File | Line | Function/Class |
|---|---|---|---|
| Vault event listener | `src/service/search/index/indexUpdater.ts` | 49 | `SearchUpdateListener.start()` |
| Debounce + flush pattern | `src/service/search/index/indexUpdater.ts` | 197 | `schedule()` + `flush()` |
| Skip noisy paths | `src/service/search/index/indexUpdater.ts` | 118 | `shouldSkipListenerIndexing()` |
| File open tracking | `src/service/search/index/indexUpdater.ts` | 169 | `handleFileOpen()` |
| Search entry point | `src/service/search/query/queryService.ts` | 54 | `QueryService.textSearch()` |
| Signal-based reranking | `src/service/search/query/reranker.ts` | 306 | `Reranker.applyRankingBoosts()` |
| Graph hop traversal | `src/core/storage/sqlite/repositories/GraphRepo.ts` | 162 | `getRelatedFilePaths()` |
| Trigger pattern reference | `src/service/context/PatternDiscoveryTrigger.ts` | 14 | Counter + cooldown pattern |
| Co-citation query | `src/service/search/coCitationService.ts` | 67 | `getCoCitations()` |
| Unlinked mentions | `src/service/search/unlinkedMentionService.ts` | 20 | `getUnlinkedMentions()` |
| Semantic edge rebuild | `src/service/search/index/helper/semanticRelatedEdges.ts` | — | `SemanticRelatedEdgesRebuildService` |
| Index tenant routing | `src/service/search/index/indexService.ts` | 110 | `getIndexTenantForPath()` |
