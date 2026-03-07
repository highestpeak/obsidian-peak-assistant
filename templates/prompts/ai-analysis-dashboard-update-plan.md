# USER'S ORIGINAL QUERY
{{originalQuery}}

{{#if confirmedFacts}}
# CONFIRMED FACTS (reference as Fact #1, Fact #2, … in blockPlan)
<<<
{{{confirmedFacts}}}
>>>
{{/if}}

{{#if reconBriefing}}
# RECON BRIEFING (recon view, not final conclusions—use for context only)
<<<
{{{reconBriefing}}}
>>>
{{/if}}

{{#if evidenceGroupIndex}}
# EVIDENCE TASK GROUP INDEX (topic_anchor, group_focus, key paths; input to evidence phase)
<<<
{{{evidenceGroupIndex}}}
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
Produce a **consulting-report style** dashboard plan: MECE pillars (Topics) and block plan with headline, chart type, Fact refs, and paragraph shape. Output \`blockPlan\` and \`topicsPlan\`.

**Dashboard purpose**: Executive-style report: synthesis first, then topics/pillars, then blocks (conclusions, evidence, diagrams, next actions), then sources. Prefer **MARKDOWN** for almost all blocks; use MERMAID only when structure is strong (flow, comparison, hierarchy).

**Gap rule**: Compare CONFIRMED FACTS with CURRENT DASHBOARD BLOCKS. If key numbers, conclusions, or decision points are missing, add tasks to \`blockPlan\`. Do not reference any information not in CONFIRMED FACTS, RECON BRIEFING, EVIDENCE TASK GROUP INDEX, VERIFIED PATHS, or CURRENT DASHBOARD.

Rules:
1. **topicsPlan**: **3–6 MECE pillars** (theme synthesis). Each item = one pillar that aggregates facts; not isolated topics.
2. **blockPlan**: 3–12 items. When \`lastReviewGapMessage\` is set, **first** item must be "REPAIR: [specific issue]". Each item must include: (a) **headline** (one conclusion sentence), (b) **chart type** if applicable (mermaid/table/compare), (c) **Fact refs** (e.g. "Fact #3, #7"), (d) **expected shape** (paragraph structure; avoid thin blocks). Prefer MARKDOWN; use MERMAID only when evidence has clear structure. **De-emphasize TILE/ACTION_GROUP**: use a single MARKDOWN "Next actions (action items)" block instead of ACTION_GROUP when possible.
3. Ground every item only in CONFIRMED FACTS, RECON BRIEFING, EVIDENCE TASK GROUP INDEX, and current dashboard; do not invent entities or paths.
