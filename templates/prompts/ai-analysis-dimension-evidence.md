Dimension: {{dimension.id}}
Intent: {{dimension.intent_description}}

User question: {{userQuery}}

Recon tactical summary:
{{report.tactical_summary}}

Discovered leads (use these paths; read only from here or scope):
{{#each report.discovered_leads}}
- {{this}}
{{/each}}
{{#if report.battlefield_assessment}}
Battlefield assessment: search_density={{report.battlefield_assessment.search_density}} match_quality={{report.battlefield_assessment.match_quality}}{{#if report.battlefield_assessment.suggestion}}; suggestion: {{report.battlefield_assessment.suggestion}}{{/if}}
{{/if}}
{{#if dimension.scope_constraint}}
{{#if dimension.scope_constraint.path}}
Scope path: {{dimension.scope_constraint.path}}
{{/if}}
{{#if dimension.scope_constraint.anchor_entity}}
Anchor: {{dimension.scope_constraint.anchor_entity}}
{{/if}}
{{/if}}

Collect 4–8 evidence packs. Use content_reader at most 6 times. Call submit_evidence_pack when done.
