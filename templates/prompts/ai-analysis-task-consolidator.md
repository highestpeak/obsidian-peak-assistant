# User query: {{userQuery}}

# Dimensions to merge (full context):
{{#each dimensions}}
- [ID: {{id}}] Intent: {{intent_description}}
{{#if scope_constraint}}
  Scope: path={{scope_constraint.path}} | anchor={{scope_constraint.anchor_entity}}{{#if scope_constraint.tags}} | tags={{scope_constraint.tags}}{{/if}}
{{/if}}
{{#if retrieval_orientation}}
  Retrieval orientation: {{retrieval_orientation}}
{{/if}}
{{/each}}

# Recon reports (per dimension):
{{#each reports}}
## Dimension: {{dimension}}
Tactical summary: {{tactical_summary}}
Discovered leads:
{{#each discovered_leads}}
- {{this}}
{{/each}}
{{#if battlefield_assessment}}
Battlefield: density={{battlefield_assessment.search_density}} match={{battlefield_assessment.match_quality}}{{#if battlefield_assessment.suggestion}} | {{battlefield_assessment.suggestion}}{{/if}}
{{/if}}

{{/each}}

Output the consolidation result as JSON only: object with "consolidated_tasks" and "global_recon_insight".
