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
1. **Answer the user**: Using the query and the evidence above, state the **conclusion** and **brief recommendations** that resolve the user's intent. Lead with the answer. {{#if diagnosisJson}}Base your answer on the structured diagnosis; expand and cite evidence—do not just repeat it.{{/if}}
2. **Keep Summary concise but substantive**: Do **not** write long strategies/action plans, multi-day plans, or risk/metrics tables in the Summary (those go in Blocks). The Summary should contain: conclusion, tensions, **all key insights** (do not omit important evidence for brevity), and brief divergence. Depth and breadth of the synthesis matter.
3. **Include divergence**: Add at least one of: external perspective, contrarian/caution (risks in 1–2 sentences), or alternative routes. When evidence shows contradictions or blindspots, name them and suggest a challenge question (e.g. "What if X is wrong?"). Keep this short.
4. **Ground in evidence**: Where relevant, reference Sources or the Knowledge Graph; use wikilinks with **vault-relative path** only (e.g. \`[[folder/note.md]]\` or \`[[folder/note.md|alias]]\`). Do not use \`[[tag]]\` or \`[[#tag]]\`. If web search was used, **cite at least 2–3 URLs** (e.g. [source](url)). If evidence is thin, use **search_analysis_context** to look up the session, then cite what you find.
5. **Judge and close**: Note where evidence is strong or uncertain; end with one or two sentence-level next steps. Leave detailed plans and risk metrics to Blocks.

# OUTPUT LANGUAGE
Write the entire synthesis in the **same language as the user's original query**.

# TRIGGER
Deliver the final answer and recommendations now.`;

export const expectsJson = false;