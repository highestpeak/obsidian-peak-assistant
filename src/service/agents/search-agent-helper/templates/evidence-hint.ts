/**
 * Handlebars template for evidence hint passed to MindFlowAgent and DashboardUpdateAgent.
 * Summarizes latest reasoning, search results, Evidence Pack details, and key paths.
 */
export const template = `{{#if latestReasoning}}
[Latest reasoning]
{{{latestReasoning}}}

{{/if}}
{{#if hasSearchSummaries}}
[Search round summaries]
{{#each searchSummaries}}
{{{this}}}
{{#unless @last}}
---
{{/unless}}
{{/each}}

{{/if}}
{{#if hasCandidateNotes}}
[Candidate notes (path: why)]
{{#each candidateNotesLines}}
- {{{this}}}
{{/each}}

{{/if}}
{{#if hasNewContextNodes}}
[New context nodes]
{{#each newContextNodesLines}}
- {{{this}}}
{{/each}}

{{/if}}
{{#if hasKeyPaths}}
[Key paths from evidence]
{{#each keyPaths}}
{{{this}}}
{{/each}}
{{/if}}`;
