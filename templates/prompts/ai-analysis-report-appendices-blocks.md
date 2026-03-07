# USER'S ORIGINAL QUERY
{{originalQuery}}

{{#if userPersonaConfig}}
# USER PERSONA (adapt style implicitly)
appeal: {{userPersonaConfig.appeal}}
detail_level: {{userPersonaConfig.detail_level}}
{{/if}}

# CONFIRMED FACTS
{{#if (nonEmpty confirmedFactsList)}}
<<<
{{#each confirmedFactsList}}
Fact #{{inc @index}}: {{{this}}}
{{/each}}
>>>
{{else}}
(No confirmed facts yet; use search_analysis_context and/or content_reader on \`[[path]]\` explicitly mentioned in the block plan.)
{{/if}}

# BLOCK PLAN (follow faithfully; use exact block ids)
{{#each blockPlan}}
- {{{this}}}
{{/each}}

# DIRECTIVE
1. Infer writing strategy from user persona above; write in that style (Smart Brevity).
2. Cite [[path]] and Fact #N; mark unbounded claims as (speculation).
3. Use the exact block id from the plan in add_dashboard_blocks.
4. Follow Mermaid directive in plan when present; diagram type per [[peakassistant-when-to-use-which-diagram]].

{{#if errorRetryInfo.attemptTimes}}
# RETRY (attempt {{errorRetryInfo.attemptTimes}})
{{{errorRetryInfo.lastAttemptErrorMessages}}}
{{/if}}

{{#if toolFormatGuidance}}
# add_dashboard_blocks FORMAT
{{{toolFormatGuidance}}}
{{/if}}

Execute now.
