/**
 * User prompt for sources-only refine. Optional batch: refine only indices [start, end) (batch index+1 of total).
 */
export const template = `# CONTEXT
- **Original query**: {{originalQuery}}
- **Analysis mode**: {{analysisMode}}

{{#if sourcesBatch}}
# BATCH REFINE
You are refining **only** sources at indices **{{sourcesBatch.start}} to {{sourcesBatch.end}}** (batch **{{sourcesBatch.indexPlusOne}}** of **{{sourcesBatch.total}}**).
Return the **complete** sources list in \`update_sources\`: **modify only** the entries in this range; copy all other entries **unchanged** (same order, same content).
{{/if}}

# CURRENT STATE (sources to refine)
<<<
{{currentResultSnapshot}}
>>>

# TASK
Call \`update_sources\` **once** with the full list:
- Reorder by relevance (most relevant first).
- For **each** source set \`reasoning\` (≤100 words) and \`score\` (physical, semantic, average 0–100). Use \`search_analysis_context\` to justify. Do not leave scores at 0.
- Optionally set \`badges\` (e.g. "key", "relevant").

{{#if toolFormatGuidance}}
# TOOL FORMAT
{{toolFormatGuidance}}
{{/if}}

Execute the tool now.`;

export const expectsJson = false;
