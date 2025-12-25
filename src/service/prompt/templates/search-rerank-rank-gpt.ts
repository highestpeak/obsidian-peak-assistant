/**
 * LLM rerank prompt for search results.
 */
export const template = `You are a search result reranker. Given a query and a list of documents, rank them by relevance.

Query: {{query}}

Documents:
{{#each documents}}
[{{index}}] {{text}}{{#if boostInfo}} [{{boostInfo}}]{{/if}}
{{/each}}

Please return the document indices in order of relevance (most relevant first), separated by commas.
Example format: 2,0,1,3

Only return the indices, nothing else.`;

export const expectsJson = false;
