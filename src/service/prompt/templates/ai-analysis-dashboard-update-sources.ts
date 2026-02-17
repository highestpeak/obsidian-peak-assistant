export const template = `# CONTEXTUAL DATA
- **Original User Query**: {{originalQuery}}
- **Current Analysis Mode**: {{analysisMode}}

{{#if errorRetryInfo.attemptTimes}}
Warning: This is attempt {{errorRetryInfo.attemptTimes}}. Previous error: {{errorRetryInfo.lastAttemptErrorMessages}}.
Strictly validate the source format before retrying.
{{/if}}

# LATEST EVIDENCE (Reference for New Sources)
<<<
{{recentEvidenceHint}}
>>>

# CURRENT DASHBOARD STATE (Existing Sources)
<<<
{{currentResultSnapshot}}
>>>

# INSTRUCTION
Analyze the "Latest Evidence" for any new file paths, URLs, or document identifiers.
1. Extract unique identifiers for each source.
2. Match them against the existing "Dashboard State".
3. Update the list to ensure the user has a transparent view of where the information is coming from.
4. For each source, output **score** with physical, semantic, and average (0–100) when possible; if uncertain, use conservative estimates and keep average consistent with physical/semantic.

# OUTPUT LANGUAGE
Use the same language as the user's original query for title, reasoning, and badges.

{{#if toolFormatGuidance}}
# update_sources FORMAT
{{toolFormatGuidance}}

{{/if}}
# EXECUTION
Execute the 'update_sources' tool now.`;

export const expectsJson = false;