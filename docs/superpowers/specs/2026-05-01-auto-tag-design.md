# Auto-tag Suggestion System — Design Spec

> Date: 2026-05-01
> Status: Draft
> Priority: Medium (S7 in progress.md)
> Competitive gap: vs Mem.ai ★★★★★; Copilot/Smart Connections/Khoj all ★
> Design red line: suggestion mode only (Generation Effect) — never silently apply tags.

---

## 1. Problem Statement

### The Manual Tagging Pain

Users rarely tag consistently. In a vault with 1000+ notes, tagging degrades over time: early notes are well-tagged, recent ones are not. This creates an asymmetric retrieval landscape — older content is discoverable via tags, newer content is invisible to tag-based navigation and filtering.

The deeper problem: **tags are a classification task, and humans are bad at consistent classification at scale.** Each tagging decision requires the user to hold the full taxonomy in working memory while reading the document — cognitive load that scales with vault size. Common failure modes:

1. **Tag drift** — the same concept accumulates synonymous tags over time (`machine-learning`, `ML`, `machine_learning`, `deep-learning`) because the user forgets prior vocabulary choices.
2. **Tag abandonment** — users start enthusiastic, tag the first 50 notes, then stop. New notes enter the vault untagged, creating a two-class system.
3. **Tag inflation** — without vocabulary control, the tag namespace grows unbounded, reducing each tag's discriminative power.
4. **Inconsistent granularity** — some notes get 10 tags, others get 1, depending on the user's energy at write-time.

### Why Suggestion Mode, Not Silent Automation

<!-- 设计红线：Generation Effect -->

The Generation Effect (Slamecka & Graf 1978; meta-analysis by Bertsch, Pesta, Wiscott, McDaniel in Memory & Cognition) demonstrates 20–40% better retention when users actively generate or select content vs. passively receiving it. Silent auto-tagging (Mem.ai's approach) undermines the user's ownership of their knowledge structure.

Clark 2025 (Nature Communications, "Extending Minds with Generative AI") adds a strict warning: products must let users clearly distinguish between "AI-pushed knowledge" and "self-generated ideas". Tag choices are classification decisions that shape the user's mental model — delegating them silently erodes cognitive agency.

**Hard constraint from competitive analysis §2.5 & §3.3:**
> "自动标签和自动摘要必须是建议模式，不能静默执行。完全自动化会削弱用户对自己知识的掌握。AI 推送 + 用户主动接受/编辑才是最优模式。"

This means: **suggest, explain, let the user decide.** Every tag suggestion must come with a reason, and the user must explicitly accept, modify, or reject it.

### Competitive Landscape

| Product | Auto-tag | Suggestion mode | Explainable | Learns from feedback |
|---------|----------|-----------------|-------------|---------------------|
| Mem.ai | Yes | No (silent) | No | Unclear |
| Notion AI | Yes | Partial (Autofill) | No | No |
| AI Note Tagger (Obsidian) | Yes | One-click batch | No | No |
| Smart Connections | No | — | — | — |
| Obsidian Copilot | No | — | — | — |
| **Peak Assistant (proposed)** | **Yes** | **Yes (core)** | **Yes (reason per tag)** | **Yes (feedback loop)** |

No Obsidian plugin offers AI-powered tag suggestions with explanation and feedback learning. This is our differentiator.

---

## 2. Design Principles

1. **P1: Suggestion-only (Generation Effect)** — Never write tags without user confirmation. The UI must make accepting/rejecting equally easy. This is a hard constraint, not a preference.

2. **P2: Explainable** — Every suggested tag comes with a short reason: "5 linked notes share this tag", "content discusses X which aligns with existing tag Y", "80% of notes in folder Z carry this tag". Transforms tagging from a chore into a learning moment.

3. **P3: Taxonomy-aware** — Suggestions must align with the user's existing tag vocabulary. When a novel tag is necessary, flag near-synonyms and let the user choose. Prevents tag namespace explosion.

4. **P4: Learnable** — Accepted tags reinforce the suggestion engine. Rejected tags penalize candidates. Edited tags (user modifies before accepting) are the highest-signal feedback — they reveal preferred vocabulary.

5. **P5: Non-intrusive (Technology Overload Guard)** — Karr-Wisniewski & Lu (2010): excessive information tools decrease productivity. Mankoff 2003: ambient information must be glanceable in <2 seconds. Suggestions must:
   - Not appear as modal interruptions (Copilot command = user-initiated; ambient = sidebar section)
   - Be dismissible with a single action
   - Respect user-configurable frequency limits

---

## 3. Tag Suggestion Engine

The engine produces `TagSuggestion[]` where each suggestion carries a candidate tag, confidence score, source signal, and human-readable reason.

```
// 逻辑数据结构，不是实现代码
TagSuggestion {
  tag: string                  // Normalized tag label
  category: 'topic' | 'keyword' | 'functional' | 'context'
  confidence: number           // 0..1, composite score
  sources: SuggestionSource[]  // Which signals contributed
  reason: string               // Human-readable explanation (1 sentence)
  isExistingVaultTag: boolean  // true = reuses existing tag; false = novel
  nearSynonyms?: string[]      // Existing tags semantically close to this candidate
}

SuggestionSource = 'content' | 'graph' | 'history' | 'folder'
```

### 3.1 Content-Based Signal — LLM Analysis

<!-- 基于内容：复用现有 DocTagGenerateJson prompt 的 LLM 能力，但独立于索引流程调用 -->

**Mechanism**: Use the existing LLM tag generation capability — the `DocTagGenerateJson` prompt template (`templates/prompts/doc-tag-generate-json.md`) already produces `topicTagEntries` (with `id` + `label`), `functionalTagEntries`, and context tags (`timeTags`, `geoTags`, `personTags`).

**Extension for suggestion mode**: Create a prompt variant (`PromptId.DocTagSuggest`) that adds:
- A `reason` field to each tag entry in the output schema.
- The vault's existing tag vocabulary (top 50 by doc count) as context, instructing the LLM to prefer existing tags.
- Neighbor note titles + their tags for cross-note reasoning.

**Decoupling from index pipeline**: The suggestion engine invokes the LLM independently from `indexDocument()`. The index pipeline uses `includeLlmTags` only during `manual_full` and `hub_maintenance` reasons (`src/service/search/index/types.ts:68-80`). The suggestion engine is user-triggered (Copilot command) or low-priority background (ambient).

**Cache optimization**: If `mobius_node.tags_json` already has LLM tags from a prior `manual_full` index pass (check `attributes_json` for enrichment status), reuse those as Signal A candidates without re-invoking the LLM.

**Existing infrastructure anchors**:
- `src/service/prompt/PromptId.ts:61` — `DocTagGenerateJson` prompt id
- `templates/prompts/doc-tag-generate-json.md` — prompt template with tag output schema
- `src/core/document/helper/TagService.ts:0-56` — `IndexedTagsBlob` type, validation functions
- `src/service/search/index/indexService.ts:422-426` — `readOpts` construction with `includeLlmTags`

### 3.2 Graph-Based Signal — Tag Propagation from Neighbors

<!-- 基于图谱：邻居笔记的标签传播。如果 5 个链接笔记中 4 个都有 #distributed-systems，当前笔记大概率也应该有 -->

**Mechanism**: Query the knowledge graph for the target document's direct neighbors (outgoing wikilinks + backlinks). Collect their tags from `mobius_node.tags_json` via `decodeIndexedTagsBlob()`. Tags appearing on ≥ N neighbors (configurable, default 2) become candidates.

**Confidence formula**:
```
confidence_graph(tag, doc) = (count of neighbors with tag) / (total neighbor count)
                             × decay(avg_semantic_distance)
```

Where `avg_semantic_distance` is the average cosine distance between the doc embedding and tag-bearing neighbor embeddings (available from `sqlite-vec`), penalizing distant connections.

**Reason template**: "N of M linked notes share this tag" or "All notes in folder X use this tag".

**Existing infrastructure anchors**:
- `src/core/storage/sqlite/repositories/GraphRepo.ts:307-308` — `getByFromNodesAndTypes(docIds, GRAPH_TAGGED_EDGE_TYPES)` retrieves tag edges for documents
- `src/core/storage/sqlite/repositories/MobiusEdgeRepo.ts:224` — `GRAPH_TAGGED_EDGE_TYPES` edge type filter
- `src/core/po/graph.po.ts:43-48` — `GRAPH_TAGGED_EDGE_TYPES` definition (TaggedTopic, TaggedFunctional, TaggedKeyword, TaggedContext)
- `src/core/po/graph.po.ts:75-78` — `GRAPH_TAG_NODE_TYPES` (TopicTag, FunctionalTag, KeywordTag)
- `src/core/document/helper/TagService.ts:136-178` — `encodeIndexedTagsBlob()` / `decodeIndexedTagsBlob()`

### 3.3 History-Based Signal — User Tagging Habits

<!-- 基于历史：用户标签习惯学习，从 accept/reject 反馈和 folder 结构中推断 -->

**Mechanism**: Combine two sub-signals:

**A. Folder affinity** (structural context — Whittaker 2011: folder structure is a materialized mental model):
- Leverage existing `folderIntuitionMobius.ts` data — each folder has `topTags` and `topKeywords` pre-computed.
- When a document lives in folder X, and 80% of notes in X carry tag Y, suggest Y with folder-affinity confidence.

**B. Feedback learning** (requires Phase 4 data):
- Maintain a `tag_feedback_stats` table recording every accept/reject/edit.
- Tags with high accept rates get confidence boosts for similar documents.
- Rejection patterns: if user consistently rejects tag Y for docs in folder X, suppress it.
- Edit patterns: when user edits "machine-learning" → "ML", learn this synonym mapping.

**Confidence adjustment**:
```
confidence_adjusted = confidence_base × (1 + acceptance_boost) × (1 - rejection_penalty)
```

**Existing infrastructure anchors**:
- `src/core/storage/sqlite/repositories/folderIntuitionMobius.ts:11` — `MOBIUS_FOLDER_INTUITION.TOP_TAGS`
- `src/core/storage/sqlite/repositories/folderIntuitionMobius.ts:84` — `topTags: safeStringArray(attrs[...])`
- `src/service/search/index/helper/backbone/tagDisplayRank.ts:112-174` — `buildTagGlobalStats()` for folder-level tag statistics

### 3.4 Tag Normalization & Deduplication

<!-- 标签规范化：避免近义标签爆炸 -->

Before presenting suggestions, the engine must:

1. **Exact-match dedup**: Case-insensitive normalization via `tagDisplayRank.ts:normalizeTagKey()` (`src/service/search/index/helper/backbone/tagDisplayRank.ts:39-41`).
2. **Synonym detection**: Compare candidate tags against all existing vault tags using:
   - String similarity (Levenshtein distance ≤ 2 for short tags, or Jaccard on character trigrams > 0.7)
   - Semantic similarity (embedding cosine > 0.85 between tag label embeddings, if available)
   - Co-occurrence analysis (tags that always co-occur on the same docs may be redundant)
3. **Prefer existing**: When a candidate is synonymous with an existing vault tag, replace the candidate with the existing tag and note the mapping in the reason.
4. **Novel tag warning**: If a candidate has no close match, flag with `isExistingVaultTag: false` and surface `nearSynonyms` for user review.
5. **Noise filtering**: Apply `STATIC_ROW_NOISE` (`tagDisplayRank.ts:18-34`) to suppress workflow tags (`todo`, `wip`, `done`, `inbox`, `draft`...) unless confidence > 0.9. Apply `shouldHideTagFromFolderRows()` for vault-wide noise suppression.
6. **Hierarchy detection**: If vault uses nested tags (`#topic/subtopic`), suggest at the appropriate depth.

### 3.5 Scoring & Ranking

Final suggestion list is produced by:

1. Collect candidates from all signals (content + graph + history/folder).
2. Merge duplicates: same normalized tag from multiple sources → combine sources, use max confidence, concatenate reasons.
3. Apply history-based adjustment (§3.3B).
4. Apply noise filter.
5. Apply tag category weight priors from `tagDisplayRank.ts:TYPE_PRIOR` — `topic: 1.0`, `keyword: 0.82`, `functional: 0.22`.
6. Sort by confidence descending.
7. Cap at configurable limit (default: 8 topic + 3 functional + 5 context per document).
8. Minimum confidence threshold: 0.3 (suggestions below this are dropped).

**Score composition**:
```
score = w_content  × content_confidence
      + w_graph    × graph_propagation_score
      + w_folder   × folder_affinity_score
      - penalty_redundant   (if near-synonym of existing tag on this doc)
      - penalty_rejected    (if user previously rejected this tag for similar docs)
```

Default weights: `w_content = 0.5`, `w_graph = 0.3`, `w_folder = 0.2`.

---

## 4. Trigger Modes

### 4.1 Single-Document Mode — Copilot Command

<!-- 与现有 Copilot 命令模式完全一致：copilot-commands.ts 的 buildCopilotCommands 模式 -->

**Trigger**: User invokes `Copilot: Suggest Tags` command (command palette or future toolbar icon on active document).

**Flow**:
1. Extract document content + metadata via `getContext()` (same pattern as `copilot-commands.ts:23-31`).
2. Query graph neighbors and folder context from SQLite (< 200ms).
3. Run LLM content analysis via `AIServiceManager.queryStructured()` with `PromptId.DocTagSuggest`.
4. Merge all signals → produce ranked `TagSuggestion[]`.
5. Open `CopilotResultModal` with `type: 'suggest-tags'` → render `TagSuggestPanel`.

**Latency budget**: < 5s total (dominated by LLM call). Graph/folder signals are local SQLite queries (< 200ms combined).

**Integration**: New entry in `copilot-commands.ts` alongside existing `peak-copilot-polish`, `peak-copilot-review`, `peak-copilot-suggest-links`, `peak-copilot-split`.

### 4.2 Batch Mode — Folder Scan

**Trigger**: User runs `Copilot: Batch Tag Suggestions` command → folder picker (`FuzzySuggestModal`) → scan all documents in folder.

**Flow**:
1. User selects folder via Obsidian `FuzzySuggestModal`.
2. Filter: skip already-well-tagged docs (> N existing topic tags, configurable) unless user opts to force re-analyze.
3. For each document: run suggestion engine. LLM calls batched with `AdaptiveConcurrencyPool` (existing infrastructure: `src/core/utils/adaptive-concurrency.ts`, used in `indexService.ts` for LLM enrichment). Default concurrency: 3 parallel LLM calls.
4. Present results in batch review modal: scrollable document list with per-doc tag suggestions.
5. User reviews per-tag (accept/reject/edit) or per-document, then "Apply All Accepted".

**Progress UX**: `Notice` with progress bar ("Analyzing 14/50 documents..."), cancel button. Reuse pattern from `openProgressNotice()` in `copilot-commands.ts:12-17`.

### 4.3 Ambient Mode — Sidebar Suggestions (Future, depends on S1)

<!-- Ambient 模式与 S1 Ambient Push 结合：写作时 sidebar 实时建议标签。需要 S1 的事件触发基础设施 -->

**Trigger**: Automatic, when user is editing a document and the Ambient Push sidebar is open.

**Preconditions**: S1 Ambient Push infrastructure must be in place (event listener + context extraction + sidebar panel).

**Flow**:
1. Debounced document change listener (10s idle after > 50 characters changed since last check).
2. Run lightweight suggestion engine — graph + folder signals only (skip LLM to avoid latency/cost).
3. If content change is substantial (> 200 chars), queue LLM analysis at low priority.
4. Update sidebar panel with fresh suggestions in a collapsible "Suggested Tags" section.

**Design constraint**: Must follow Mankoff 2003 ambient display principles — glanceable, non-intrusive, peripheral-to-focal attention transition. Suggestions appear as a sidebar section, not popups or notifications.

**Dependency**: Blocked on S1 Ambient Push implementation. This mode shares the same sidebar infrastructure and registers as a "push source" in the Ambient Push framework.

---

## 5. UI Design

### 5.1 TagSuggestPanel (Single-Document Mode)

Rendered inside `CopilotResultModal` (same modal shell as polish/review/links/split panels, `src/ui/view/copilot/CopilotResultModal.tsx`).

**Layout**:
```
┌──────────────────────────────────────────────────┐
│  Suggested Tags for "Note Title"                 │
│                                                  │
│  ┌─ Topic Tags ─────────────────────────────────┐│
│  │ ┌──────────────────────────────────────────┐ ││
│  │ │ distributed-systems          0.92        │ ││
│  │ │   "Content discusses CAP theorem and     │ ││
│  │ │    Paxos; 3/4 linked notes share this"   │ ││
│  │ │   [Accept] [Edit] [Reject]               │ ││
│  │ └──────────────────────────────────────────┘ ││
│  │ ┌──────────────────────────────────────────┐ ││
│  │ │ consensus-protocol   0.78   NEW          │ ││
│  │ │   "Core topic; similar to existing       │ ││
│  │ │    'consensus-algorithms'"               │ ││
│  │ │   Near: consensus-algorithms             │ ││
│  │ │   [Accept] [Use Existing] [Reject]       │ ││
│  │ └──────────────────────────────────────────┘ ││
│  └───────────────────────────────────────────────┘│
│                                                  │
│  ┌─ Functional Tags ────────────────────────────┐│
│  │ ...                                          ││
│  └───────────────────────────────────────────────┘│
│                                                  │
│  ┌─ Context Tags ───────────────────────────────┐│
│  │ ...                                          ││
│  └───────────────────────────────────────────────┘│
│                                                  │
│  Write to: (o) Frontmatter  ( ) Inline #hashtags │
│  [Accept All Selected] [Reject All]    N selected│
└──────────────────────────────────────────────────┘
```

**Components**:
- **TagSuggestionCard**: One card per suggestion. Shows: tag label, confidence badge (color-coded: green > 0.7, amber > 0.4, gray otherwise), source icons (Lucide: `FileText` for content, `Network` for graph, `FolderTree` for folder, `History` for history), reason text (1-2 lines). Action buttons using shadcn `Button`:
  - Accept — writes tag to document
  - Edit — inline text input replaces tag label, then accept modified version
  - Reject — dismisses suggestion + records feedback
  - "Use Existing" dropdown (only for novel tags with nearSynonyms) — select an existing tag instead
- **Section headers**: Group by category (Topic / Functional / Context). Each section is collapsible with Lucide `ChevronDown`/`ChevronUp`.
- **Bulk actions footer**: "Accept All Selected" (checkbox-driven), "Reject All". Sticky at bottom.
- **Tag write target selector**: Radio toggle — write to `frontmatter tags:` field vs inline `#hashtags`. User preference persisted to settings.

**Tag write mechanism**: Use `app.fileManager.processFrontMatter()` for frontmatter tags (established pattern in Obsidian API). For inline hashtags, insert at cursor position or document end.

### 5.2 Batch Review Panel

For batch mode, a dedicated modal (or extended `CopilotResultModal` variant) with a scrollable document list:

```
┌────────────────────────────────────────────────────┐
│  Batch Tag Suggestions — /folder/path  (14 docs)   │
│                                                    │
│  ┌─ note-a.md ───────────────────────────────────┐│
│  │ [v] distributed-systems (0.92)                 ││
│  │ [v] cap-theorem (0.85)                         ││
│  │ [ ] consensus (0.51)                           ││
│  └────────────────────────────────────────────────┘│
│  ┌─ note-b.md ───────────────────────────────────┐│
│  │ [v] react-hooks (0.88)                         ││
│  │ [ ] javascript (0.42)  ~ js (existing)         ││
│  └────────────────────────────────────────────────┘│
│  ...                                               │
│                                                    │
│  [Apply Selected (7 tags)] [Skip All]              │
└────────────────────────────────────────────────────┘
```

Compact layout: one row per tag suggestion. Checkboxes default to checked for confidence > 0.7. Click document row to expand and see reasons. Hover tag to see reason tooltip.

### 5.3 Ambient Sidebar Section (Future — S1 Dependency)

A collapsible section in the Ambient Push sidebar panel:

```
┌─ Suggested Tags ──────────────── [v] ─┐
│ + distributed-systems      [+] [x]    │
│ + cap-theorem              [+] [x]    │
│ + consensus                [+] [x]    │
└───────────────────────────────────────┘
```

Minimal: tag label + accept/reject icon buttons (Lucide `Plus` and `X`). Reason visible on hover card. Updates reactively as user writes. Fully glanceable per Mankoff 2003.

---

## 6. Data Model

### 6.1 Tag Suggestion Records

<!-- 建议记录存储在 chat.sqlite（用户交互数据），不是 vault.sqlite（索引数据） -->

Stored in `chat.sqlite` (user interaction data, not vault index data).

```sql
CREATE TABLE IF NOT EXISTS tag_suggestion (
  id              TEXT PRIMARY KEY,           -- UUID
  doc_path        TEXT NOT NULL,              -- Vault-relative document path
  tag             TEXT NOT NULL,              -- Normalized tag label
  category        TEXT NOT NULL,              -- 'topic' | 'keyword' | 'functional' | 'context'
  confidence      REAL NOT NULL,              -- 0..1
  sources         TEXT NOT NULL,              -- JSON array of SuggestionSource strings
  reason          TEXT NOT NULL,              -- Human-readable explanation
  is_existing     INTEGER NOT NULL DEFAULT 0, -- 1 if tag exists in vault; 0 if novel
  near_synonyms   TEXT,                       -- JSON array of strings (nullable)
  status          TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'accepted' | 'rejected' | 'edited'
  edited_tag      TEXT,                       -- If status='edited', what user changed it to
  created_at      INTEGER NOT NULL,           -- Unix ms
  resolved_at     INTEGER,                    -- Unix ms when user acted
  batch_id        TEXT,                       -- Groups suggestions from same trigger (nullable)
  UNIQUE(doc_path, tag, batch_id)
);

CREATE INDEX idx_tag_suggestion_doc ON tag_suggestion(doc_path);
CREATE INDEX idx_tag_suggestion_status ON tag_suggestion(status);
CREATE INDEX idx_tag_suggestion_tag ON tag_suggestion(tag);
```

### 6.2 Tag Feedback Aggregation

For learning from user feedback over time:

```sql
CREATE TABLE IF NOT EXISTS tag_feedback_stats (
  tag             TEXT PRIMARY KEY,           -- Normalized tag label
  category        TEXT NOT NULL,              -- 'topic' | 'keyword' | 'functional' | 'context'
  accept_count    INTEGER NOT NULL DEFAULT 0,
  reject_count    INTEGER NOT NULL DEFAULT 0,
  edit_count      INTEGER NOT NULL DEFAULT 0,
  doc_count       INTEGER NOT NULL DEFAULT 0, -- How many vault docs currently use this tag
  first_seen      INTEGER NOT NULL,           -- Unix ms
  last_suggested  INTEGER NOT NULL,           -- Unix ms
  synonyms        TEXT,                       -- JSON array: known synonyms from user edits
  acceptance_rate REAL                        -- Computed: accept / (accept + reject + edit)
);
```

A tag with high rejection rate (reject / total > 0.7) gets a permanent confidence penalty. A tag with high acceptance rate (accept / total > 0.8) gets a confidence boost.

### 6.3 Feedback Loop Data Flow

```
User Action              →  tag_suggestion update        →  tag_feedback_stats update
──────────────────────────────────────────────────────────────────────────────────────
Accept "distributed-sys" →  status='accepted'            →  accept_count++
Reject "ML"              →  status='rejected'            →  reject_count++, acceptance_rate ↓
Edit "ML" → "ml"         →  status='edited', edited_tag  →  edit_count++, synonyms += mapping
Accept via "Use Existing"→  status='accepted' (existing  →  accept_count++ for existing tag;
  synonym dropdown          tag replaces novel)              original tag gets reject count
```

### 6.4 Integration with Existing Storage

- **`mobius_node.tags_json`** — Read existing tags to avoid redundant suggestions; also write accepted LLM-derived topic tags directly (bypasses re-indexing for immediate graph integration).
- **`mobius_node.attributes_json`** — Read enrichment status to check if LLM tags were already generated (cache optimization for Signal A).
- **Vault frontmatter / inline hashtags** — The primary write target when user accepts tags. Uses Obsidian `app.fileManager.processFrontMatter()`.
- **`mobius_edge` (tagged_* types)** — Read for graph-based signal (§3.2); written by the normal indexing pipeline after frontmatter is updated.

---

## 7. Integration Points

### 7.1 Copilot Command System

<!-- 遵循 copilot-commands.ts 的既有模式 -->

New command in `copilot-commands.ts` (`src/app/commands/copilot-commands.ts:20-143`):

```
{
  id: 'peak-copilot-suggest-tags',
  name: 'Copilot: Suggest Tags',
  callback: async () => {
    const ctx = await getContext();
    // ... run suggestion engine, open CopilotResultModal type='suggest-tags'
  }
}
```

New schema in `copilot-schemas.ts` (`src/service/copilot/copilot-schemas.ts`):

```
tagSuggestionsSchema = z.object({
  suggestions: z.array(z.object({
    tag: z.string(),
    category: z.enum(['topic', 'keyword', 'functional', 'context']),
    confidence: z.number().min(0).max(1),
    reason: z.string(),
    isExisting: z.boolean(),
    nearSynonyms: z.array(z.string()).optional(),
  })),
})
```

### 7.2 CopilotResultModal — New Panel Type

Extend `CopilotResultType` union (`src/ui/view/copilot/CopilotResultModal.tsx:9`):
```
type CopilotResultType = 'polish' | 'review' | 'suggest-links' | 'split' | 'suggest-tags';
```

Add lazy-loaded `TagSuggestPanel` case in the switch statement (`:21-42`).

New panel file: `src/ui/view/copilot/panels/TagSuggestPanel.tsx`.

### 7.3 tagDisplayRank.ts — Noise Suppression

- Reuse `STATIC_ROW_NOISE` (`src/service/search/index/helper/backbone/tagDisplayRank.ts:18-34`) to suppress workflow tags from suggestions.
- Reuse `shouldHideTagFromFolderRows()` (`:56-64`) for vault-wide noise suppression.
- Reuse `buildTagGlobalStats()` (`:112-174`) for folder-DF and root-DF statistics — higher IDF = more discriminative = higher suggestion confidence.
- Reuse `TYPE_PRIOR` (`:11-15`) for category weighting: `topic: 1.0`, `keyword: 0.82`, `functional: 0.22`.

### 7.4 indexService.ts — Decoupled, Read-Only

The suggestion engine is intentionally **decoupled from the indexing pipeline**:
- Indexing runs on vault events (file save/create) and must be fast (`listener_fast` mode: `includeLlmTags: false`, `src/service/search/index/types.ts:56-67`).
- Suggestion generation is user-initiated (Copilot command) or low-priority background (ambient mode).
- The two pipelines share the LLM prompt infrastructure but operate independently.

Read-only interactions with the index:
- Read `mobius_node.tags_json` to check if LLM tags already exist (cache for Signal A).
- Read `mobius_edge` with `GRAPH_TAGGED_EDGE_TYPES` for graph-based signal (Signal B).

When user accepts tags and they are written to frontmatter, the normal `listener_fast` indexing pipeline picks them up automatically on the next vault event. For immediate graph integration, also write accepted topic tags directly to `mobius_node.tags_json` and upsert corresponding `mobius_edge` rows with `tagged_topic` type.

### 7.5 PromptId & Template

Register new prompt:

| PromptId | Purpose | Template |
|----------|---------|----------|
| `DocTagSuggest` | Analyze document + vault context → suggest tags with reasons | `doc-tag-suggest.hbs` |
| `DocTagSuggestSystem` | System prompt with taxonomy constraints | `doc-tag-suggest-system.hbs` |

The `doc-tag-suggest.hbs` prompt extends `doc-tag-generate-json.md` with:
- `reason` field in each tag entry output
- Existing vault tags (top 50 by doc count) as context to encourage reuse
- Neighbor note titles + their tags for cross-note reasoning
- Instruction to flag near-synonyms when suggesting novel tags

**Alternative**: Extend the existing `DocTagGenerateJson` prompt to always include reasons (backwards-compatible — existing callers ignore the extra field). This avoids prompt duplication.

Anchor: `src/service/prompt/PromptId.ts:61`, `templates/prompts/doc-tag-generate-json.md`.

### 7.6 TagService.ts — Validation

All suggestion engine output passes through existing validation:
- `filterValidFunctionalTagEntries()` — ensures functional tags are from the closed vocabulary (`FUNCTIONAL_TAG_IDS` in `search-agent-schemas.ts`).
- `sanitizeContextTagsForAxis()` — validates context tag prefix patterns (Time*, Geo*, Person*).
- `normalizeTagKey()` from tagDisplayRank — case normalization.

Anchor: `src/core/document/helper/TagService.ts:0-95`.

---

## 8. Implementation Phases

### Phase 1 — Foundation: Core Engine + Single-Doc Command

Deliverables: user can run `Copilot: Suggest Tags` on the active document and see suggestions with reasons.

1. **Schema + Repository**: Create `tag_suggestion` table in `chat.sqlite`. Write `TagSuggestionRepo` with CRUD + feedback recording.
2. **Prompt**: Create `PromptId.DocTagSuggest` + template (`doc-tag-suggest.hbs`) — extend `doc-tag-generate-json.md` with `reason` field and vault tag vocabulary context.
3. **TagSuggestionEngine**: Core class with `suggest(docPath): Promise<TagSuggestion[]>`:
   - Signal A: LLM content analysis via `AIServiceManager.queryStructured()`.
   - Signal B: Graph neighbor tag query via `GraphRepo.getByFromNodesAndTypes()` + `decodeIndexedTagsBlob()`.
   - Signal C: Folder affinity from `folderIntuitionMobius` `topTags`.
   - Merge + normalize + rank.
4. **TagSuggestPanel**: React panel in `src/ui/view/copilot/panels/TagSuggestPanel.tsx`.
5. **Copilot command**: `peak-copilot-suggest-tags` in `copilot-commands.ts`.
6. **CopilotResultModal extension**: Add `'suggest-tags'` type + router case.
7. **Tag write-back**: Accept action writes to frontmatter via `processFrontMatter()` + optional direct write to `mobius_node.tags_json` for immediate graph visibility.

### Phase 2 — Vocabulary Intelligence

8. **Tag vocabulary builder**: Scan `mobius_node.tags_json` across vault → populate `tag_feedback_stats.doc_count`. Run on index completion.
9. **Synonym detection**: String similarity (trigram Jaccard) + optional embedding cosine for tag label pairs.
10. **"Use Existing" UX**: When novel tag has near-synonyms, show dropdown to select existing tag instead of the novel suggestion.
11. **Noise suppression integration**: Wire `shouldHideTagFromFolderRows()` + `STATIC_ROW_NOISE` into suggestion filtering pipeline.

### Phase 3 — Batch Mode

12. **Folder picker**: `FuzzySuggestModal` for folder selection.
13. **Batch engine**: Map with `AdaptiveConcurrencyPool` (concurrency: 3). Skip docs with fresh LLM tags in `tags_json`.
14. **Batch review panel**: Compact multi-document tag review modal with per-doc expand/collapse.
15. **Bulk accept/reject**: Write tags to all selected documents in one operation with progress notice.

### Phase 4 — Feedback Learning

16. **Feedback persistence**: Record accept/reject/edit to `tag_suggestion` table; aggregate to `tag_feedback_stats`.
17. **Acceptance rate computation**: Update `tag_feedback_stats.acceptance_rate` after each batch of feedback.
18. **History-based confidence adjustment**: Boost/penalize Signal C based on historical acceptance rate.
19. **Synonym learning from edits**: When user edits "ML" → "machine-learning", persist synonym pair to `tag_feedback_stats.synonyms`.

### Phase 5 — Ambient Mode (Depends on S1)

20. **Sidebar section**: Collapsible "Suggested Tags" in Ambient Push sidebar.
21. **Debounced trigger**: Content change listener with lightweight (non-LLM) signal refresh.
22. **LLM queue**: Low-priority background LLM analysis for substantial content changes (> 200 chars delta).

---

## 9. Performance Constraints

| Operation | Budget | Strategy |
|-----------|--------|----------|
| Single-doc LLM analysis (Signal A) | < 5s | One `queryStructured` call; reuse cached LLM tags if available |
| Graph signal computation (Signal B) | < 200ms | 1-hop neighbor lookup from SQLite; tag aggregation in memory |
| Folder/history signal (Signal C) | < 100ms | `folderIntuitionMobius` data pre-cached; `tag_feedback_stats` indexed |
| Tag normalization + dedup | < 50ms | String ops against top-200 tags; no LLM call |
| Batch mode (per doc, amortized) | < 500ms avg | Skip docs with cached tags; 3 concurrent LLM calls |
| Frontmatter write | < 50ms | Single `processFrontMatter()` per document |
| Ambient mode (non-LLM) | < 300ms | Graph + folder signals only; no LLM |

**Bottleneck**: LLM call (Signal A) dominates latency. Mitigations:
1. Cache: check `mobius_node.tags_json` for prior LLM tags before calling LLM.
2. Batch: for batch mode, use `AdaptiveConcurrencyPool` with 3 concurrent calls.
3. Ambient: skip LLM entirely; use graph + folder signals for < 300ms total.

---

## Appendix A: Risk & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| LLM cost for batch mode (50+ docs) | High API spend | Progress notice with document count; concurrency cap at 3; skip docs with fresh tags |
| Tag vocabulary drift across suggestion batches | Inconsistent suggestions | Refresh `tag_feedback_stats.doc_count` before each batch; deduplicate within batch |
| User ignores suggestions (low engagement) | Wasted compute | Track engagement rate; if < 10% acceptance over 30 days, surface a "disable suggestions?" prompt |
| Novel tags bypass existing taxonomy | Tag inflation | Default "prefer existing" bias in prompt; prominently flag novel tags with near-synonym dropdown |
| Prompt regression changes tag quality | Silent degradation | Template versioning; fixture tests with known docs → expected tag outputs |

## Appendix B: Prompt Design Notes

<!-- 提示词设计要点 -->

The `doc-tag-suggest.hbs` prompt must include:

1. **Existing vault tags** (top 50 by doc count from `tag_feedback_stats`) — so the LLM prefers aligned tags, not novel ones.
2. **Document's current tags** (from frontmatter + inline hashtags) — to avoid redundant suggestions.
3. **Neighbor note titles + their tags** (from graph signal pre-computation) — graph context for cross-note reasoning.
4. **Instructions**:
   - Prefer existing vault tags over novel ones.
   - Each suggestion must include a `reason` field (1 sentence).
   - Categorize as topic / keyword / functional / context.
   - Maximum 8 topic + 3 functional + 5 context suggestions per document.
   - If the document is already well-tagged (existing tags cover its content well), return fewer or zero suggestions.
   - When suggesting a novel tag, list any existing tags that are semantically close.
