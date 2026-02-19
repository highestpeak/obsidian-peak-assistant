export const template = `# CONTEXTUAL DATA
- **Original User Query**: {{originalQuery}}
- **Current Analysis Mode**: {{analysisMode}}

{{#if errorRetryInfo.attemptTimes}}
This is your {{errorRetryInfo.attemptTimes}}th attempt to update the topics. Last attempt error message: {{errorRetryInfo.lastAttemptErrorMessages}}.
Try your best to fix the error and update the topics.
{{/if}}

# WHAT YOU ARE GIVEN (and why)
- **Latest Evidence**: the newest signals since the last update. Use this to decide what changed and what must be reflected now.
- **Current Dashboard State**: the existing topics/questions. Use this to preserve continuity (refine, merge, reprioritize) instead of rewriting from scratch.
- **Execution Plan** (\`plan.topicsPlan\`): explicit task instructions from the planner. Follow it faithfully; it exists to keep the dashboard coherent across agents.

# Latest Evidence (Focus Here)
<<<
{{recentEvidenceHint}}
>>>

# CURRENT DASHBOARD STATE
<<<
{{currentResultSnapshot}}
>>>

{{#if plan.topicsPlan}}
# EXECUTION PLAN (follow faithfully)
{{#each plan.topicsPlan}}
- {{this}}
{{/each}}
{{/if}}

# INSTRUCTION
Analyze the "Latest Evidence" provided above. Your task is to:
1. Identify key concepts that have emerged in this iteration of the analysis.
2. Compare them with the "Current Dashboard State". If the new evidence provides more depth or correction, prioritize the new data.
3. Generate a set of succinct, professional Topic labels.
4. Generate 3-4 predictive questions that will guide the user to the next logical step of their "Original User Query".

{{#if toolFormatGuidance}}
# update_topics FORMAT
{{toolFormatGuidance}}

{{/if}}
# EXECUTION
Execute the 'update_topics' tool now.`;

export const expectsJson = false;
