# Vault Search Redesign: Search-First with Inspector Side Panel

## Overview

Redesign the Vault Search tab from a dual-purpose search/inspect panel into a focused, VS Code-style command palette with an optional inspector side panel. Core principle: **search results are always visible; inspector is a companion, not a replacement.**

Key changes:
1. Inspector moves from full-panel takeover to a 340px right side panel
2. Mode switching via prefix characters (VS Code model) with `?` help, replacing hidden hover-card
3. Inspector becomes query-aware — filters links/graph by search query relevance
4. Topic navigation — clicking inspector links keeps the query filter active
5. Existing AI Graph results surfaced in inspector; new generation is user-triggered

## Layout Structure

```
SearchModal (flex col)
├── Tab bar — flex-shrink: 0
├── Input row — flex-shrink: 0
│     ├── Search input (with mode badge on right: "vault" | "in-file" | "folder" | "line")
│     └── "✨ AI" button (compact, secondary action — switches to AI Analysis tab)
├── Content area — flex: 1, min-height: 0, display: flex (horizontal)
│     ├── Results panel — flex: 1, overflow-y: auto
│     │     ├── Group label ("Recently opened" / "Best matches")
│     │     └── SearchResultRow items (icon + title + path + snippet + score/time)
│     └── Inspector panel — width: 340px, flex-shrink: 0, overflow-y: auto
│           ├── Header (file icon + title + close button)
│           ├── Outgoing links (query-filtered)
│           ├── Backlinks (query-filtered)
│           ├── Similar notes (with similarity %)
│           ├── Scoped graph (mini, 1-hop, query-filtered)
│           └── AI Graph section (past results + generate button)
└── Footer — flex-shrink: 0 (keyboard hints + result count + search duration)
```

## Search Modes (Prefix-driven)

Following VS Code's proven model. All modes produce a flat list — no mode changes the UI paradigm.

| Prefix | Mode | Badge text | Description |
|---|---|---|---|
| *(none)* | vault | `vault` | Search all notes by title, content, and path |
| `#` | inFile | `in-file` | Search headings and content within the active file |
| `@` | inFolder | `folder` | Search within the current file's folder |
| `:` | goToLine | `line` | Jump to a specific line number in the active file |
| `?` | help | `help` | Show all available modes as a navigable list |

### Removed

- `[[` prefix for inspector — inspector is now a view toggle (`→` key), not a search mode
- Hover-card mode switcher icon — replaced by mode badge in input + `?` help

### Mode Badge

A small pill shown at the right edge inside the input field, displaying the current mode name. Always visible, no hover needed. Updates live as prefixes are typed or cleared.

## Before-Typing State

When the modal opens with no query, the results panel shows two groups:

1. **Recently opened** — files the user recently navigated to (from `mobius_node.lastOpenTs`). The active document is always the first item and pre-selected.
2. **Recently modified** — files recently edited but not necessarily opened in this session.

The inspector panel (if previously toggled open — state persists) automatically shows the active document's context.

Footer shows: vault note count (e.g., "1,247 notes in vault").

## Inspector Side Panel

### Toggle Behavior

- Press `→` key to open inspector for the selected result
- Press `←` or click close button to close inspector
- Inspector open/close state persists across modal openings
- As user navigates results with `↑↓`, inspector updates to show the newly selected item
- Inspector is desktop-only (hidden on mobile)

### Content Sections (top to bottom)

**Header** — sticky, shows file icon + note title + close (✕) button.

**Outgoing links** — wikilinks found in the note. When a search query is active, each link shows a relevance score. Links above a threshold are highlighted (✓ + score), links below are dimmed with lower opacity. Sorted by relevance (query active) or alphabetically (no query).

**Backlinks** — notes that link to the selected note. Same query-aware filtering as outgoing links.

**Similar notes** — top 4 semantically similar notes from vector search (existing `SemanticRelatedEdgesReadService`). Shows similarity percentage. When query is active, results are intersected with query relevance — only notes similar to BOTH the selected note AND the query are shown.

**Scoped graph** — compact 1-hop graph preview. When query is active, only query-relevant nodes are shown (non-relevant nodes hidden). Click to expand to fullscreen graph overlay (existing fullscreen graph portal).

**AI Graph section** — two sub-elements:
1. **Past AI Graph results** — queries `ai_analysis_record` for `analysis_preset = 'aiGraph'` with query similar to the current search term (fuzzy match or vector similarity). If found, shows: query text, node/edge count, generation time, "Open ↗" link to view the cached result. Multiple matches: show the most recent.
2. **Generate new AI Graph** — button labeled "Generate AI Graph" with subtitle "Uses AI credits". User-triggered only. Sends current search query + selected note as context to `AIGraphAgent`.

### Query-Aware Filtering

When the search input has a query:

1. Each link/backlink is scored against the query using the existing search infrastructure:
   - Fast path: BM25 match against the linked note's title + first 200 chars
   - If embeddings available: cosine similarity between query embedding and note embedding
2. Links with relevance > threshold (e.g., 0.3): shown normally with ✓ badge and score %
3. Links with relevance ≤ threshold: shown with lower opacity (dimmed), no badge
4. Sort order: relevance descending (high-relevance links first)

When search input is empty: all links shown normally, no filtering, sorted by default order.

### Topic Navigation

Clicking a link name in the inspector:
1. The clicked note becomes the selected item in the results panel (scrolled into view if needed, or added temporarily if not in current results)
2. The inspector updates to show the clicked note's links/backlinks/similar
3. **The search query in the input is preserved** — so the new inspector view is still filtered by the same topic
4. This enables A → B → C traversal while maintaining topic scope

## Search Results

### SearchResultRow (enhanced)

Each result shows:
- **File icon** — type-specific (📄 markdown, 📎 attachment, etc.)
- **Title** — with keyword highlighting (`<mark>`)
- **Path** — last 2 segments, with keyword highlighting
- **Content snippet** — 2-line clamp, with keyword highlighting (existing `highlightText` + `renderHighlightedSnippet`)
- **Relevance score** — percentage badge (purple background) for vault/folder search modes. Derived from the existing tri-hybrid search score, normalized to 0-100%.
- **Time** — human-readable relative time, shown instead of score for results where time is more relevant (e.g., when results are equally relevant)

Selected state: left purple accent bar (3px) + light indigo background.

### In-file Search Results

Each result shows:
- **Level icon** — heading level (H1, H2, H3) or paragraph (¶)
- **Content** — the matched heading or text line, with highlighting
- **Line number** — "Line 42"
- Enter jumps to that line in the editor

### Mode Help Results (? prefix)

Each result shows:
- **Prefix icon** — the prefix character in a purple badge
- **Mode name** — bold
- **Description** — what the mode searches
- **Prefix key** — on the right side
- Clicking a mode result fills the input with that prefix

## Keyboard Navigation

| Key | Action |
|---|---|
| `↑` `↓` | Navigate results |
| `↵` | Open selected result |
| `⌘↵` | Open in new tab |
| `→` | Toggle inspector panel open |
| `←` | Close inspector panel |
| `⌥↑` `⌥↓` | Cycle search modes |
| `Tab` | Switch to AI Analysis tab |
| `Esc` | Close modal |
| `⌫` on empty prefix | Return to vault mode |

## Files Affected

| File | Change |
|---|---|
| **Modal shell** | |
| `SearchModal.tsx` | Remove hover-card mode switcher (lines 469-558), add mode badge in input, move footer to modal level |
| **Results** | |
| `tab-VaultSearch.tsx` | Refactor: results-panel as flex child, add inspector toggle state |
| `VaultSearchResult.tsx` | Add relevance score badge |
| **Inspector** | |
| `components/inspector/InspectorPanel.tsx` | Refactor → `InspectorSidePanel.tsx`: 340px side panel layout |
| `components/inspector/LinksSection.tsx` | Add query-aware filtering + relevance scoring |
| `components/inspector/GraphSection.tsx` | Add query-scoped node filtering, compact mini-graph mode |
| New: `components/inspector/AIGraphSection.tsx` | Past AI Graph lookup + generate button |
| **Modes** | |
| `store/vaultSearchStore.ts` | Remove `[[` inspector mode, add `?` help mode |
| New: `components/ModeHelpList.tsx` | Renders mode help when `?` typed |
| **Services** | |
| `service/search/inspectorService.ts` | Add `filterLinksByQuery()` method |
| `AIAnalysisHistoryService.ts` | Add `findRelatedAIGraph(query)` method |
| **Removed** | |
| Inspector sub-tabs (Links/Graph/History nav bar) | Replaced by vertical sections in side panel |
| `[[` prefix mode handling | Inspector is a view toggle, not a search mode |
