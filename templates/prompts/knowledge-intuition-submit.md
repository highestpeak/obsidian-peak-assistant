## User goal

{{{userGoal}}}

## Vault scale (deterministic — use for entry point count)

{{{vaultScaleHintMarkdown}}}

## Iteration (1-based)

{{{iteration}}}

## Working memory (JSON)

```json
{{{memoryJson}}}
```

## Folder tree (for path grounding)

{{{folderTreeMarkdown}}}

## Top backbone edges (JSON, condensed)

```json
{{{backboneEdgesJson}}}
```

## Tool results (Markdown / JSON)

{{{toolResultsMarkdown}}}

---

Return **one JSON object** only (see system prompt): fields `findingsSummary`, optional `theme`, `partitions` (with `entryPaths`), `coreEntities` (with `whyItMatters`), `topology` (`from`/`to`/`relation` — each `relation` must be a **complete** short clause per system rules), `evolution`, `entryPoints` (count **N** from Vault scale), optional `openQuestions`, `should_stop`.
