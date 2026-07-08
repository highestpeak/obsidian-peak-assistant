# Plan · Vault Search Heading Mode + Result Graph View

**Spec:** [`../specs/2026-07-07-vault-search-heading-graph-navigation.md`](../specs/2026-07-07-vault-search-heading-graph-navigation.md)
**Date:** 2026-07-07
**Delivery model:** one-shot (single landed change set), parallelizable across 3 waves.

## Goal

Implement everything in the spec — Heading mode outline tree, Result Graph View projection, Hub Reference inspector block, Folder/Line removal — in a single coordinated change that lands together. No phased rollout; the spec is small enough and the pieces couple tightly enough that shipping in halves would just create a broken intermediate state.

## Key Architectural Decisions Locked

Before dispatching, these five decisions are set and are not up for re-litigation inside track work:

1. **Mode enum shrinks to `all | heading | help`.** The current `inFile` becomes `heading` (rename + UI upgrade). `inFolder` and `goToLine` are deleted along with their `@` and `:` parsers. `?` for help stays. `#` still triggers what is now Heading mode.
2. **Result Graph View is a projection toggle on top of `all` and `heading` result panes**, not a mode. State lives on the store as `resultView: 'list' | 'graph'`.
3. **Hub graph subview = Result Graph View auto-scoped to a hub's constituents** — no new surface. Cmd+click on a hub anchor node (in graph) or on a hub reference row (in Inspector) sets the query scope to the hub's constituent doc set and forces `resultView = 'graph'`.
4. **@xyflow/react** is the rendering library. Pattern reference: `src/ui/component/mine/multi-lens-graph/`.
5. **Node cap 100**, top-by-score cutoff, sparse-fallback banner. Deferred: arrow-key node focus in graph, edge-reason hover tooltips beyond edge-kind label. Both are follow-up spec territory, not this plan.

## File Ownership Map

Prevents parallel tracks from stepping on each other. Every touched file listed by owning track. Anything not in this map is out of scope for this plan.

| Track | Owned files | Kind |
| --- | --- | --- |
| T0 | `src/ui/view/quick-search/store/vaultSearchStore.ts` (enum + parseQuickSearchInput) | edit |
| T1 | `src/service/search/query/query-parser.ts` (folder/line parsing removal), test files under `test/quick-search/*folder*`, `test/quick-search/*line*` (delete) | edit + delete |
| T1 | `src/ui/view/quick-search/hooks/useVaultSearch.ts` (drop inFolder/goToLine branches) | edit |
| T1 | `src/ui/view/quick-search/components/ModeHelpList.tsx` (drop help entries) | edit |
| T1 | `src/ui/view/quick-search/SearchModal.tsx` (drop inFolder/goToLine label branches) | edit |
| T2a | `src/service/search/graph/resultSubgraph.ts` (**new**) | new |
| T2a | `test/search/resultSubgraph.test.ts` (**new**) | new |
| T2b | `src/service/search/heading/headingTree.ts` (**new**) | new |
| T2b | `src/service/search/heading/sectionSnippets.ts` (**new**) | new |
| T2b | `test/search/headingTree.test.ts` (**new**) | new |
| T3 | `src/ui/view/quick-search/components/ResultPaneHeader.tsx` (**new**, toggle icon) | new |
| T3 | `src/ui/view/quick-search/store/vaultSearchStore.ts` (add `resultView` field only — coordinate with T0) | edit |
| T3 | `src/ui/view/quick-search/tab-VaultSearch.tsx` (swap list ↔ graph render) | edit |
| T4 | `src/ui/view/quick-search/components/result-graph/ResultGraphView.tsx` (**new**) | new |
| T4 | `src/ui/view/quick-search/components/result-graph/HubAnchorNode.tsx` (**new**) | new |
| T4 | `src/ui/view/quick-search/components/result-graph/ResultDocNode.tsx` (**new**) | new |
| T4 | `src/ui/view/quick-search/components/result-graph/CommunityBackground.tsx` (**new**) | new |
| T4 | `src/ui/view/quick-search/components/result-graph/FolderBoundary.tsx` (**new**) | new |
| T4 | `src/ui/view/quick-search/components/result-graph/IsolatedMatchesRail.tsx` (**new**) | new |
| T4 | `src/ui/view/quick-search/components/result-graph/SparseFallbackBanner.tsx` (**new**) | new |
| T5 | `src/ui/view/quick-search/components/heading-mode/HeadingTree.tsx` (**new**) | new |
| T5 | `src/ui/view/quick-search/components/heading-mode/HeadingRow.tsx` (**new**) | new |
| T5 | `src/ui/view/quick-search/components/heading-mode/SectionDetailPane.tsx` (**new**) | new |
| T5 | `src/ui/view/quick-search/components/heading-mode/LinkPositionsFooter.tsx` (**new**) | new |
| T5 | `src/ui/view/quick-search/hooks/useHeadingModeKeyboard.ts` (**new**) | new |
| T6 | `src/service/search/inspectorService.ts` (add hub reference lookup call) | edit |
| T6 | `src/ui/view/quick-search/components/inspector/HubReferenceBlock.tsx` (**new**) | new |
| T6 | The Inspector composition file (identify during T6 kickoff — likely under `components/inspector/`) | edit |
| T7 | Cross-file wiring: click handlers in `HubReferenceBlock.tsx` and `HubAnchorNode.tsx` both call the same `openHubGraphSubview(hubNodeId)` helper | edit |
| T7 | `src/ui/view/quick-search/hooks/useOpenHubGraphSubview.ts` (**new**, single helper) | new |
| T8 | Integration in `tab-VaultSearch.tsx`, smoke tests, AC verification | edit |

## Track Breakdown

Each track is self-contained enough to dispatch to a separate agent. Each has its own inputs, outputs, and acceptance criteria.

### T0 · Mode Enum Refactor (blocking prep, ~small)

**Inputs:** spec §User Intent, spec §Recommended Direction.

**Do:**
1. Change `QuickSearchMode` to `'all' | 'heading' | 'help'` in `store/vaultSearchStore.ts`.
2. Rename `vault` → `all` everywhere it appears as a string literal.
3. Rename `inFile` → `heading` everywhere it appears as a string literal.
4. Update `parseQuickSearchInput` to drop `@` and `:` branches. `#` now sets `mode = 'heading'`. Remove the `inFolder` and `goToLine` fallback blocks. Remove `folderPath` / line-number scope handling.
5. Update `SearchQuery.scopeMode` type / uses if any (search codebase).

**Blocks:** T1, T3, T5, T8.

**Done when:** codebase compiles with the new enum; grep for `'vault'`, `'inFile'`, `'inFolder'`, `'goToLine'` returns only historical references in specs/docs (not in `src/**`).

### T1 · Delete Folder / Line Stack (parallel with T0-completion)

**Inputs:** T0 completed.

**Do:**
1. Delete `@` and `:` prefix parsing from `query-parser.ts` (and any related helpers).
2. Delete `inFolder` and `goToLine` code paths in `useVaultSearch.ts`, `SearchModal.tsx`, and any downstream consumers.
3. Drop the "Folder" and "Line" entries in `ModeHelpList.tsx`.
4. Delete tests specific to folder / line modes (grep `test/quick-search`).
5. Delete any settings entries that only served these modes (grep `settingsTypes.ts` for `inFolder` / `goToLine`).
6. Verify no `folder:` / `folder_path` scope filter code remains outside legitimate uses (folder view etc.).

**Done when:** grep for `inFolder`, `goToLine`, `parseFolder`, `parseLine` inside `src/**` returns no matches; `npm run test` still passes; no orphan imports.

### T2a · Result Subgraph Service (parallel, independent)

**Inputs:** spec §Result Graph View · Content Layers, §Isolated Result Nodes, §Node Cap.

**Do:** create `src/service/search/graph/resultSubgraph.ts` exposing:

```ts
export interface ResultSubgraphInput {
  resultDocIds: string[];
  matchScores: Map<string, number>;
  nodeCap: number; // default 100
}

export interface ResultSubgraphOutput {
  resultNodes: Array<{ id: string; path: string; title: string; score: number; communityId: string | null; folder: string }>;
  hubAnchors: Array<{ id: string; path: string; title: string; constituentCount: number }>;
  edges: Array<{ from: string; to: string; kind: 'reference' | 'semantic' | 'hub_constituent' }>;
  isolatedDocIds: string[];
  overflowCount: number; // N - nodeCap when trimmed
}

export async function buildResultSubgraph(deps: Deps, input: ResultSubgraphInput): Promise<ResultSubgraphOutput>;
```

Implementation:
- Trim `resultDocIds` to top `nodeCap` by `matchScores`.
- Query `MobiusEdgeRepo` for edges among trimmed set + hub anchors.
- Query `HubConstituentRepo.getHubsForMemberDoc` per result → collect hub anchor ids.
- Query `MobiusNodeRepo` for community_id, folder path, hub anchor metadata.
- Partition result docs into `resultNodes` vs `isolatedDocIds` (isolated = no edge to another result doc AND no hub anchor).
- Semantic edges included in `edges` with `kind: 'semantic'` so UI can toggle them.

**Blocks:** T4, T6.

**Done when:** unit test `test/search/resultSubgraph.test.ts` covers: happy path with 10 docs / 2 hubs; isolated-only result; sparse case (< 3 connected pairs); over-cap trimming; hub anchor pulled in even when hub_doc not in results.

### T2b · Heading Tree + Section Snippets Service (parallel, independent)

**Inputs:** spec §Recommended Heading Mode · Empty State / Filtered State / Section Range / Link Positions.

**Do:** create `src/service/search/heading/headingTree.ts`:

```ts
export interface HeadingTreeNode {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  title: string;
  lineStart: number;
  lineEnd: number;
  matchCount: number;
  children: HeadingTreeNode[];
  outboundLinkCount: number;
}

export interface HeadingTreeInput {
  filePath: string;
  queryText: string; // '' = empty state (full tree, all matchCount = 0)
}

export async function extractHeadingTree(deps: Deps, input: HeadingTreeInput): Promise<HeadingTreeNode[]>;
```

And `src/service/search/heading/sectionSnippets.ts`:

```ts
export interface SectionSnippet {
  line: number;
  text: string; // surrounding line text
  highlights: Array<{ start: number; end: number }>;
}

export async function getSectionSnippets(
  deps: Deps,
  filePath: string,
  section: { lineStart: number; lineEnd: number },
  queryText: string,
): Promise<SectionSnippet[]>;
```

Also: `getLinkPositions(filePath): Array<{ line: number; target: string; kind: 'outgoing' | 'backlink' }>` — outgoing from markdown parse, backlink optional (may be cheap via existing edge repo).

Reuse existing markdown/document loader helpers wherever possible.

**Blocks:** T5.

**Done when:** unit tests cover: no-query empty state (full tree, zero matches); query filters heading matchCount correctly; section range derivation matches spec §Section Range algorithm; snippets include line numbers and offsets for highlight.

### T3 · Result View Toggle Shell (parallel, small)

**Inputs:** T0 completed, spec §Entry Point.

**Do:**
1. Add `resultView: 'list' | 'graph'` to `vaultSearchStore` with a `setResultView` action. Default `'list'`.
2. Add `graphOverlaySemantic: boolean` (default false) and `graphOverlayFolder: boolean` (default false) toggles for the two optional overlays.
3. Create `ResultPaneHeader.tsx`:
   - Renders on top of the current result pane (above the list).
   - Right-side icon button using Lucide `Network` — clicking toggles `resultView`.
   - When `resultView === 'graph'`, header also shows two small toggles (Folder / Semantic) driven by the store fields above.
4. In `tab-VaultSearch.tsx`, wrap the current result render with a conditional: `resultView === 'graph' && quickSearchMode in ('all', 'heading') ? <ResultGraphView … /> : <existing list … />`.

**Blocks:** T4, T5 (both consume the toggle context).

**Done when:** toggle flips visibly; header renders in both `all` and `heading` modes; Esc from graph returns to list (wire via keyboard handler on the container).

### T4 · Result Graph View Content (parallel with T5, depends on T2a + T3)

**Inputs:** T2a + T3 completed. Spec §Result Graph View · everything.

**Do:** implement `ResultGraphView.tsx` (and its 6 sub-components under `components/result-graph/`).

Requirements per spec:
- Consume `buildResultSubgraph` output from T2a.
- Render layers with xyflow following `multi-lens-graph/` patterns (Background for community wash, custom nodes for hub anchors + result docs, custom edges).
- Community background: use a subtle color per `communityId`, one wash region per community.
- Folder groupings: dashed boundary layer, toggled via store field. First cut = top-level folder segment (see spec §Content Layers point 2).
- Hub anchor nodes: larger, distinct color, own React component.
- Result document nodes: uniform size, color intensity by match score. Selected node uses accent from Heading mode.
- Edges: single stroke for `reference`, dashed for `semantic` (only when overlay on).
- `IsolatedMatchesRail` on the right when `isolatedDocIds.length > 0`.
- `SparseFallbackBanner` when `< 3 connected pairs && < 2 shared hub anchors`.
- Node cap footer when `overflowCount > 0`.
- Interactions from spec §Interaction — pass click / dblclick / cmd+click handlers up via props. Hub anchor cmd+click calls `openHubGraphSubview` (T7).
- Query typing fades nodes: keep a stable node registry keyed by id, apply enter/exit fade via xyflow's `applyNodeChanges`.

**Blocks:** T7 (needs hub anchor click surface).

**Done when:** all AC lines under spec §Acceptance Criteria For Result Graph View pass manually; snapshot test on `ResultGraphView.tsx` render for a fixture from T2a covers happy path + sparse + isolated-only.

### T5 · Heading Mode UI (parallel with T4, depends on T2b + T3)

**Inputs:** T2b + T3 completed. Spec §Recommended Heading Mode · everything.

**Do:** implement `heading-mode/` components + keyboard hook.

Requirements per spec:
- `HeadingTree.tsx` renders left zone: full outline in document order, indented by level, dim non-match subtrees while keeping ancestor rows visible.
- `HeadingRow.tsx` shows icon marker + title + line range (`12-34` no `L` prefix) + match count.
- `SectionDetailPane.tsx` renders right zone: section title / range / total matches / snippet list. Snippets come from T2b's `getSectionSnippets`. Snippets never appear inline in the tree.
- `LinkPositionsFooter.tsx` optional footer showing outgoing (and optional backlink) positions grouped by section.
- `useHeadingModeKeyboard` handles: Up/Down (active row), Left/Right (expand/collapse), Enter (open active heading), Tab (switch focus to right pane). When focus in right pane: Up/Down cycles snippets, Enter opens snippet line.
- Empty state (query text after `#` is empty): full tree, zero match counts, right pane shows the currently active section's snippets with the query = no filter (or a hint "Type to search inside this document").
- Filtered state (`#方案`): applies match filtering.

**Blocks:** T8.

**Done when:** all AC lines under spec §Acceptance Criteria For Heading Mode pass manually.

### T6 · Hub Reference Inspector Block (parallel with T4/T5, depends on T2a partially)

**Inputs:** T2a completed for hub anchor + constituent lookup patterns.

**Do:**
1. `HubReferenceBlock.tsx`:
   - Takes a `selectedDocId` prop.
   - Calls `HubConstituentRepo.getHubsForMemberDoc(selectedDocId)`.
   - Enriches with hub display name + constituent count via `MobiusNodeRepo`.
   - Sorts by constituent affinity (fallback: hub curator score).
   - Renders top 5 + `+N more` expander.
   - Returns `null` when no hubs.
   - Row click: `openLinkText(hub_doc path)`.
   - Row Cmd+click / row-icon click: call `openHubGraphSubview(hub_node_id)` (T7 helper).
   - Middle click / Cmd+Enter: `openLinkText` with new-tab flag.
2. Wire the block at the bottom of the existing Inspector composition file, below Connected / Discovered / AI Graph entry.
3. Also render `HubReferenceBlock` when a node is selected inside `ResultGraphView` (Inspector state is shared; T6 just makes sure the block renders regardless of view).

**Blocks:** T7.

**Done when:** all AC lines under spec §Acceptance Criteria For Hub Reference pass manually.

### T7 · Hub Graph Subview Cross-Wire (small, depends on T4 + T6)

**Inputs:** T4 + T6 completed.

**Do:** create `useOpenHubGraphSubview.ts`:

```ts
export function useOpenHubGraphSubview() {
  return async (hubNodeId: string) => {
    // 1. Fetch constituent doc ids: HubConstituentRepo.getMembersForHub(hubNodeId)
    // 2. Set vaultSearchStore: quickSearchMode = 'all', query = ''
    // 3. Set an internal "scope" filter that pins the result set to those doc ids (add a `pinnedResultDocIds` field to store)
    // 4. Set resultView = 'graph'
    // 5. Focus the graph
  };
}
```

Both `HubReferenceBlock` and `HubAnchorNode` call this same hook. No new surface, no new Vault Search view type.

Also update `useVaultSearch.ts` (or the query pipeline) so that when `pinnedResultDocIds` is set, the result set is exactly those docs regardless of query text. Query text still filters within that pinned set.

**Blocks:** T8.

**Done when:** clicking a hub reference row with Cmd, or Cmd+clicking a hub anchor in Result Graph View, both land the user in Result Graph View with the hub's constituents as the visible node set.

### T8 · Integration, Smoke, Verification

**Inputs:** T0 through T7 completed.

**Do:**
1. Merge branches into one integration branch.
2. `npm run build` clean.
3. Manual smoke: for each AC bullet in spec §Acceptance Criteria For Heading Mode, §… Result Graph View, §… Hub Reference — verify by hand and check off.
4. `npm run test` clean, plus the new unit tests from T2a + T2b.
5. Load plugin in Obsidian, run through spec §Result Graph View · Interaction and §Heading Mode filtered state and §Hub Reference click behavior end-to-end.
6. Fix cross-track integration issues (Zustand state races, xyflow node id collisions, keyboard focus leaks between panes).

**Done when:** every AC checkbox in the spec is verifiable by demonstration.

## Dependency Diagram

```text
                     T0 (mode enum, blocking)
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
       T1 (delete)   T3 (shell)    (T2a, T2b run
                       │            in parallel from
        ┌──────────────┼──────────────┐   day 1, no dep on T0)
        ▼              ▼              ▼
       T4 (graph)    T5 (heading)  T6 (hub ref)
        │              │              │
        └──────────────┼──────────────┘
                       ▼
                      T7 (subview wire)
                       ▼
                      T8 (integration)
```

## Parallelism Waves

If dispatching to separate agents / worktrees:

**Wave 1 (day 1 kickoff, fully parallel):**
- T0 (small, blocking prep)
- T2a (backend service, no UI dep)
- T2b (backend service, no UI dep)

**Wave 2 (after T0 done):**
- T1 (delete, parallel with T3)
- T3 (result view toggle shell)

**Wave 3 (after Wave 2 + relevant Wave 1 services):**
- T4 (result graph content, needs T2a + T3)
- T5 (heading mode UI, needs T2b + T3)
- T6 (hub reference, needs T2a partially — can start earlier once `HubConstituentRepo` calls are validated)

**Wave 4:**
- T7 (subview wire, needs T4 + T6)

**Wave 5:**
- T8 (integration + AC verification)

At peak (Wave 3), three feature tracks (T4, T5, T6) can run in parallel because file ownership does not overlap.

## Integration Contracts (locked before dispatch)

Two contracts must exist and be agreed before T4/T5/T6 start, so their agents can build against a stable interface:

**Contract 1 — subgraph output shape.** `ResultSubgraphOutput` interface as defined in T2a. Committed to `src/service/search/graph/resultSubgraph.ts` as a type-only export first, then implementation follows.

**Contract 2 — heading tree output shape.** `HeadingTreeNode` interface as defined in T2b. Committed as type-only export first.

Both types committed to a stub file (with `throw new Error('stub')` implementations) as the very first commit of T2a / T2b, so T4 / T5 / T6 can import them immediately.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| `xyflow` layout on 100 nodes lags on lower-end machines | Result Graph View feels slow | Cap enforced strictly; test on the largest realistic result set during T4; profile before landing |
| Community grouping produces one giant community that dominates the background | Community wash loses signal | If any single community covers > 60% of visible nodes, fall back to no background wash for that view (add to T4 AC) |
| Renaming `inFile` → `heading` breaks user muscle memory (users used to `#` for keyword search) | Perceived regression | `#` prefix keeps working; behavior is a strict superset (still filters by keyword, additionally shows outline). No user-visible break. |
| Deleted `@folder` / `:line` parsers cause silent surprise for power users | Complaints | Explicit removal notice in changelog. No stealth compatibility path (spec §User Intent). |
| Hub-anchor "pull in" logic overloads the graph when result set covers many hubs | Visual clutter | Node cap covers total nodes including anchors; if anchor count > 20, keep top 20 by shared-result-count as anchors (add to T4 AC) |
| Isolated Matches rail invisible on narrow modal widths | Data hidden | Rail collapses to a badge "N isolated" that expands on click; add to T4 AC |

## Verification (link to spec)

All AC lives in the spec, not duplicated here. This plan is complete when every checkbox under the following spec sections passes:

- [`spec §Acceptance Criteria For Heading Mode`](../specs/2026-07-07-vault-search-heading-graph-navigation.md#acceptance-criteria-for-heading-mode)
- [`spec §Acceptance Criteria For Result Graph View`](../specs/2026-07-07-vault-search-heading-graph-navigation.md#acceptance-criteria-for-result-graph-view)
- [`spec §Acceptance Criteria For Hub Reference`](../specs/2026-07-07-vault-search-heading-graph-navigation.md#acceptance-criteria-for-hub-reference)

Plus the plan-specific AC embedded in each track's "Done when" line above.
