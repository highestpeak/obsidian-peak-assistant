# USER'S ORIGINAL QUERY
{{originalQuery}}

# OVERVIEW MERMAID (already generated; for reference)
{{#if overviewMermaid}}
<<<
{{{overviewMermaid}}}
>>>
{{else}}
(Not yet generated.)
{{/if}}

# VERIFIED FACT SHEET (grouped by path; reference as Fact #1, Fact #2, …)
{{#if verifiedFactSheet}}
<<<
{{#each verifiedFactSheet}}
{{{this}}}
{{/each}}
>>>
{{/if}}

{{#if evidenceTaskGroups}}
# EVIDENCE TASK GROUPS (paths to read per group)
<<<
{{#each evidenceTaskGroups}}
- {{groupId}} | topic_anchor: {{topic_anchor}} | group_focus: {{group_focus}}
{{#if sharedContext}}
  sharedContext (excerpt): {{truncate sharedContext 300}}
{{/if}}
  paths: {{#each tasks}}{{path}}{{#unless @last}}, {{/unless}}{{/each}}

{{/each}}
>>>
{{/if}}

# TASK
Produce the full report plan **section by section**. Call `submit_phase_and_get_next_to_plan` for each section in order. Each call must include:
- **phaseId**: the current section id (e.g. intent_insight, overview_mermaid, topics, body_scqa, body_insight_pillar, appendices, actions_todo_list).
- **planMarkdown**: the plan for this section (purpose, output shape, evidence binding, word/structure constraints, citation format). For body blocks include blockId, title, role, paragraph skeleton, chart/table shape, risks hint.
- **dependencies** (optional): blockIds, Fact #N, or SourceIDs this section depends on.
- **status**: "final" when the plan for this section is complete.

Continue until the tool returns `done: true`.
