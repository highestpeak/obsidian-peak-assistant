# USER'S ORIGINAL QUERY
{{originalQuery}}

# OBSERVATION
- **Analysis context**: use this to decide what topics and questions to surface.

{{#if errorRetryInfo.attemptTimes}}
# RETRY (attempt {{errorRetryInfo.attemptTimes}})
Last error: {{{errorRetryInfo.lastAttemptErrorMessages}}}. Fix and try again.
{{/if}}

# TOPIC PLAN (follow faithfully)
{{#each topicPlan}}
- {{{this}}}
{{/each}}

# CURRENT TOPICS (refine or replace; preserve continuity)
{{#if currentTopics}}
<<<
{{{currentTopics}}}
>>>
{{/if}}

# INSTRUCTION
1. Identify key concepts from the analysis context.
2. Compare with "Current Topics" above. If new evidence adds depth or correction, prioritize the new data.
3. Generate succinct Topic labels and 3–4 predictive questions for the next step.

{{#if toolFormatGuidance}}
# update_topics FORMAT
{{{toolFormatGuidance}}}
{{/if}}

Execute the update_topics tool now.