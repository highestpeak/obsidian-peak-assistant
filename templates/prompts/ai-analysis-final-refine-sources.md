# CONTEXT

Use the context to better understand the user's query and purpose of the analysis.

- **Original query**: {{originalQuery}}
- **Evidence (verified facts)**:
<<<
{{{evidencePack}}}
>>>

# CURRENT SOURCES (score these)
<<<
{{{sources}}}
>>>

# TASK
Call \`update_sources\` **once** with the full list:
- Reorder by relevance (most relevant first).
- For **each** source set \`reasoning\` (≤100 words) and \`score\` (physical, semantic, average 0–100). Use \`search_analysis_context\` to justify.
- Optionally set \`badges\` (e.g. "key", "relevant").

{{#if toolFormatGuidance}}
# TOOL FORMAT
{{{toolFormatGuidance}}}
{{/if}}

Execute the tool now.