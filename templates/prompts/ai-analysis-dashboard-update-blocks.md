# USER'S ORIGINAL QUERY
{{originalQuery}}

# CONFIRMED FACTS (only evidence source besides call_search_agent results)
Do not reference any information not in this list or in the results of \`call_search_agent\`. When a fact is too thin to support a block, use \`call_search_agent\` to fetch from the vault—do not invent or use other context.
<<<
{{{confirmedFacts}}}
>>>

# CONTEXT TOOLS
- **call_search_agent**: When Confirmed Facts do not provide enough material for a block (e.g. Fact #N is too brief), call this to search the vault. This is the only way to get more evidence—never fabricate.
- **search_analysis_context** / **get_analysis_message_by_index**: Optional; use only to retrieve prior summarized context by keyword or index when useful.

# BLOCK PLAN (follow faithfully)
{{#each blockPlan}}
- {{{this}}}
{{/each}}

# CURRENT DASHBOARD BLOCKS (refine or add; avoid duplicates)
{{#if currentDashboardBlocks}}
<<<
{{{currentDashboardBlocks}}}
>>>
{{/if}}

# DIRECTIVE
0. **Gather context first**: Use search_analysis_context and get_analysis_message_by_index; use **call_search_agent** when Confirmed Facts are insufficient. If Facts cannot support 3 paragraphs or a diagram, **must** call call_search_agent—never write "cannot conclude from existing materials."
1. **Plan then generate**: Decide block outline and order, then call add_dashboard_blocks (one by one or small batch).
2. **Citation strength**: Each MARKDOWN block must **explicitly bind at least 2 Confirmed Facts** (cite Fact #N). If a block cites only 1 Fact, it is too thin—either merge with another block or use call_search_agent to deepen evidence.
3. **Anti-thin structure**: Each MARKDOWN block must use a **three-part structure**: [Conclusion] + [Evidence / quotes] + [Logical inference]. Target **300–500 words per MARKDOWN block**. No block that is conclusion-only without evidence or inference.
4. **Type richness**: When evidence has process, flow, hierarchy, or multi-entity relationships, add at least 1 MERMAID block. Plus MARKDOWN and 1 ACTION_GROUP or TILE.
   - **MERMAID readability**: Keep labels **short**. **Max 15 nodes** per diagram; if logic is too complex, split in plan into two blocks.
   - **MERMAID logic**: Prefer diagrams that show **conflict**, **trade-off**, or **choice** (quadrantChart, flowchart with branches)—not just known linear flow.
5. **No duplicate roles**: Do not add a block that duplicates an existing one. Use remove (removeId) then add to update.

{{#if errorRetryInfo.attemptTimes}}
# RETRY (attempt {{errorRetryInfo.attemptTimes}})
Last error: {{{errorRetryInfo.lastAttemptErrorMessages}}}. Fix and try again.
{{/if}}

{{#if toolFormatGuidance}}
# add_dashboard_blocks FORMAT
{{{toolFormatGuidance}}}
{{/if}}

Execute now.