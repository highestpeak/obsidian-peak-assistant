## Goal (user query)

{{userQuery}}

---

## Evidence (fact lines: claim, path, quote)

Use these to build clusters and conflicts. Do not add information that is not in the evidence.

```
{{evidenceSummary}}
```

---

## Source map (path_or_url list)

{{sourceMap}}

---

{{#if lastRawSearchDelta}}
## Last RawSearch loop (for context)

{{lastRawSearchDelta}}
{{/if}}

---

Produce the Knowledge Panel: cluster by theme, mark conflicts where sources disagree, list open questions, fill panel_stats. Then call **submit_knowledge_panel** once with the complete JSON.
