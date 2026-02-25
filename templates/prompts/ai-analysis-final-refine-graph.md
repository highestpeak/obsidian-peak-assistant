# CONTEXT
- **Original query**: {{originalQuery}}
- **Analysis mode**: {{analysisMode}}

# CURRENT STATE (full graph — refine connections and add concept/tag layer)
<<<
{{{currentResultSnapshot}}}
>>>

# TASK
Call \`update_graph_nodes\` and/or \`update_graph_edges\` to:
- Merge duplicate nodes: normalize ids so the graph stays coherent.
- Add **concept** and **tag** nodes on top of existing file nodes.
- Add **edges** that express relationships (supports, contradicts, depends-on, part-of, sequence, etc.). Focus on **connections**, not just listing nodes.
- Mark main path: set \`attributes.mindflow.main\` on edges along the primary evidence path.
- Preserve history: keep pruned/dead-end nodes but set \`attributes.mindflow.state=pruned\` so they are dimmed.

Use \`search_analysis_context\` if you need to recall evidence before updating.

{{#if toolFormatGuidance}}
# TOOL FORMAT
{{{toolFormatGuidance}}}
{{/if}}

Execute the tools now.