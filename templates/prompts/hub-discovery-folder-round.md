## User goal

{{{userGoal}}}

## Context

Structured data for this round (metrics, pipeline budgets, `folderTreePage`, `coverageState`). Default formatting below uses `toJson`; override the template to present it differently.

```json
{{{toJson hubDiscoveryContext}}}
```

## Folder tree page (compact)

{{{folderTreePageMarkdown}}}

---

Respond with **only** the JSON object required by the schema (folder hub candidates, explore tasks, document hub leads, coverage assessment, findings summary).
