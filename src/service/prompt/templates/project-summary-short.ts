/**
 * Short project summary prompt (100-300 characters).
 */
export const template = `Summarize this project in 1-3 sentences (100-300 characters) based on its conversations and resources.

Conversations:
{{#each conversations}}
- {{title}}{{#if shortSummary}}: {{shortSummary}}{{/if}}
{{/each}}

{{#if resources}}
Resources:
{{#each resources}}
- {{title}} ({{source}})
{{/each}}
{{/if}}

Provide a concise project summary.`;

export const expectsJson = false;
