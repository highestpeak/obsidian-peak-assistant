export const template = `# CONTEXTUAL DATA
- **Original User Query**: {{originalQuery}}
- **Current Analysis Mode**: {{analysisMode}}

{{#if errorRetryInfo.attemptTimes}}
Note: This is attempt {{errorRetryInfo.attemptTimes}}. Last error: {{errorRetryInfo.lastAttemptErrorMessages}}.
Check for orphaned edges or invalid node IDs.
{{/if}}

# LATEST EVIDENCE (New Graph Candidates)
<<<
{{recentEvidenceHint}}
>>>

# CURRENT GRAPH STATE
<<<
{{currentResultSnapshot}}
>>>

# INSTRUCTION
Analyze the "Latest Evidence" to identify new entities and their relationships to existing nodes.
1. Identify new **Nodes**: Use type \`file\` or \`document\` with **path** for every vault note/file (so they are openable); use type \`concept\` only for abstract ideas that are not a single file. Use human-readable labels (no snake_case or "node_xxx" slugs).
2. Identify new **Edges** (logical or structural links).
3. Ensure all new endpoints are registered nodes.
4. Prepare the delta update for the Graph UI.

# OUTPUT LANGUAGE
Use the same language as the user's original query for all node and edge labels.

{{#if toolFormatGuidance}}
# update_graph_nodes / update_graph_edges FORMAT
{{toolFormatGuidance}}

{{/if}}
# EXECUTION
Execute tool to update the graph now.`;

export const expectsJson = false;