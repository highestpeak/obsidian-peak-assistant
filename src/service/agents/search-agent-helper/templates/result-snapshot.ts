/**
 * Handlebars template for the minified result snapshot used by the summary prompt.
 * Renders topics, sources, dashboard blocks, graph stats, and optional summary excerpt.
 */
export const template = `{{#if title}}
## Title
{{{title}}}
{{/if}}

## Topics
{{#each topics}}
- {{{label}}} (weight: {{weight}}){{#if suggestQuestionsLine}} | {{{suggestQuestionsLine}}}{{/if}}
{{else}}
(none)
{{/each}}

## Sources
{{#each sources}}
- [[{{{path}}}]] | {{{title}}} | {{{reasoningShort}}} | score: {{scoreAvg}}
{{else}}
(none)
{{/each}}

## Dashboard blocks
{{#each blocks}}
- {{{title}}} ({{renderEngine}}) {{{contentHint}}}{{#if itemsSummary}}: {{{itemsSummary}}}{{/if}}
{{else}}
(none)
{{/each}}

## Graph
Nodes: {{graphNodeCount}}, Edges: {{graphEdgeCount}}
{{#if keyNodesLine}}
Key: {{{keyNodesLine}}}
{{/if}}

{{#if summaryExcerpt}}
## Current summary (draft)
{{{summaryExcerpt}}}
{{/if}}`;
