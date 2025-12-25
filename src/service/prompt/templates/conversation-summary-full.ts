/**
 * Full conversation summary prompt (500-2000 characters).
 */
export const template = `Provide a comprehensive summary of this conversation (500-2000 characters). Include:
- Main topics discussed
- Key decisions made
- Actions taken or planned
- Important context or background

{{#if shortSummary}}
Previous short summary: {{shortSummary}}
{{/if}}

{{#if projectContext}}
Project context: {{projectContext}}
{{/if}}

Messages:
{{#each messages}}
{{role}}: {{content}}
{{/each}}

Provide a detailed summary.`;

export const expectsJson = false;
