User question: {{userQuery}}

# Tasks to complete (read each path once; extract for all listed dimensions)

{{#each tasks}}
- **{{taskId}}** path: `{{path}}` | focus: {{extraction_focus}} | dimensions: {{#each relevant_dimension_ids}}{{id}}{{#unless @last}}, {{/unless}}{{/each}}
{{/each}}

For each path: use content_reader, then submit_evidence_pack with your packs. After you have finished a task (extracted evidence for that path), call **mark_task_completed** with that task's taskId (single param). Complete all tasks; you may call submit_evidence_pack and mark_task_completed multiple times until every task is done.
