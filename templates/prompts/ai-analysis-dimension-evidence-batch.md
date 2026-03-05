User question: {{userQuery}}

{{#if showSchedulerContext}}
# Scheduler-provided context (you may disagree)
- **Topic (preliminary):** {{topicAnchor}}
- **Focus for this group:** {{groupFocus}}
{{#if groupSharedContext}}
{{{groupSharedContext}}}
{{/if}}
If after reading the full file you find it does **not** match this theme, prefer the file's actual content and in your facts note: "Deviates from expected theme; actually discusses ...".
{{/if}}

# Tasks to complete (read each path once; extract for all listed dimensions)

{{#each tasks}}
- **{{taskId}}** path: `{{path}}` | focus: {{extraction_focus}} | dimensions: {{#each relevant_dimension_ids}}{{id}}{{#unless @last}}, {{/unless}}{{/each}}
{{/each}}

For each path: use content_reader, then submit_evidence_pack with your packs. After you have finished a task (extracted evidence for that path), call **mark_task_completed** with that task's taskId (single param). Complete all tasks; you may call submit_evidence_pack and mark_task_completed multiple times until every task is done.
