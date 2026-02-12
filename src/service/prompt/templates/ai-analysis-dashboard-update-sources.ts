export const template = `# CONTEXTUAL DATA
- **Original User Query**: {{originalQuery}}
- **Current Analysis Mode**: {{analysisMode}}

{{#if attemptTimes > 0}}
Warning: This is attempt {{attemptTimes}}. Previous error: {{lastAttemptErrorMessage}}. 
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

# EXECUTION
Execute the 'update_sources' tool now.`;

export const expectsJson = false;