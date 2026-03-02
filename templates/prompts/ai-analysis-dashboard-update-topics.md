# USER'S ORIGINAL QUERY
{{originalQuery}}

# CONFIRMED FACTS (only evidence input; no raw session memory)
{{#if confirmedFacts}}
<<<
{{{confirmedFacts}}}
>>>
{{else}}
No confirmed facts yet. Use the topic plan and current topics below only; do not invent evidence.
{{/if}}

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
1. Identify key concepts from the analysis context; compare with "Current Topics" and prioritize new evidence.
2. **Topic labels**: Use verb-noun or high-density nouns (e.g. "X efficacy assessment", "X risk early-warning"); avoid "Analysis of X".
3. **Questions**: Output **only 3–5 global strategic questions** for the whole dashboard (not 3–4 per topic). Each question must be grounded in Confirmed Facts' contradictions or extensions (e.g. "Given Fact #2 on cost rise, how should …?"). Do not ask open-ended or filler questions; skip questions if evidence has no clear conflict or unfinished path.

{{#if toolFormatGuidance}}
# update_topics FORMAT
{{{toolFormatGuidance}}}
{{/if}}

Execute the update_topics tool now.