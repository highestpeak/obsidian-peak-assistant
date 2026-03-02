# USER'S ORIGINAL QUERY
{{originalQuery}}

{{#if confirmedFacts}}
# CONFIRMED FACTS (gold standard — only reference for truth)
Every block claim must be traceable to a Fact #N. If a fact is missing from the dashboard, call need_more_dashboard_blocks with: "Missing Fact: #N (theme); Recommendation: <block type>."
<<<
{{{confirmedFacts}}}
>>>
{{/if}}

{{#if errorRetryInfo.attemptTimes}}
# RETRY (attempt {{errorRetryInfo.attemptTimes}})
Last error: {{{errorRetryInfo.lastAttemptErrorMessages}}}. Fix and try again.
{{/if}}

# CURRENT BLOCKS (snapshot)
<<<
{{{currentBlocksSnapshot}}}
>>>

# DIRECTIVE
1. **Coverage**: If confirmedFacts are provided, ensure no important fact is "forgotten"; otherwise call need_more_dashboard_blocks with "Missing Fact: #N (...); Recommendation: ...".
2. **Citation**: Blocks that should cite evidence but lack Fact #N references are non-compliant—flag or remove.
3. Identify duplicates or near-duplicates and remove them (use remove with removeId = that block's id).
4. Merge blocks that share the same theme; remove the redundant block by removeId.
5. If block count > 6, remove the **lowest information-density** block (least evidence/citations).
6. **Reorder** so the array follows inverted pyramid: synthesis first (index 0), then Mermaid/visual, then actions last.
7. Ensure final block count is 6–8. Output only the necessary add_dashboard_blocks operations (remove and/or add). Use block id from the snapshot for every removeId.

{{#if toolFormatGuidance}}
# add_dashboard_blocks FORMAT
{{{toolFormatGuidance}}}
{{/if}}

Execute the review now.