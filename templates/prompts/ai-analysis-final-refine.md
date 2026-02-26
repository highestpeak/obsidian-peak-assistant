# CONTEXT
- **Original query**: {{originalQuery}}
- **Analysis mode**: {{analysisMode}}
- **Agent memory message**: {{{agentMemoryMessage}}}

{{#if refineMode}}
{{#if (eq refineMode "sources_only")}}
# RESTRICTION
You must **only** use the \`update_sources\` tool.
{{/if}}
{{/if}}

# CURRENT SOURCES (to refine)
<<<
{{{sources}}}
>>>

# INSTRUCTIONS
1. Call \`update_sources\` **once** with the full list:
   - **Reorder** by relevance (most relevant first; keep top sources).
   - For **each** source set \`reasoning\` (≤100 words; replace placeholder text with real relevance explanation) and \`score\` with \`physical\`, \`semantic\`, \`average\` (0–100). Use \`search_analysis_context\` to justify reasoning and estimate scores. Do not leave scores at 0.
   - Optionally set \`badges\` (e.g. "key", "relevant").
Use \`search_analysis_context\` if you need to recall evidence before updating.

{{#if toolFormatGuidance}}
# TOOL FORMAT
{{{toolFormatGuidance}}}
{{/if}}

Execute the tools now.
