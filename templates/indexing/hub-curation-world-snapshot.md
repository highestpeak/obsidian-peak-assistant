# Hub World Snapshot

Vault: {{vaultName}} · Date: {{currentDateLabel}}

## Candidates (top {{candidateCount}}, sorted by hub_graph_score desc)

| # | Path | graph | phys | org | sem | community |
|---|---|---|---|---|---|---|
{{#each candidates}}
| {{@index}} | `{{path}}` | {{hubGraphScore}} | {{hubPhysicalAuthorityScore}} | {{hubOrganizationalScore}} | {{hubSemanticCentralityScore}} | {{communityId}} |
{{/each}}

## Communities

{{#each communityMeta}}
- **{{communityId}}** ({{memberCount}} members, Q≈{{modularityContribution}}): reps = {{repsCsv}}
{{/each}}

## Existing hubs

{{#if existingHubs.length}}
| Path | Last generated | Stale? | User owned? |
|---|---|---|---|
{{#each existingHubs}}
| `{{path}}` | {{lastGeneratedAtHuman}} | {{isStale}} | {{userOwned}} |
{{/each}}
{{else}}
_(no existing hub docs — this is a first-time curation)_
{{/if}}

## Budget

- max iterations: {{budget.maxIterations}}
- candidate limit: {{budget.candidateLimit}}
