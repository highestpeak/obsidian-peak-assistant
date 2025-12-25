/**
 * Short conversation summary prompt (100-300 characters).
 */
export const template = `Summarize the following conversation in 1-3 sentences (100-300 characters). Focus on key topics, decisions, and actions.

{{#if projectContext}}
Project context: {{projectContext}}
{{/if}}

Messages:
{{#each messages}}
{{role}}: {{content}}
{{/each}}

Provide a concise summary that captures the essence of this conversation.`;

export const expectsJson = false;
