# USER'S ORIGINAL QUERY
{{originalQuery}}

{{#if confirmedFacts}}
# CONFIRMED FACTS (reference as Fact #1, Fact #2, … in blockPlan)
<<<
{{{confirmedFacts}}}
>>>
{{/if}}

{{#if lastReviewGapMessage}}
# REVIEW GAP (MUST ADDRESS IN THIS PLAN)
The previous dashboard round was deemed insufficient. You **must** produce a plan that addresses this. The **first** item in \`blockPlan\` **must** be: "REPAIR: [solve the specific issue stated below]".
<<<
{{{lastReviewGapMessage}}}
>>>
{{/if}}

{{#if currentDashboardBlocks}}
# CURRENT DASHBOARD BLOCKS (for gap diff)
Compare with confirmedFacts above: which facts are not yet visualized? Which blocks need update/removal?
<<<
{{{currentDashboardBlocks}}}
>>>
{{/if}}

{{#if verifiedPaths.length}}
# VERIFIED SOURCE PATHS
{{#each verifiedPaths}}
- {{this}}
{{/each}}
{{/if}}

# TASK
Produce a dashboard update plan. You **must** output \`blockPlan\`; each plan item must **describe exactly what to do** (what to add/refine, why, and success shape).

**Dashboard purpose**: Multi-angle, comprehensive analysis so the user gets diverse results (topics, sources, synthesis, diagrams, actions) in a single run.

**Gap rule**: Compare CONFIRMED FACTS with CURRENT DASHBOARD BLOCKS. If key numbers, conclusions, or decision points from the facts list are missing from the dashboard, you **must** add corresponding tasks to \`blockPlan\`. Do not reference any information not in CONFIRMED FACTS, VERIFIED PATHS, or CURRENT DASHBOARD.

Rules:
1. **blockPlan**: 3–12 items. When \`lastReviewGapMessage\` is set, **first** item must be "REPAIR: [specific issue]". Each item must cite target fact numbers (e.g. "Based on Fact #3 and #7"). Include at least: (a) one Mermaid diagram when evidence has structure, (b) one synthesis/conclusions instruction, (c) one action/TODO block instruction.
2. **topicsPlan**: **5–8 items max**; theme synthesis (aggregate facts into pillars), not isolated topics.
3. Ground every item only in CONFIRMED FACTS and current dashboard; do not invent entities or paths.
