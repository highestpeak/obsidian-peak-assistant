export const template = `# CONTEXTUAL DATA
- **Original User Query**: {{originalQuery}}
- **Current Analysis Mode**: {{analysisMode}}

{{#if attemptTimes > 0}}
Note: This is attempt {{attemptTimes}}. Last error: {{lastAttemptErrorMessage}}. 
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
1. Identify new **Nodes** (Files or Concepts).
2. Identify new **Edges** (Logical or structural links).
3. Ensure all new endpoints are registered nodes.
4. Prepare the delta update for the Graph UI.

# EXECUTION
Execute tool to update the graph now.`;

export const expectsJson = false;