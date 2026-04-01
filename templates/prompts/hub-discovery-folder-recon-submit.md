## User goal

{{{userGoal}}}

## Critical constraints (must satisfy)

1. If the folder tree shows **any** sharper **non-top-level** path, include **at least one** such branch/child in `confirmedFolderHubCandidates`.
2. Do **not** output **only** top-level root folders as confirms when clearer subfolder anchors exist for the same themes.
3. **Never** confirm **container-only / bucket** paths — use `rejectedFolderPaths` (optional `rejectionKind: container_only`).
4. Use top-level confirms **sparingly** and only with a **landing-layer** rationale (not “large / high degree / many subfolders” alone).
5. If several same-level folders are stronger **as a group** than as isolated hubs, use `folderNavigationGroups`.
6. Prefer the **deepest coherent landing point** supported by the evidence; do not stop at a broad second-level folder if a third-level or deeper child is clearly sharper.

## Iteration

{{{iteration}}}

## Agent pipeline budget (JSON)

Same `agentPipelineBudget` block as in the plan step (indexer-aligned limits + `note` + `llmGuidance`). Use it to align **confirmed** hubs and **should_stop** with vault-scale ambition — not as a rigid output count.

```json
{{{agentPipelineBudgetJson}}}
```

## Memory (JSON)

```json
{{{memoryJson}}}
```

## Full folder tree pages

{{{folderTreeMarkdown}}}

## Plan summary (reasoning + guidance)

{{{actionPlanMarkdown}}}

## Plan step assistant text (verbatim)

{{{actionOutputMarkdown}}}

## Tool results

{{{toolResultsMarkdown}}}

---

**Must:** include at least one **final navigation result** in this JSON: a grounded entry in `confirmedFolderHubCandidates`, a grounded `folderNavigationGroups` entry, or both. If you reject broad or top-level folders, add **replacement** confirms or a justified navigation group in the **same** JSON — do not submit rejections alone for major branches.

**Must:** if the tree already shows sharper non-top-level anchors, include **at least one non-top-level branch or child anchor** in `confirmedFolderHubCandidates`. Do **not** satisfy the minimum or breadth requirement by listing only broad top-level roots.

**Must not:** confirm paths that are mainly **containers, weak buckets, or messy catch-all folders** without independent landing value. Names like `mess`, `misc`, `tmp`, `archive`, `dump`, `resources`, and `inbox` are strong negative signals unless the evidence clearly proves otherwise.

Merge **all** well-supported final folder hubs into `confirmedFolderHubCandidates` this iteration; **prefer several branch- or child-level anchors** when the tree shows distinct domains or sub-branches (especially in early iterations). **Do not** meet breadth by listing multiple **broad top-level roots** unless each one has independent landing value per the system prompt. **Depth is not a filter** (parallel top-level domains can be valid), but **size/degree alone is never enough** — and neither is “many subfolders.” Prefer the **deepest path that is still a coherent destination**. Do not stop at a merely reasonable second-level folder when a third-level or deeper child is the real thematic landing point. Use **`landingLevel: both`** sparingly, only when the parent is itself a true destination with meaningful named child branches. Do **not** keep broad roots or parents in `confirmedFolderHubCandidates` just to indicate “the real landing point is deeper.” For those cases, either confirm the actual sharper child hubs or, when several same-level folders are only useful together, emit a **`folderNavigationGroups`** entry instead. If you reject an important broad theme and cannot yet ground a sharper replacement anchor, record the gap in `openQuestions` or `updatedCoverage.weakBranches` instead of silently dropping it. Each confirmed candidate must include **`landingLevel`** per the schema.

Return **only** the JSON object required by the schema.
