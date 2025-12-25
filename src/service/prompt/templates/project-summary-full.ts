/**
 * Full project summary prompt (500-2000 characters).
 */
export const template = `Provide a comprehensive project summary (500-2000 characters) including:
- Project goals and scope
- Key conversations and their outcomes
- Resources and materials
- Current status and next steps

{{#if shortSummary}}
Previous short summary: {{shortSummary}}
{{/if}}

Conversations:
{{#each conversations}}
- {{title}}{{#if shortSummary}}: {{shortSummary}}{{/if}}{{#if fullSummary}}
  Details: {{fullSummary}}{{/if}}
{{/each}}

{{#if resources}}
Resources:
{{#each resources}}
- {{title}} ({{source}}){{#if shortSummary}}: {{shortSummary}}{{/if}}
{{/each}}
{{/if}}

Provide a detailed project summary.`;

export const expectsJson = false;
