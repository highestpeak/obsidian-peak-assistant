/**
 * User prompt for graph-only refine. Full graph context so the model sees the whole picture.
 */
export const template = `# CONTEXT
- **Original query**: {{originalQuery}}
- **Analysis mode**: {{analysisMode}}

# CURRENT STATE (full graph — refine connections and add concept/tag layer)
<<<
{{currentResultSnapshot}}
>>>

# TASK
Call \`update_graph_nodes\` and/or \`update_graph_edges\` to:
- Add **concept** and **tag** nodes on top of existing file nodes.
- Add **edges** that express relationships (supports, contradicts, depends-on, part-of, sequence, etc.). Focus on **connections**, not just listing nodes.
- Normalize duplicate node ids.

Use \`search_analysis_context\` if you need to recall evidence before updating.

{{#if toolFormatGuidance}}
# TOOL FORMAT
{{toolFormatGuidance}}
{{/if}}

Execute the tools now.`;

export const expectsJson = false;
