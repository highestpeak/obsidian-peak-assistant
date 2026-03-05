# User query
{{userQuery}}

# Dimensions (from classifier)
{{#each dimensions}}
- [{{id}}] {{intent_description}}
{{/each}}

# This group (Group {{groupIndex}}) — files with extraction focus, priority, load, and dimension intents
{{#each files}}
- **{{path}}**
  - extraction_focus: {{extraction_focus}}
  - priority: {{priority}}{{#if task_load}} | task_load: {{task_load}}{{/if}}
  - dimensions: {{#each relevant_dimension_ids}}[{{id}}] {{intent}}{{#unless @last}}; {{/unless}}{{/each}}
{{/each}}

Output a JSON object with exactly two keys: `topic_anchor` (string) and `group_focus` (string). No other text.
