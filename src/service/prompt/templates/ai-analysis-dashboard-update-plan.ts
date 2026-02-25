/**
 * User prompt for dashboard update planner. Variables: DashboardUpdateContext.
 * Loop generation: dashboardBlocksSnapshot shows current blocks so the planner can refine.
 */
export const template = `# ANALYSIS CONTEXT
<<<
{{{agentMemoryMessage}}}
>>>

{{#if verifiedPaths.length}}
# VERIFIED SOURCE PATHS
{{#each verifiedPaths}}
- {{this}}
{{/each}}
{{/if}}

{{#if dashboardBlocksSnapshot}}
# CURRENT DASHBOARD BLOCKS (loop context—refine or add; avoid duplicating roles)
<<<
{{{dashboardBlocksSnapshot}}}
>>>
{{/if}}

# TASK
Produce a dashboard update plan. You **must** output \`blockPlan\`; each plan item must **describe exactly what to do** (what to add/refine, why, and success shape).

**Dashboard purpose**: Multi-angle, comprehensive analysis so the user gets diverse results (topics, sources, synthesis, diagrams, actions) in a single run.

Rules:
1. **blockPlan**: 3–12 items. Include at least: (a) one Mermaid diagram instruction when evidence has structure, (b) one synthesis/conclusions instruction, (c) one action/TODO block instruction.
2. **topicsPlan**: 5–15 items max; short topic anchors from evidence.
3. Ground every item in the analysis context above; do not invent entities or paths.
`;
