## User goal

{{{userGoal}}}

## Critical constraints (must satisfy)

1. If the folder tree shows **any** sharper **non-top-level** path, include **at least one** such branch/child in `confirmedFolderHubCandidates`.
2. Do **not** output **only** top-level root folders as confirms when clearer subfolder anchors exist for the same themes.
3. **Never** put `structuralRole: container_only` in `confirmedFolderHubCandidates`.
4. Use top-level confirms **sparingly** and only with a **landing-layer** rationale (not “large / high degree” alone).

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

**Must:** include **at least one** entry in `confirmedFolderHubCandidates` (grounded paths only). If you reject broad or top-level folders, add **replacement** confirms for sharper child or branch anchors in the **same** JSON — do not submit rejections alone for major branches.

**Must:** if the tree already shows sharper non-top-level anchors, include **at least one non-top-level branch or child anchor** in `confirmedFolderHubCandidates`. Do **not** satisfy the minimum or breadth requirement by listing only broad top-level roots.

**Must not:** place any `container_only` path in `confirmedFolderHubCandidates`.

Merge **all** well-supported folder hubs into `confirmedFolderHubCandidates` this iteration; **prefer several branch- or child-level anchors** when the tree shows distinct domains or sub-branches (especially in early iterations). **Do not** meet breadth by listing multiple **broad top-level roots** unless each one has independent landing value per the system prompt. **Depth is not a filter** (parallel top-level domains can be valid), but **size/degree alone is never enough** — default to sharp branch anchors when they beat vague parents. Align with folder vs document vs cluster roles.

Return **only** the JSON object required by the schema.
