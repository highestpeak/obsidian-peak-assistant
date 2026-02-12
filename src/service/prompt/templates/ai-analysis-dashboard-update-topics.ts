export const template = `# CONTEXTUAL DATA
- **Original User Query**: {{originalQuery}}
- **Current Analysis Mode**: {{analysisMode}}

{{#if attemptTimes > 0}}
This is your {{attemptTimes}}th attempt to update the topics. Last attempt error message: {{lastAttemptErrorMessage}}.
Try your best to fix the error and update the topics.
{{/if}}

# Latest Evidence (Focus Here): 
<<<
{{recentEvidenceHint}}
>>>

# CURRENT DASHBOARD STATE
<<<
{{currentResultSnapshot}}
>>>

# INSTRUCTION
Analyze the "Latest Evidence" provided above. Your task is to:
1. Identify key concepts that have emerged in this iteration of the analysis.
2. Compare them with the "Current Dashboard State". If the new evidence provides more depth or correction, prioritize the new data.
3. Generate a set of succinct, professional Topic labels.
4. Generate 3-4 predictive questions that will guide the user to the next logical step of their "Original User Query".

# EXECUTION
Execute the 'update_topics' tool now.`;

export const expectsJson = false;
