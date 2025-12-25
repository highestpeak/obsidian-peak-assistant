/**
 * AI search summary prompt for search results.
 */
export const template = `User question: {{query}}

{{#if webEnabled}}
Web search is enabled (if you have web results, incorporate them).
{{/if}}

{{#if userPreferences}}
User preferences: {{userPreferences}}
{{/if}}

Sources (snippets):
{{#each sources}}
- {{title}} ({{path}}){{#if snippet}}
  {{snippet}}{{/if}}
{{/each}}

{{#if graphContext}}
Knowledge Graph (related concepts):
{{graphContext}}
{{/if}}

Task: Provide a concise, high-signal answer. Cite sources by file path when appropriate.`;

export const expectsJson = false;
