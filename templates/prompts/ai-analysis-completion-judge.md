# COMPLETION JUDGE

## User Query
{{originalQuery}}

## MindFlow Progress
- estimatedCompleteness: {{estimatedCompleteness}}%
- statusLabel: {{statusLabel}}
- goalAlignment: {{goalAlignment}}
- critique: {{critique}}

## Current Result Snapshot (minified)
{{#if recentEvidenceHint}}
## Recent Evidence
{{{recentEvidenceHint}}}
{{/if}}

# TASK
Decide whether to stop the search loop. Return JSON: { "shouldStop": boolean, "why": string, "confidence": number, "missingItems": string[] }.