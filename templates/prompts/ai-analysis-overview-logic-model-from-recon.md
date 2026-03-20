# User query
{{userQuery}}

# Recon reports (per dimension)
{{#each reconReports}}
**Dimension D{{inc @index}} ({{this.dimension}})**
Summary: {{this.tactical_summary}}
Discovered leads (paths):
{{#each this.discovered_leads}}
- {{this}}
{{/each}}

{{/each}}

# Affinity graph summary
{{reconGraphSummary}}

{{#if repairHint}}
# Repair
{{{repairHint}}}
{{/if}}

Build the logic model from the recon reports and graph above. You may use content_reader or inspect_note_context to add detail from the vault. When done, call submit_overview_logic_model with the logic model JSON. Use array order for node identity (no node id field). At least one edge must have relation conflict or feedback.
