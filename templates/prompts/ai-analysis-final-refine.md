# CONTEXT
- **Original query**: {{originalQuery}}
- **Analysis mode**: {{analysisMode}}

# CURRENT STATE (to refine)
<<<
{{{currentResultSnapshot}}}
>>>

{{#if refineMode}}
{{#if (eq refineMode "sources_only")}}
# RESTRICTION
You must **only** use the \`update_sources\` tool. Do not call \`update_graph_nodes\` or \`update_graph_edges\`.
{{/if}}
{{#if (eq refineMode "graph_only")}}
# RESTRICTION
You must **only** use \`update_graph_nodes\` and \`update_graph_edges\`. Do not call \`update_sources\`.
{{/if}}
{{/if}}

# INSTRUCTIONS
1. Call \`update_sources\` **once** with the full list:
   - **Reorder** by relevance (most relevant first; keep top sources).
   - For **each** source set \`reasoning\` (≤100 words; replace placeholder text with real relevance explanation) and \`score\` with \`physical\`, \`semantic\`, \`average\` (0–100). Use \`search_analysis_context\` to justify reasoning and estimate scores. Do not leave scores at 0.
   - Optionally set \`badges\` (e.g. "key", "relevant").
2. Call \`update_graph_nodes\` and/or \`update_graph_edges\` to add concept and tag nodes and edges on top of existing file nodes. Use edge types to express contradictions, conflicts, or support. Normalize duplicate ids.
Use \`search_analysis_context\` if you need to recall evidence before updating.

{{#if toolFormatGuidance}}
# TOOL FORMAT
{{{toolFormatGuidance}}}
{{/if}}

Execute the tools now.