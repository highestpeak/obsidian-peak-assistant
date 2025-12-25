/**
 * Topic extraction prompt for search results (JSON output).
 */
export const template = `Extract key topics/themes from the following search query, summary, sources, and knowledge graph.

Query: {{query}}

Summary:
{{summary}}

Sources:
{{#each sources}}
{{@index}}. {{title}} ({{path}})
{{/each}}

{{#if graphContext}}
Knowledge Graph (related concepts):
{{graphContext}}
{{/if}}

Please return a JSON array of topics, each with "label" (topic name) and "weight" (relevance score 0-10).
Example format: [{"label": "Machine Learning", "weight": 8}, {"label": "Neural Networks", "weight": 7}]

Return only the JSON array, nothing else.`;

export const expectsJson = true;
export const jsonConstraint = 'Return only the JSON array, nothing else.';
