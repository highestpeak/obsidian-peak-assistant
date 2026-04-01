## User goal

{{{userGoal}}}

## Baseline excluded path prefixes (JSON)

Do not target these for exploration unless explicitly needed to justify exclusion.

```json
{{{baselineExcludedPrefixesJson}}}
```

## World metrics and budgets (JSON)

The JSON includes `agentPipelineBudget`: indexer-aligned caps (`indexBudgetRaw`, snapshot limits) plus `note` (field meanings and why sqrt scaling) and `llmGuidance` (soft hints: coverage ambition, suggested minimum confirmations per iteration when evidence exists — **not** a hard quota).

**How to use it when planning:** Use `limitTotal` and `coverageAmbition` to judge how **wide** your branch-level coverage should be this run. Larger budgets mean the vault can support **more parallel structural anchors** when the digest and tools support them. Do **not** treat numbers as a fixed count of hubs to output; treat them as **ambition vs cost** shared with the indexer. If many high-signal branches are still unexplored, plan further tool calls or another iteration rather than stopping early.

```json
{{{worldMetricsJson}}}
```

## Folder digest (sample)

{{{folderDigestMarkdown}}}

## Deep folder candidates (sample)

These are deeper paths highlighted so you do not stop too early at broad second-level folders.

{{{deepFolderDigestMarkdown}}}

---

**Plan step:** you may call tools (or skip them). The host will execute tool calls and pass results to the structured submit step.

Return short English reasoning and/or text: what to inspect, what tools you used (if any), and which evidence gaps matter for folder hubs.
