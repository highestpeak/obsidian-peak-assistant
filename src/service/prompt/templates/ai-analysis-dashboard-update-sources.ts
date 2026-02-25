export const template = `# CONTEXTUAL DATA
- **Original User Query**: {{originalQuery}}
- **Current Analysis Mode**: {{analysisMode}}

{{#if errorRetryInfo.attemptTimes}}
Warning: This is attempt {{errorRetryInfo.attemptTimes}}. Previous error: {{{errorRetryInfo.lastAttemptErrorMessages}}}.
Strictly validate the source format before retrying.
{{/if}}

# WHAT YOU ARE GIVEN (and why)
- **Latest Evidence**: where new concrete origins can appear (vault paths, URLs, doc identifiers). You must only use origins that are explicitly present here (or in tool outputs referenced here).
- **Current Dashboard State**: the existing source registry. Use it to dedupe and update instead of creating near-duplicates.
- **Execution Plan** (\`plan.sourcesPlan\`): planner instructions for what sources to add/reorder/highlight. Follow it faithfully to keep cross-agent consistency.

# LATEST EVIDENCE (Reference for New Sources)
<<<
{{{recentEvidenceHint}}}
>>>

# CURRENT DASHBOARD STATE (Existing Sources)
<<<
{{{currentResultSnapshot}}}
>>>

{{#if plan.sourcesPlan}}
# EXECUTION PLAN (follow faithfully)
{{#each plan.sourcesPlan}}
- {{{this}}}
{{/each}}
{{/if}}

# INSTRUCTION
Analyze the "Latest Evidence" for any new file paths, URLs, or document identifiers.
1. **Path rule (critical)**: For each source, the \`path\` field MUST be copy-pasted exactly from the "Latest Evidence" section above—either from the \`[Key paths from evidence]\` list or from \`search_analysis_context\` tool output. The path MUST include the file extension (e.g. \`.md\`). Do NOT guess or invent extensions; if you do not see the exact path in evidence, call \`search_analysis_context\` to find the real path first.
2. Extract unique identifiers for each source.
3. Match them against the existing "Dashboard State".
4. Update the list to ensure the user has a transparent view of where the information is coming from.
5. For each source, output **score** with physical, semantic, and average (0–100) when possible; if uncertain, use conservative estimates and keep average consistent with physical/semantic.

# OUTPUT LANGUAGE
Use the same language as the user's original query for title, reasoning, and badges.

{{#if toolFormatGuidance}}
# update_sources FORMAT
{{{toolFormatGuidance}}}

{{/if}}
# EXECUTION
Execute the 'update_sources' tool now.`;

export const expectsJson = false;