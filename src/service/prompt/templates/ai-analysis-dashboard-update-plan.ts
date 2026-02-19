/**
 * User prompt for dashboard update planner.
 * Context for generateObject; schema enforces output structure.
 */
export const template = `# CONTEXT
- **Original query**: {{originalQuery}}
- **Analysis mode**: {{analysisMode}}

# HOW TO READ THE INPUTS
- **Evidence hint**: a compressed slice of the latest tool outputs and signals. Treat it as the authoritative "what changed" feed.
- **Current snapshot**: a minified view of the current dashboard result. Use it to avoid duplication and to plan refinements rather than churn.

# EVIDENCE HINT
<<<
{{recentEvidenceHint}}
>>>

# CURRENT RESULT SNAPSHOT (minified)
<<<
{{currentResultSnapshotForSummary}}
>>>

# TASK
Produce a plan object for the orchestrator.

Rules:
1. Populate \`topicsPlan\`, \`sourcesPlan\`, \`graphPlan\`, \`blockPlan\` with short instruction strings. **Empty array = skip that agent**.
2. Keep each array small (0–6 items). Prefer the minimum plan that produces meaningful improvement.
3. Ground plan items in the evidence hint + current snapshot (do not invent entities or paths).
4. Make plan items task-focused (what to add/refine/remove + why + success shape).
5. **Block richness**: When \`blockPlan\` is non-empty, prefer including at least one instruction that asks for a **Mermaid diagram block** (flowchart, sequence, ER, or timeline) if the snapshot lacks one and the evidence supports structure (process, comparison, hierarchy).`;
