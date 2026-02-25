/**
 * User prompt for dashboard blocks update. Variables: DashboardBlockVariables & ErrorRetryInfo & toolFormatGuidance.
 * Use call_search_agent (rawSearchAgent) when you need to look up content from the vault.
 */
export const template = `# OBSERVATION
- **Analysis context** (latest messages):
<<<
{{{agentMemoryMessage}}}
>>>
Use get_analysis_message_by_index to fetch a specific message by 0-based index when needed.

# CONTEXT TOOLS (REQUIRED)
- **search_analysis_context**: Call 2–4 times before writing blocks. Query by keywords, topic names, or paths from Sources.
- **get_analysis_message_by_index**: Fetch full text of one message by 0-based index.
- **call_search_agent**: Use when you need to **look up content from the vault** (e.g. a concept, path, or question). Prefer searching over guessing—call_search_agent runs a real vault search.

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
0. **Gather context first**: Use search_analysis_context and get_analysis_message_by_index; use **call_search_agent** when you need to find or verify content in the vault.
1. **Plan then generate**: Decide block outline and order, then call add_dashboard_blocks (one by one or small batch).
2. **Answer-first + substantive**: Each MARKDOWN block must be substantive (2–4 paragraphs or 5+ detailed items with reasoning). Include evidence, quotes, or comparison. Avoid thin blocks.
3. **Type richness**: When evidence has process, flow, hierarchy, or multi-entity relationships, add at least 1 MERMAID block. Plus MARKDOWN and 1 ACTION_GROUP or TILE.
4. **No duplicate roles**: Do not add a block that duplicates an existing one. Use remove (removeId) then add to update.

{{#if errorRetryInfo.attemptTimes}}
# RETRY (attempt {{errorRetryInfo.attemptTimes}})
Last error: {{{errorRetryInfo.lastAttemptErrorMessages}}}. Fix and try again.
{{/if}}

{{#if toolFormatGuidance}}
# add_dashboard_blocks FORMAT
{{{toolFormatGuidance}}}
{{/if}}

Execute now.`;

export const expectsJson = false;
