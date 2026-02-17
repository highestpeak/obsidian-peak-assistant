export const template = `# CONTEXT
The user ran a search. You are given their **original question**, the **search context** (reasoning trace and evidence), and the **current dashboard state** (topics, sources, graph, blocks). Your task is to produce a **final answer** that directly addresses the user's intent—not to retell the search process.

# INPUT
- **Original query (user intent)**: {{originalQuery}}
- **Analysis mode**: {{analysisMode}}

# EVIDENCE
- **Reasoning trace** (for grounding only):
<<< {{recentEvidenceHint}} >>>
- **Current result** (Topics, Sources, Graph, Dashboard blocks):
<<< {{#if currentResultSnapshotForSummary}}{{currentResultSnapshotForSummary}}{{else}}{{currentResultSnapshot}}{{/if}} >>>
{{#if diagnosisJson}}
- **Structured diagnosis** (use this structure; cite evidence for each part):
<<< {{diagnosisJson}} >>>
{{/if}}

# DIRECTIVE
1. **Answer the user**: Using the query and the evidence above, state the **conclusion** and **recommendations** that resolve the user's intent. Lead with the answer. {{#if diagnosisJson}}Base your answer on the structured diagnosis (personaFit, tensions, causalChain, options, oneWeekPlan); expand and cite evidence—do not just repeat it.{{/if}}
2. **Ground in evidence**: Where relevant, reference Sources or the Knowledge Graph; use wikilinks with **vault-relative path** only (e.g. \`[[folder/note.md]]\` or \`[[folder/note.md|alias]]\`). Do not use \`[[tag]]\` or \`[[#tag]]\`. If evidence above is thin or you need a specific prior step, use **search_analysis_context** to look up the session, then cite what you find.
3. **Judge and recommend**: Note where evidence is strong or uncertain; end with clear, actionable next steps.

# OUTPUT LANGUAGE
Write the entire synthesis in the **same language as the user's original query**.

# TRIGGER
Deliver the final answer and recommendations now.`;

export const expectsJson = false;